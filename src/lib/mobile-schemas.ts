import { z } from "zod";
import {
  DataUri,
  DateLike,
  LatLng,
  NonEmptyString,
  OptionalString,
} from "./validation";

export const LoginSchema = z.object({
  username: NonEmptyString.max(64),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const JobsListQuerySchema = z.object({
  date: z.string().trim().optional(),
  scope: OptionalString,
  driver_id: OptionalString,
  status: OptionalString,
});

export const BillsListQuerySchema = z.object({
  doc_no: OptionalString,
  bill_no: OptionalString,
  type: OptionalString,
});

export const FuelListQuerySchema = z.object({
  from: DateLike,
  to: DateLike,
  limit: z
    .string()
    .trim()
    .regex(/^\d+$/, "must be a number")
    .optional(),
  user_code: OptionalString,
});

export const FcmTokenSaveSchema = z.object({
  token: NonEmptyString.max(4096),
  platform: OptionalString,
});

export const FcmTokenDeleteSchema = z.object({
  token: OptionalString,
});

// Job actions — discriminated union so each action only validates the fields
// it actually consumes. Adding a new action is a single new branch here.
const ReceiveJob = z.object({
  action: z.literal("receive"),
  doc_no: NonEmptyString,
});
const PickupBill = z.object({
  action: z.literal("pickup_bill"),
  bill_no: NonEmptyString,
});
// Receive goods at the customer's yard ('__CUSTOMER__' pickup). Photo +
// signature are uploaded separately via attach_bill_image (pickup kinds).
const ReceiveCustomerBill = z.object({
  action: z.literal("receive_customer_bill"),
  bill_no: NonEmptyString,
  lat: LatLng,
  lng: LatLng,
});
// Supervisor approves a trip so the driver can start dispatching. Gated to
// supervisor roles in the route (not driver-scoped like the other actions).
const ApproveJob = z.object({
  action: z.literal("approve_job"),
  doc_no: NonEmptyString,
});
const StartDispatch = z.object({
  action: z.literal("start_dispatch"),
  doc_no: NonEmptyString,
  miles_start: NonEmptyString,
  lat: LatLng,
  lng: LatLng,
});
const CheckinBill = z.object({
  action: z.literal("checkin_bill"),
  bill_no: NonEmptyString,
  lat: LatLng,
  lng: LatLng,
});
const CompleteBill = z.object({
  action: z.literal("complete_bill"),
  bill_no: NonEmptyString,
  items: z.array(z.record(z.string(), z.unknown())).default([]),
  comment: OptionalString,
  lat: LatLng,
  lng: LatLng,
  lat_end: LatLng,
  lng_end: LatLng,
  // COD (Module B) — cash/transfer collected at delivery (optional).
  collected_amount: z.coerce.number().nonnegative().max(10000000000).nullish(),
  payment_method: OptionalString, // cash | transfer | none
});
const CancelBill = z.object({
  action: z.literal("cancel_bill"),
  bill_no: NonEmptyString,
  comment: OptionalString,
  lat: LatLng,
  lng: LatLng,
  lat_end: LatLng,
  lng_end: LatLng,
  // Module D — standardized reason + optional reschedule date (YYYY-MM-DD).
  reason_code: OptionalString,
  reschedule_date: OptionalString,
});
const RevertCompleteBill = z.object({
  action: z.literal("revert_complete_bill"),
  bill_no: NonEmptyString,
});
const EditCompleteBill = z.object({
  action: z.literal("edit_complete_bill"),
  bill_no: NonEmptyString,
  items: z.array(z.record(z.string(), z.unknown())).default([]),
  comment: OptionalString,
});
const CompleteJob = z.object({
  action: z.literal("complete_job"),
  doc_no: NonEmptyString,
  miles_end: NonEmptyString,
  lat: LatLng,
  lng: LatLng,
});
const SaveTravelHistory = z.object({
  action: z.literal("save_travel_history"),
  doc_no: NonEmptyString,
  lat: NonEmptyString,
  lng: NonEmptyString,
});
const AttachJobImage = z.object({
  action: z.literal("attach_job_image"),
  doc_no: NonEmptyString,
  kind: z.enum(["start", "end"]),
  image_data: DataUri,
});
const AttachBillImage = z.object({
  action: z.literal("attach_bill_image"),
  bill_no: NonEmptyString,
  kind: z.enum([
    "primary",
    "delivery",
    "signature",
    // Proof-of-pickup captured at the customer's yard ('__CUSTOMER__' receive).
    "pickup",
    "pickup_signature",
  ]),
  image_data: DataUri,
  // Edit-mode flag: when true on a `delivery` upload, the server wipes
  // existing delivery images for this bill before inserting the new one.
  // Sent on the first attach call of an edit batch; subsequent calls
  // append as usual. No-op for `primary` / `signature` (those overwrite).
  replace: z.boolean().optional(),
});
const FuelRefill = z.object({
  action: z.literal("fuel_refill"),
  // The route injects user_code from the authenticated session, so it's
  // optional in the body — requiring it here would 400 a perfectly valid
  // refill just because the client omitted a field the server overrides.
  user_code: OptionalString,
  driver_name: OptionalString,
  car: OptionalString,
  doc_no: OptionalString,
  liters: z.coerce.number().nonnegative().max(1000000),
  amount: z.coerce.number().nonnegative().max(10000000000),
  odometer: z.coerce.number().nonnegative().max(10000000).nullish(),
  station: OptionalString,
  note: OptionalString,
  image_data: DataUri,
  lat: LatLng,
  lng: LatLng,
});

export const JobActionSchema = z.discriminatedUnion("action", [
  ReceiveJob,
  PickupBill,
  ReceiveCustomerBill,
  ApproveJob,
  StartDispatch,
  CheckinBill,
  CompleteBill,
  CancelBill,
  RevertCompleteBill,
  EditCompleteBill,
  CompleteJob,
  SaveTravelHistory,
  AttachJobImage,
  AttachBillImage,
  FuelRefill,
]);
export type JobActionInput = z.infer<typeof JobActionSchema>;

export const PublicTrackSchema = z.object({
  bill_no: NonEmptyString.max(64),
});

// High-frequency device location ingest. The driver app collects its GPS
// position every ~3s and pushes a buffered batch (one DB write per request
// instead of ~20/min/driver). Coordinates are required here — unlike the
// nullish `LatLng` used for one-off event lat/lng — because a point with no
// position is meaningless. `recorded_at` is the on-device capture time so
// points buffered while offline keep their real order/timestamp; omit it and
// the server stamps LOCALTIMESTAMP at insert.
const Coordinate = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "must be a number");
const RecordedAt = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
    "must be an ISO-8601 date-time"
  )
  .nullish()
  .transform((v) => (v ? v : undefined));

// Static-ish device identity sent once per batch and upserted into
// odg_tms_mobile_device. All fields optional — the app sends what the OS lets
// it read (modern Android restricts IMEI/SIM access, so those may be absent).
const DeviceInfo = z
  .object({
    model: OptionalString,
    os_version: OptionalString,
    app_version: OptionalString,
    carrier: OptionalString,
    sim_phone: OptionalString,
  })
  .nullish()
  .transform((v) => v ?? undefined);

export const LocationBatchSchema = z.object({
  doc_no: NonEmptyString.max(64),
  // Device identifier — same key the hardware GPS log uses, so a phone's track
  // and its tracker's track align. Optional because newer Android blocks IMEI
  // reads; points still store against doc_no without it.
  imei: OptionalString,
  device: DeviceInfo,
  points: z
    .array(
      z.object({
        lat: Coordinate,
        lng: Coordinate,
        recorded_at: RecordedAt,
        // Per-fix telemetry from the phone's GPS + radios. All optional.
        speed: OptionalString, // m/s or km/h — app's choice, stored verbatim
        heading: OptionalString, // degrees 0–360
        accuracy: OptionalString, // horizontal accuracy in meters
        battery: OptionalString, // percent 0–100
        signal: OptionalString, // network signal (dBm or bars — app's choice)
      })
    )
    // At 3s cadence, 1000 points is ~50 min of buffered travel per request —
    // a generous ceiling that still bounds payload + insert size.
    .min(1, "at least one point is required")
    .max(1000, "too many points in one batch"),
});
export type LocationBatchInput = z.infer<typeof LocationBatchSchema>;

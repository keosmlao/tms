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
});
const CancelBill = z.object({
  action: z.literal("cancel_bill"),
  bill_no: NonEmptyString,
  comment: OptionalString,
  lat: LatLng,
  lng: LatLng,
  lat_end: LatLng,
  lng_end: LatLng,
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
  kind: z.enum(["primary", "delivery", "signature"]),
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

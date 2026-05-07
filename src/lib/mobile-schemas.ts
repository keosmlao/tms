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
});
const FuelRefill = z.object({
  action: z.literal("fuel_refill"),
  user_code: NonEmptyString,
  driver_name: OptionalString,
  car: OptionalString,
  doc_no: OptionalString,
  liters: z.coerce.number().nonnegative().max(10000),
  amount: z.coerce.number().nonnegative().max(100000000),
  odometer: z.coerce.number().nonnegative().max(10000000).optional(),
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

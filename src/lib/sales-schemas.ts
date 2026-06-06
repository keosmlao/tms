import { z } from "zod";
import { NonEmptyString, OptionalString, DateLike } from "./validation";

// Schemas for the sales-facing "ເບີດບິນປະຈຳວັນ" (daily opened bills) page, where
// salespeople set a bill's delivery date + transport branch. These guard the
// web server actions in src/actions/tracking.ts — Server Functions are reachable
// via direct POST, so the action validates even though the UI also constrains.

// Query for the daily-opened-bills list. `date` is the bill-open day (YYYY-MM-DD).
export const SalesDailyBillsQuery = z.object({
  date: DateLike,
  search: OptionalString,
});
export type SalesDailyBillsQueryInput = z.infer<typeof SalesDailyBillsQuery>;

// Save the delivery date + transport branch for one bill. Both are optional so a
// salesperson can set either alone, or clear them (empty/null → undefined).
export const SalesScheduleSave = z.object({
  bill_no: NonEmptyString,
  scheduled_date: DateLike,
  transport_code: OptionalString,
});
export type SalesScheduleSaveInput = z.infer<typeof SalesScheduleSave>;

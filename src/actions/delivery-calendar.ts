"use server";

import { requireSession } from "./_helpers";
import { coerceMonthToFixedYear, coerceDateToFixedYear } from "@/lib/fixed-year";
import {
  getDeliveryCalendar as svcGetDeliveryCalendar,
  getDeliveryCalendarDay as svcGetDeliveryCalendarDay,
} from "@/queries/delivery-calendar.js";

// Month overview of planned vs delivered bills. Available to every logged-in
// user (including sales) — no branch scoping; the calendar shows all branches.
export async function getDeliveryCalendar(month: string) {
  await requireSession();
  return svcGetDeliveryCalendar(coerceMonthToFixedYear(month));
}

export async function getDeliveryCalendarDay(date: string) {
  await requireSession();
  return svcGetDeliveryCalendarDay(coerceDateToFixedYear(date));
}

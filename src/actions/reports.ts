"use server";

import { requireSession } from "./_helpers";
import {
  getReportDaily as svcGetReportDaily,
  getReportByDriver as svcGetReportByDriver,
  getReportByCar as svcGetReportByCar,
  getReportByBill as svcGetReportByBill,
  getReportMonthlyCar as svcGetReportMonthlyCar,
  getReportMonthlyDriver as svcGetReportMonthlyDriver,
  getReportMonthlyDelivery as svcGetReportMonthlyDelivery,
  getMonthlyDeliveryKpi as svcGetMonthlyDeliveryKpi,
  getReportPendingDaily as svcGetReportPendingDaily,
  getReportDeliveredDaily as svcGetReportDeliveredDaily,
  getReportCancelledDaily as svcGetReportCancelledDaily,
  getReportDailyActivity as svcGetReportDailyActivity,
  getAttemptDeliveryItems as svcGetAttemptDeliveryItems,
} from "@/queries/reports.js";

export async function getReportDaily(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetReportDaily(s, fromDate, toDate);
}

export async function getReportByDriver(
  fromDate: string,
  toDate: string,
  driverId?: string
) {
  const s = await requireSession();
  return svcGetReportByDriver(s, fromDate, toDate, driverId);
}

export async function getReportByCar(
  fromDate: string,
  toDate: string,
  carId?: string
) {
  const s = await requireSession();
  return svcGetReportByCar(s, fromDate, toDate, carId);
}

export async function getReportByBill(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetReportByBill(s, fromDate, toDate);
}

export async function getReportMonthlyCar(monthly: string) {
  const s = await requireSession();
  return svcGetReportMonthlyCar(s, monthly);
}

export async function getReportMonthlyDriver(monthly: string) {
  const s = await requireSession();
  return svcGetReportMonthlyDriver(s, monthly);
}

export async function getReportMonthlyDelivery(monthly: string) {
  const s = await requireSession();
  return svcGetReportMonthlyDelivery(s, monthly);
}

export async function getMonthlyDeliveryKpi(monthly: string) {
  const s = await requireSession();
  return svcGetMonthlyDeliveryKpi(s, monthly);
}

export async function getReportPendingDaily(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetReportPendingDaily(s, fromDate, toDate);
}

export async function getReportDeliveredDaily(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetReportDeliveredDaily(s, fromDate, toDate);
}

export async function getReportCancelledDaily(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetReportCancelledDaily(s, fromDate, toDate);
}

export async function getReportDailyActivity(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetReportDailyActivity(s, fromDate, toDate);
}

export async function getAttemptDeliveryItems(docNo: string, billNo: string) {
  await requireSession();
  return svcGetAttemptDeliveryItems(docNo, billNo);
}

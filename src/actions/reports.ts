"use server";

import { requireSession } from "./_helpers";
import {
  getReportDaily as svcGetReportDaily,
  getReportByDriver as svcGetReportByDriver,
  getReportByCar as svcGetReportByCar,
  getReportByBill as svcGetReportByBill,
  getReportByTrip as svcGetReportByTrip,
  getReportTripBills as svcGetReportTripBills,
  getReportMonthlyCar as svcGetReportMonthlyCar,
  getReportMonthlyDriver as svcGetReportMonthlyDriver,
  getReportMonthlyDelivery as svcGetReportMonthlyDelivery,
  getMonthlyDeliveryKpi as svcGetMonthlyDeliveryKpi,
  getDeliveryPerformance as svcGetDeliveryPerformance,
  getReportPendingDaily as svcGetReportPendingDaily,
  getReportDeliveredDaily as svcGetReportDeliveredDaily,
  getReportCancelledDaily as svcGetReportCancelledDaily,
  getReportDailyActivity as svcGetReportDailyActivity,
  getReportDailyActivityBills as svcGetReportDailyActivityBills,
  getReportDailyActivityItems as svcGetReportDailyActivityItems,
  getReportDailyDepartment as svcGetReportDailyDepartment,
  getAttemptDeliveryItems as svcGetAttemptDeliveryItems,
} from "@/queries/reports.js";

// dateField: "logistic" = ກັ່ນຕອງດ້ວຍວັນຈັດສົ່ງ, "dispatch" = ດ້ວຍວັນຈັດຖ້ຽວ
export async function getReportDaily(
  fromDate: string,
  toDate: string,
  dateField: "logistic" | "dispatch" = "logistic"
) {
  const s = await requireSession();
  return svcGetReportDaily(s, fromDate, toDate, dateField);
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

// ລາຍງານຕາມຖ້ຽວ — ໜຶ່ງແຖວຕໍ່ໜຶ່ງຖ້ຽວ ພ້ອມສະຫຼຸບບິນ, ເວລາ ແລະ ໄລຍະທາງ.
export async function getReportByTrip(
  fromDate: string,
  toDate: string,
  filters: { carId?: string; driverId?: string; roundCode?: string } = {}
) {
  const s = await requireSession();
  return svcGetReportByTrip(s, fromDate, toDate, filters);
}

// ບິນທັງໝົດຂອງໜຶ່ງຖ້ຽວ (drill-down ຂອງລາຍງານຕາມຖ້ຽວ).
export async function getReportTripBills(docNo: string) {
  await requireSession();
  return svcGetReportTripBills(docNo);
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

// ລາຍງານປະສິດທິພາບການຈັດສົ່ງ (ຍອດຍົກມາ/ຍົກໄປ + ຊັ້ນເວລານຳສົ່ງ) ຂອງເດືອນ
export async function getDeliveryPerformance(monthly: string) {
  const s = await requireSession();
  return svcGetDeliveryPerformance(s, monthly);
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

// Bills behind one figure of the daily-activity report.
export async function getReportDailyActivityBills(
  fromDate: string,
  toDate: string,
  branchCode: string,
  bucket: "opened" | "delivered" | "remaining",
  department = ""
) {
  const s = await requireSession();
  return svcGetReportDailyActivityBills(s, fromDate, toDate, branchCode, bucket, department);
}

// Same drill-down, one row per product line (for the ສິນຄ້າ export).
export async function getReportDailyActivityItems(
  fromDate: string,
  toDate: string,
  branchCode: string,
  bucket: "opened" | "delivered" | "remaining",
  department = ""
) {
  const s = await requireSession();
  return svcGetReportDailyActivityItems(s, fromDate, toDate, branchCode, bucket, department);
}

export async function getReportDailyDepartment(
  fromDate: string,
  toDate: string,
  salesOnly = true,
  transportCode = ""
) {
  const s = await requireSession();
  return svcGetReportDailyDepartment(s, fromDate, toDate, salesOnly, transportCode);
}

export async function getAttemptDeliveryItems(docNo: string, billNo: string) {
  await requireSession();
  return svcGetAttemptDeliveryItems(docNo, billNo);
}

"use server";

import { requireSession } from "./_helpers";
import { buildUtilizationReport } from "./trip-volume";
import { getNextMonthStart } from "@/queries/helpers.js";
import { getDeliveryPerformance } from "@/queries/reports.js";
import { getSettings } from "@/queries/settings.js";
import {
  getExceptions,
  listTransportCars,
  getFuelEfficiency,
  getMonthSnapshot,
  getOnTimeTrend,
  getRouteAnalysis,
  getTripsByWeekday,
  getVehicleUtilization,
} from "@/queries/bi-dashboard.js";
import { addDays } from "@/lib/lao-date";
import type { DeliveryPerfReport } from "@/lib/delivery-performance";

/** ເດືອນກ່ອນໜ້າ ຄິດດ້ວຍ string ລ້ວນໆ — ບໍ່ແຕະໂມງຂອງເຄື່ອງ */
function previousMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

export type BiMonthSnapshot = {
  month: string;
  trips: {
    trips: number;
    active_cars: number;
    active_drivers: number;
    car_days: number;
    odometer_km: number;
    trips_with_odometer: number;
  };
  delivery: {
    drops: number;
    bills: number;
    on_time: number;
    late: number;
    no_due: number;
    on_time_pct: number;
  };
  gps: {
    distance_km: number;
    trackers: number;
    active_car_days: number;
    moving_seconds: number;
    stopped_seconds: number;
  };
  fuel: {
    refills: number;
    amount: number;
    liters: number;
    suspect_rows: number;
    /** ນ້ຳມັນຂອງພາຫະນະນອກກອງລົດຂົນສົ່ງ — ບໍ່ໄດ້ນັບເຂົ້າ amount */
    excluded_amount: number;
    excluded_refills: number;
    by_type: Array<{ fuel_type: string; refills: number; amount: number }>;
  };
  km: number;
  km_source: "gps" | "odometer" | "none";
  cost_per_trip: number;
  cost_per_km: number;
  cost_per_drop: number;
};

export type BiRoute = {
  route_code: string;
  route_name: string;
  route_km: number;
  trips: number;
  drops: number;
  cancelled: number;
  drops_per_trip: number;
  on_time_pct: number | null;
};

export type BiFuelCar = {
  car_code: string;
  car_name: string;
  trips: number;
  distance_km: number;
  liters: number;
  amount: number;
  refills: number;
  suspect_rows: number;
  dup_imei: boolean;
  km_per_liter: number | null;
  cost_per_km: number | null;
};

export type BiExceptions = {
  legs: number;
  total: number;
  total_pct: number;
  items: Array<{ key: string; label: string; count: number; pct: number }>;
  reasons: Array<{ reason_code: string; label: string; legs: number }>;
};

export type BiVehicles = {
  total_cars: number;
  used_cars: number;
  idle_cars: number;
  car_days: number;
  days_in_month: number;
  utilization_pct: number;
};

export type BiLoad = {
  scored: number;
  total: number;
  avg_pct: number | null;
  median_pct: number | null;
  free_m3: number;
  bands: Array<{ label: string; trips: number }>;
} | null;

export type BiCar = {
  code: string;
  name: string;
  transport_code: string;
  car_type: string;
  trips: number;
};

export type BiTargets = {
  on_time_rate: number | null;
  avg_delivery_minutes: number | null;
  avg_close_minutes: number | null;
};

export type BiDashboard = {
  month: string;
  /** ລົດທີ່ກຳລັງກັ່ນຕອງຢູ່ — ຫວ່າງ = ທຸກຄັນ */
  carCode: string;
  cars: BiCar[];
  current: BiMonthSnapshot;
  previous: BiMonthSnapshot;
  onTimeTrend: Array<{ month: string; drops: number; on_time: number; on_time_pct: number }>;
  tripsByWeekday: Array<{ dow: number; trips: number }>;
  routes: BiRoute[];
  vehicles: BiVehicles;
  load: BiLoad;
  fuelByCar: BiFuelCar[];
  exceptions: BiExceptions;
  targets: BiTargets;
};

/**
 * ຕົວເລກ "ໄວ" ທັງໝົດຂອງໜ້າ /reports/bi — ປະມານ 1 ວິນາທີ.
 *
 * ⚠️ ບໍ່ລວມສະຖານະການຈັດສົ່ງ (getDeliveryPerformance) ໂດຍເຈດຕະນາ: ອັນນັ້ນ
 * ໃຊ້ເວລາ ~12 ວິນາທີ ຖ້າມັດຮວມມາອັນດຽວ ໜ້າຈໍຈະຂາວທັງໜ້າ 12 ວິນາທີ.
 * ໜ້າຈໍຈຶ່ງເອີ້ນ getBiDeliveryStatus() ແຍກຕ່າງຫາກ ແລ້ວຕື່ມພາກ ② ພາຍຫຼັງ.
 */
export async function getBiDashboard(
  month: string,
  carCode = ""
): Promise<BiDashboard> {
  const session = await requireSession();
  const car = String(carCode ?? "").trim();
  const prev = previousMonth(month);
  const monthStart = `${month}-01`;
  // buildUtilizationReport ຮັບຊ່ວງແບບປິດທ້າຍ (dateTo ລວມ) ຈຶ່ງຕ້ອງລົບ 1 ວັນ
  const monthEnd = addDays(getNextMonthStart(month), -1);
  const year = Number(month.slice(0, 4));

  const [
    current,
    previousSnapshot,
    onTimeTrend,
    tripsByWeekday,
    routes,
    vehicles,
    utilization,
    fuelByCar,
    exceptions,
    cars,
    settings,
  ] = await Promise.all([
    getMonthSnapshot(session, month, car) as Promise<BiMonthSnapshot>,
    getMonthSnapshot(session, prev, car) as Promise<BiMonthSnapshot>,
    getOnTimeTrend(session, year, car) as Promise<BiDashboard["onTimeTrend"]>,
    getTripsByWeekday(session, month, car) as Promise<BiDashboard["tripsByWeekday"]>,
    getRouteAnalysis(session, month, 8, car) as Promise<BiRoute[]>,
    getVehicleUtilization(session, month, car) as Promise<BiVehicles>,
    buildUtilizationReport(monthStart, monthEnd, car),
    getFuelEfficiency(session, month, 12, car) as Promise<BiFuelCar[]>,
    getExceptions(session, month, car) as Promise<BiExceptions>,
    listTransportCars(session, month) as Promise<BiCar[]>,
    getSettings([
      "kpi.target_on_time_rate",
      "kpi.target_avg_delivery_minutes",
      "kpi.target_avg_close_minutes",
    ]) as Promise<Record<string, string>>,
  ]);

  const summary = utilization.summary;
  const load: BiLoad = summary
    ? {
        scored: summary.scored,
        total: summary.total,
        avg_pct: summary.avgPct,
        median_pct: summary.medianPct,
        free_m3: summary.totalFreeM3,
        bands: summary.bands,
      }
    : null;

  const num = (value: string | undefined) => {
    const parsed = Number(value);
    return value && Number.isFinite(parsed) ? parsed : null;
  };

  return {
    month,
    carCode: car,
    cars,
    current,
    previous: previousSnapshot,
    onTimeTrend,
    tripsByWeekday,
    routes,
    vehicles,
    load,
    fuelByCar,
    exceptions,
    targets: {
      on_time_rate: num(settings["kpi.target_on_time_rate"]),
      avg_delivery_minutes: num(settings["kpi.target_avg_delivery_minutes"]),
      avg_close_minutes: num(settings["kpi.target_avg_close_minutes"]),
    },
  };
}

/**
 * ພາກ ② ສະຖານະການຈັດສົ່ງ — ແຍກອອກມາເພາະຊ້າ (~12 ວິນາທີ).
 * ຄຳນິຍາມດຽວກັນກັບໜ້າ /reports/delivery-performance ບໍ່ໄດ້ຄິດໃໝ່.
 */
export async function getBiDeliveryStatus(month: string): Promise<DeliveryPerfReport> {
  const session = await requireSession();
  return getDeliveryPerformance(session, month) as Promise<DeliveryPerfReport>;
}

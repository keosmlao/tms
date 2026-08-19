"use server";

import { requireSession } from "./_helpers";
import { buildUtilizationReport } from "./trip-volume";
import { getDeliveryPerformance } from "@/queries/reports.js";
import { getSettings } from "@/queries/settings.js";
import { getTripCostSummary } from "@/queries/trip-cost.js";
import {
  getBranchBreakdown,
  getCodSummary,
  getDailyTrend,
  getDataQuality,
  getDriverPerformance,
  getExceptions,
  getFleetActivity,
  listTransportCars,
  getFuelEfficiency,
  getRangeSnapshot,
  getOnTimeTrend,
  getRouteAnalysis,
  getTimingProfile,
  getTopCustomers,
  getTripsByWeekday,
  getVehicleUtilization,
} from "@/queries/bi-dashboard.js";
import { addDays } from "@/lib/lao-date";
import { getFixedYearDateRange } from "@/lib/fixed-year";
import type { DeliveryPerfReport } from "@/lib/delivery-performance";
import type { TripCostSummary } from "@/lib/trip-cost-types";

export type BiRange = { from: string; to: string };

/** ຈຳນວນວັນໃນຊ່ວງ (ລວມທັງສອງທ້າຍ) — Date.UTC ລ້ວນໆ ບໍ່ແຕະ TZ ຂອງເຄື່ອງ */
function rangeDays(range: BiRange) {
  const ms = Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000) + 1) : 1;
}

/**
 * ຊ່ວງກ່ອນໜ້າທີ່ເອົາມາທຽບ = ຊ່ວງທີ່ຍາວເທົ່າກັນ ຕິດກັນທັນທີກ່ອນວັນເລີ່ມ.
 * (1–19 ສິງຫາ ທຽບກັບ 13–31 ກໍລະກົດ — 19 ວັນເທົ່າກັນ ບໍ່ແມ່ນເດືອນເຕັມ)
 */
function previousRange(range: BiRange): BiRange {
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(rangeDays(range) - 1)), to };
}

export type BiMonthSnapshot = {
  from: string;
  to: string;
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
    /** ຈຸດສົ່ງທີ່ວັດໄດ້ຈາກ "ນັດຄັ້ງທຳອິດ" ຈິງ — ທີ່ເຫຼືອຖອຍໄປໃຊ້ນັດປັດຈຸບັນ */
    from_first_promise: number;
    /** ບິນທີ່ຖືກເລື່ອນນັດຢ່າງໜ້ອຍ 1 ຄັ້ງ */
    rescheduled_bills: number;
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
  /** ຈຳນວນວັນໃນຊ່ວງທີ່ເລືອກ (ລວມທັງສອງທ້າຍ) */
  days: number;
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

export type BiDay = {
  /** YYYY-MM-DD ຕາມປະຕິທິນລາວ */
  day: string;
  trips: number;
  drops: number;
  km: number;
  fuel: number;
};

export type BiDriver = {
  code: string;
  name: string;
  trips: number;
  drops: number;
  cancelled: number;
  drops_per_trip: number;
  on_time_pct: number | null;
};

export type BiBranch = {
  branch_code: string;
  branch_name: string;
  trips: number;
  cars: number;
  drops: number;
  on_time_pct: number | null;
};

export type BiCustomer = {
  customer: string;
  drops: number;
  bills: number;
  late: number;
};

export type BiFleetActivity = {
  car_name: string;
  active_days: number;
  km: number;
  moving_hours: number;
  max_speed: number;
  avg_daily_max_speed: number;
  km_per_hour: number | null;
};

export type BiTiming = {
  trips: number;
  /** ຖ້ຽວທີ່ມີທັງເວລາອອກລົດ ແລະ ເວລາປິດງານ */
  trips_measured: number;
  avg_trip_hours: number;
  median_trip_hours: number;
  drops: number;
  drops_measured: number;
  /** ເວລາຈາກ check-in ໜ້າຮ້ານ ຫາ ກົດສຳເລັດ (ນາທີ) */
  median_stop_minutes: number;
  p90_stop_minutes: number;
  dispatch_hours: Array<{ hour: number; trips: number }>;
};

export type BiCod = {
  drops: number;
  expected: number;
  collected: number;
  /** ຈຸດທີ່ມີ COD ແຕ່ບໍ່ມີການບັນທຶກການເກັບເລີຍ */
  unrecorded_drops: number;
  unrecorded_amount: number;
  /** ຈຸດທີ່ບັນທຶກວ່າເກັບ ແຕ່ໜ້ອຍກວ່າຍອດທີ່ຕ້ອງເກັບ */
  short_drops: number;
  collected_pct: number;
};

export type BiDataQuality = {
  /** ລົດທີ່ອອກຖ້ຽວ ແຕ່ GPS ບໍ່ບັນທຶກໄລຍະທາງເລີຍໃນຊ່ວງນີ້ */
  trips_without_gps: Array<{ car_name: string; trips: number; has_imei: boolean }>;
  /** ລົດທີ່ແລ່ນຕາມ GPS ແຕ່ບໍ່ມີໃບຈັດຖ້ຽວເລີຍ */
  gps_without_trips: Array<{ car_name: string; km: number }>;
  /** ພາຫະນະທີ່ຕື່ມນ້ຳມັນ ແຕ່ຍັງບໍ່ຜູກສາຂາ ຈຶ່ງຫຼຸດອອກຈາກຍອດລາຍສາຂາ */
  cars_without_branch: Array<{ car_name: string; refills: number; amount: number }>;
  /** ໃບຈັດຖ້ຽວທີ່ຍັງລໍອະນຸມັດ — ບໍ່ຖືກນັບຢູ່ບ່ອນໃດ */
  unapproved_jobs: number;
};

export type BiTargets = {
  on_time_rate: number | null;
  avg_delivery_minutes: number | null;
  avg_close_minutes: number | null;
  /** ກີບ/ກມ ທີ່ຕັ້ງເປົ້າ — ວ່າງ = ຍັງບໍ່ໄດ້ຕັ້ງ */
  cost_per_km: number | null;
  /** ກີບ/ຖ້ຽວ ທີ່ຕັ້ງເປົ້າ */
  cost_per_trip: number | null;
  /** % ການໃຊ້ພື້ນທີ່ບັນທຸກ ທີ່ຕັ້ງເປົ້າ */
  load_pct: number | null;
};

export type BiDashboard = {
  from: string;
  to: string;
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
  /** ຕົ້ນທຶນນອກຈາກຄ່ານ້ຳມັນ — ບັນທຶກຢູ່ໜ້າ /costs */
  otherCost: TripCostSummary;
  /** ຄ່ານ້ຳມັນ + ຕົ້ນທຶນອື່ນ ຂອງຊ່ວງທີ່ເລືອກ */
  costTotal: number;
  costPerTripTotal: number;
  costPerKmTotal: number;
  daily: BiDay[];
  drivers: BiDriver[];
  branches: BiBranch[];
  customers: BiCustomer[];
  fleetActivity: BiFleetActivity[];
  timing: BiTiming;
  cod: BiCod;
  dataQuality: BiDataQuality;
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
  from: string,
  to: string,
  carCode = ""
): Promise<BiDashboard> {
  const session = await requireSession();
  const car = String(carCode ?? "").trim();
  // ຄ່າທີ່ມາຈາກ URL/ໜ້າຈໍ ຖືກບີບເຂົ້າປີທີ່ລະບົບຕັ້ງໄວ້ ແລະ ຈັດລຳດັບໃຫ້ຖືກກ່ອນ
  const { fromDate, toDate } = getFixedYearDateRange(from, to);
  const range: BiRange = { from: fromDate, to: toDate };
  const prev = previousRange(range);
  const year = Number(range.from.slice(0, 4));

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
    otherCost,
    daily,
    drivers,
    branches,
    customers,
    fleetActivity,
    timing,
    cod,
    dataQuality,
    cars,
    settings,
  ] = await Promise.all([
    getRangeSnapshot(session, range, car) as Promise<BiMonthSnapshot>,
    getRangeSnapshot(session, prev, car) as Promise<BiMonthSnapshot>,
    getOnTimeTrend(session, year, car) as Promise<BiDashboard["onTimeTrend"]>,
    getTripsByWeekday(session, range, car) as Promise<BiDashboard["tripsByWeekday"]>,
    getRouteAnalysis(session, range, 8, car) as Promise<BiRoute[]>,
    getVehicleUtilization(session, range, car) as Promise<BiVehicles>,
    // buildUtilizationReport ຮັບຊ່ວງແບບປິດທ້າຍ (dateTo ລວມມື້ນັ້ນນຳ) ຄືກັນ
    buildUtilizationReport(range.from, range.to, car),
    getFuelEfficiency(session, range, 12, car) as Promise<BiFuelCar[]>,
    getExceptions(session, range, car) as Promise<BiExceptions>,
    getTripCostSummary(session, range, car) as Promise<TripCostSummary>,
    getDailyTrend(session, range, car) as Promise<BiDay[]>,
    getDriverPerformance(session, range, 12, car) as Promise<BiDriver[]>,
    getBranchBreakdown(session, range, car) as Promise<BiBranch[]>,
    getTopCustomers(session, range, 10, car) as Promise<BiCustomer[]>,
    getFleetActivity(session, range, 12, car) as Promise<BiFleetActivity[]>,
    getTimingProfile(session, range, car) as Promise<BiTiming>,
    getCodSummary(session, range, car) as Promise<BiCod>,
    getDataQuality(session, range, car) as Promise<BiDataQuality>,
    listTransportCars(session, range) as Promise<BiCar[]>,
    getSettings([
      "kpi.target_on_time_rate",
      "kpi.target_avg_delivery_minutes",
      "kpi.target_avg_close_minutes",
      "kpi.target_cost_per_km",
      "kpi.target_cost_per_trip",
      "kpi.target_load_pct",
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

  // ຕົ້ນທຶນເຕັມ = ຄ່ານ້ຳມັນ + ຕົ້ນທຶນອື່ນທີ່ບັນທຶກໄວ້. ຖ້າຍັງບໍ່ມີໃຜລົງຕົ້ນທຶນອື່ນ
  // ຄ່ານີ້ຈະເທົ່າກັບຄ່ານ້ຳມັນພໍດີ ຈຶ່ງບໍ່ເຮັດໃຫ້ຕົວເລກເກົ່າປ່ຽນ
  const costTotal = current.fuel.amount + otherCost.total;
  const trips = current.trips.trips;

  return {
    from: range.from,
    to: range.to,
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
    otherCost,
    costTotal,
    costPerTripTotal: trips > 0 ? costTotal / trips : 0,
    costPerKmTotal: current.km > 0 ? costTotal / current.km : 0,
    daily,
    drivers,
    branches,
    customers,
    fleetActivity,
    timing,
    cod,
    dataQuality,
    targets: {
      on_time_rate: num(settings["kpi.target_on_time_rate"]),
      avg_delivery_minutes: num(settings["kpi.target_avg_delivery_minutes"]),
      avg_close_minutes: num(settings["kpi.target_avg_close_minutes"]),
      cost_per_km: num(settings["kpi.target_cost_per_km"]),
      cost_per_trip: num(settings["kpi.target_cost_per_trip"]),
      load_pct: num(settings["kpi.target_load_pct"]),
    },
  };
}

/**
 * ພາກ ② ສະຖານະການຈັດສົ່ງ — ແຍກອອກມາເພາະຊ້າ (~12 ວິນາທີ).
 * ຄຳນິຍາມດຽວກັນກັບໜ້າ /reports/delivery-performance ບໍ່ໄດ້ຄິດໃໝ່.
 */
export async function getBiDeliveryStatus(
  from: string,
  to: string
): Promise<DeliveryPerfReport> {
  const session = await requireSession();
  const { fromDate, toDate } = getFixedYearDateRange(from, to);
  return getDeliveryPerformance(session, {
    from: fromDate,
    to: toDate,
  }) as Promise<DeliveryPerfReport>;
}

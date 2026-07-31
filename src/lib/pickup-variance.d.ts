// Types for pickup-variance.js (runtime ຢູ່ .js ເພາະ src/queries/mobile.js
// ເປັນ CommonJS)

export interface PlannedPickupItem {
  item_code: string;
  item_name?: string | null;
  unit_code?: string | null;
  /** What the dispatcher loaded onto this trip for this bill. */
  selected_qty: number;
}

export interface ReportedPickupItem {
  item_code: string;
  qty: number;
}

export interface PickupVarianceLine {
  item_code: string;
  item_name: string;
  unit_code: string;
  planned_qty: number;
  /** Raw figure the driver reported, before clamping. */
  reported_qty: number;
  /** What actually gets written to selected_qty. */
  actual_qty: number;
  /** actual − planned; always ≤ 0 because a pickup can only come up short. */
  diff_qty: number;
  /**
   * Driver reported MORE than the trip planned. The extra is NOT applied — the
   * surplus may be reserved for another trip, so only the dispatcher can hand
   * it over — but it is still logged so they can act on it.
   */
  over_reported: boolean;
}

export interface PickupVarianceResult {
  /** Only the lines whose reported qty differs from the planned qty. */
  lines: PickupVarianceLine[];
  plannedTotal: number;
  actualTotal: number;
  hasVariance: boolean;
  /** Every line came back as zero — nothing was actually picked up. */
  emptyPickup: boolean;
}

export declare function computePickupVariance(
  planned: PlannedPickupItem[],
  reported: ReportedPickupItem[]
): PickupVarianceResult;

/** One-line Lao summary used in the notification body. */
export declare function describePickupVariance(result: PickupVarianceResult): string;

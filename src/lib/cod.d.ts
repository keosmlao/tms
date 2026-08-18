// Types for cod.js (runtime ຢູ່ .js ເພາະ query layer ເປັນ CommonJS)

export type PaymentMethod = "cash" | "transfer" | "mixed" | "none";

export type CodSettlementStatus =
  | "not_required"
  | "pending"
  | "exact"
  | "short"
  | "over";

export declare const COD_DOC_FORMAT_PREFIX: string;
export declare const PAYMENT_METHODS: PaymentMethod[];
export declare const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string>;
export declare const METHODS_REQUIRING_REFERENCE: PaymentMethod[];
export declare const KIP_TOLERANCE: number;

export declare function isCodDocFormat(docFormatCode: unknown): boolean;
export declare function normalizePaymentMethod(value: unknown): PaymentMethod | null;
export declare function paymentMethodLabel(value: unknown): string;
export declare function toKip(value: unknown): number;
export declare function codSettlementStatus(input: {
  expected?: unknown;
  collected?: unknown;
}): CodSettlementStatus;
export declare function codVariance(expected: unknown, collected: unknown): number;

export interface CodCollectionValue {
  collected_amount: number | null;
  payment_method: PaymentMethod | null;
  reference: string | null;
  variance_reason: string | null;
  status: CodSettlementStatus;
  variance: number;
}

export type CodValidationResult =
  | { ok: true; value: CodCollectionValue; error?: undefined }
  | { ok: false; error: string; value?: undefined };

export declare function validateCodCollection(input: {
  codAmount?: unknown;
  collectedAmount?: unknown;
  paymentMethod?: unknown;
  reference?: unknown;
  varianceReason?: unknown;
}): CodValidationResult;

export interface CodBillRow {
  cod_amount?: number | string | null;
  collected_amount?: number | string | null;
  payment_method?: string | null;
  status?: number | null;
}

export interface CodTripSummary {
  cod_bill_count: number;
  expected_total: number;
  collected_total: number;
  cash_total: number;
  transfer_total: number;
  variance_total: number;
  pending_count: number;
  short_count: number;
  over_count: number;
}

export declare function summarizeTripCod(bills: CodBillRow[]): CodTripSummary;

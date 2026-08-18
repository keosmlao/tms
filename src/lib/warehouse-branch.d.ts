// Types for warehouse-branch.js (runtime ຢູ່ .js ເພາະ query layer ເປັນ CommonJS)
export declare const BRANCH_STOCK_TO_TRANSPORT: Record<string, string>;

export declare function suggestTransportForBranchStock(branchStock: unknown): string;

export interface RemainingWarehouseRow {
  wh_code: string;
  wh_name: string;
  branch_stock: string;
  item_code: string;
  item_name: string;
  unit_code: string;
  erp_qty: number | string;
  placed_qty: number | string;
  remaining_qty: number | string;
}

export interface RemainingWarehouseItem {
  item_code: string;
  item_name: string;
  unit_code: string;
  erp_qty: number;
  placed_qty: number;
  remaining_qty: number;
}

export interface RemainingWarehouseGroup {
  wh_code: string;
  wh_name: string;
  branch_stock: string;
  suggested_transport_code: string;
  items: RemainingWarehouseItem[];
  remaining_qty_total: number;
}

export declare function groupRemainingItemsByWarehouse(
  rows: RemainingWarehouseRow[]
): RemainingWarehouseGroup[];

export declare const DELIVERY_BRANCH_CODES: string[];

export interface BranchLegLine {
  doc_no: string;
  home_transport_code: string;
  wh_code: string;
  wh_name?: string;
  branch_stock: string;
  item_code: string;
  item_name?: string;
  unit_code?: string;
  erp_qty: number | string;
  placed_qty?: number | string;
  returned_qty?: number | string;
}

export interface BranchLegItem {
  item_code: string;
  item_name: string;
  unit_code: string;
  qty: number;
}

export interface BranchLegPlan {
  parent_bill_no: string;
  transport_code: string;
  wh_labels: string[];
  items: BranchLegItem[];
}

export declare function planBranchLegs(lines: BranchLegLine[]): BranchLegPlan[];

export declare function branchLegBillNo(parentBillNo: string, transportCode: string): string;

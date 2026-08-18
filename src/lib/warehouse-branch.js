// ⚠️ CommonJS (.js) ໂດຍເຈດຕະນາ — src/queries/*.js require ໄຟລ໌ນີ້ ແລະ
// require() ໂຫຼດ .ts ໄດ້ສະເພາະໃນ bundler ຂອງ Next. type ຢູ່ .d.ts ຄູ່ກັນ.
// Pure warehouse→branch mapping + grouping helpers for the "ຈັດຖ້ຽວທີ່ເຫຼືອຕາມ
// ສາຂາ" split tool. Kept free of any DB/IO so it is unit-testable and can be
// required from the CommonJS query layer (src/queries/helpers.js).

// Default suggestion from a warehouse's stock-branch group
// (ic_warehouse.branch_stock) to the delivery branch it belongs to
// (transport_type.code, the "02-xxxx" carrier used for pickup/forward). There is
// NO source-of-truth table for this in the ERP, so this is a best-effort DEFAULT
// only — the split UI shows it pre-selected in a dropdown the dispatcher can
// override. An unmapped branch_stock yields an empty suggestion.
//   01 ຂົວຫຼວງ    → 02-0001 ຂົນສົ່ງໂອດ່ຽນ
//   03 ດອນຕິ້ວ     → 02-0002 ຂົນສົ່ງດອນຕິ້ວ
//   02 ໂພນສະອາດ  → 02-0007 ຂົນສົ່ງໂພນສະອາດ
//   04 ປາກເຊ      → 02-0003 ຂົນສົ່ງປາກເຊ
"use strict";

/** @type {Record<string, string>} */
const BRANCH_STOCK_TO_TRANSPORT = {
  "01": "02-0001",
  "02": "02-0007",
  "03": "02-0002",
  "04": "02-0003",
};

/**
 * @param {unknown} branchStock
 * @returns {string}
 */
function suggestTransportForBranchStock(branchStock) {
  const key = String(branchStock ?? "").trim();
  return BRANCH_STOCK_TO_TRANSPORT[key] ?? "";
}

// Fold flat (warehouse, item) rows into one entry per warehouse, attaching the
// suggested delivery branch and a remaining-qty subtotal. Order of warehouses
// follows first appearance in the input.
/**
 * @param {import("./warehouse-branch").RemainingWarehouseRow[]} rows
 * @returns {import("./warehouse-branch").RemainingWarehouseGroup[]}
 */
function groupRemainingItemsByWarehouse(rows) {
  const byWarehouse = new Map();
  for (const row of rows) {
    const whCode = String(row.wh_code ?? "");
    if (!byWarehouse.has(whCode)) {
      const branchStock = String(row.branch_stock ?? "");
      byWarehouse.set(whCode, {
        wh_code: whCode,
        wh_name: row.wh_name,
        branch_stock: branchStock,
        suggested_transport_code: suggestTransportForBranchStock(branchStock),
        items: [],
        remaining_qty_total: 0,
      });
    }
    const group = byWarehouse.get(whCode);
    const remaining = Number(row.remaining_qty ?? 0);
    group.items.push({
      item_code: row.item_code,
      item_name: row.item_name,
      unit_code: row.unit_code,
      erp_qty: Number(row.erp_qty ?? 0),
      placed_qty: Number(row.placed_qty ?? 0),
      remaining_qty: remaining,
    });
    group.remaining_qty_total += remaining;
  }
  return Array.from(byWarehouse.values());
}

// The three internal delivery branches the dispatch queue ("ບິນລໍຈັດຖ້ຽວ")
// actually serves: 02-0001 ໂອດ້ຽນ/ຂົວຫຼວງ · 02-0002 ດອນຕິ້ວ · 02-0003 ປາກເຊ.
// Shared by bills.js (queue filter) and the branch-leg planner below so a leg
// is never handed to a branch that has no queue to pick it up from.
const DELIVERY_BRANCH_CODES = ["02-0001", "02-0002", "02-0003"];

// ── Branch legs ────────────────────────────────────────────────────────────
// ບິນ 1 ໃບທີ່ເບີກຈາກຫຼາຍສາງ ແລະ ແຕ່ລະສາງຢູ່ຄົນລະສາຂາຂົນສົ່ງ → ແຕ່ລະສາຂາຕ້ອງ
// ຈັດຖ້ຽວສ່ວນຂອງຕົນເອງໄດ້ ໂດຍບໍ່ຕ້ອງລໍຖ້າກັນ. planBranchLegs ຕັດສິນວ່າບິນໃດ
// ຕ້ອງແຍກ ແລະ ແຍກໃຫ້ສາຂາໃດແດ່ (pure — DB ຢູ່ queries/branch-leg.js).
//
// Rules:
//   • leg branch of a warehouse = BRANCH_STOCK_TO_TRANSPORT[branch_stock] when
//     that branch is one of DELIVERY_BRANCH_CODES; otherwise the bill's HOME
//     branch (its shipment transport_code) keeps the items — an unmapped
//     warehouse must never strand goods on a branch that has no queue.
//   • a bill qualifies only when its lines span ≥ 2 distinct leg branches AND
//     the home branch holds at least one of them. A bill whose goods all sit
//     in foreign warehouses (one or several) is left alone — that is the
//     existing forward-to-branch flow owned by the home branch, not a split.
//   • one leg per foreign branch, carrying (erp_qty − placed_qty − returned_qty)
//     per item; items with nothing left are dropped and an empty leg is skipped.
//   • placed/returned qty is known per (bill, item) only — odg_tms_detail_item
//     has no wh_code. When the same item sits in several warehouses it is
//     attributed to the HOME warehouse lines first (the home branch is the one
//     that could have dispatched before the legs existed), and only the excess
//     eats into the foreign lines. Every line of one item must therefore carry
//     the same placed_qty / returned_qty (the SQL joins them per item).
//   • the caller decides which legs already exist (PK = `${bill}#${branch}`).
/**
 * @param {import("./warehouse-branch").BranchLegLine[]} lines
 * @returns {import("./warehouse-branch").BranchLegPlan[]}
 */
function planBranchLegs(lines) {
  const byBill = new Map();
  for (const raw of lines) {
    const docNo = String(raw.doc_no ?? "").trim();
    if (!docNo) continue;
    if (!byBill.has(docNo)) byBill.set(docNo, []);
    byBill.get(docNo).push(raw);
  }
  const plans = [];
  for (const [docNo, billLines] of byBill) {
    const home = String(billLines[0]?.home_transport_code ?? "").trim();
    if (!home) continue;
    const branchOf = (line) => {
      const suggested = suggestTransportForBranchStock(line.branch_stock);
      return DELIVERY_BRANCH_CODES.includes(suggested) ? suggested : home;
    };
    const distinct = new Set(billLines.map(branchOf));
    if (distinct.size < 2 || !distinct.has(home)) continue;
    // Home-first attribution of the per-item consumed qty (see header).
    const consumedLeft = new Map(); // item_code -> qty still to attribute
    for (const line of billLines) {
      const itemCode = String(line.item_code ?? "").trim();
      if (!itemCode || consumedLeft.has(itemCode)) continue;
      const consumed = Number(line.placed_qty ?? 0) + Number(line.returned_qty ?? 0);
      consumedLeft.set(itemCode, Number.isFinite(consumed) && consumed > 0 ? consumed : 0);
    }
    const ordered = [
      ...billLines.filter((line) => branchOf(line) === home),
      ...billLines.filter((line) => branchOf(line) !== home),
    ];
    const legs = new Map();
    for (const line of ordered) {
      const itemCode = String(line.item_code ?? "").trim();
      if (!itemCode) continue;
      const erp = Number(line.erp_qty ?? 0);
      const left = consumedLeft.get(itemCode) ?? 0;
      const eaten = Math.min(Number.isFinite(erp) && erp > 0 ? erp : 0, left);
      consumedLeft.set(itemCode, left - eaten);
      const branch = branchOf(line);
      if (branch === home) continue;
      const qty = (Number.isFinite(erp) ? erp : 0) - eaten;
      if (qty <= 0) continue;
      if (!legs.has(branch)) {
        legs.set(branch, {
          parent_bill_no: docNo,
          transport_code: branch,
          wh_labels: [],
          items: [],
        });
      }
      const leg = legs.get(branch);
      const whLabel = String(line.wh_name ?? line.wh_code ?? "").trim();
      if (whLabel && !leg.wh_labels.includes(whLabel)) leg.wh_labels.push(whLabel);
      const existing = leg.items.find((it) => it.item_code === itemCode);
      if (existing) existing.qty += qty;
      else {
        leg.items.push({
          item_code: itemCode,
          item_name: String(line.item_name ?? "").trim() || itemCode,
          unit_code: String(line.unit_code ?? "").trim() || "ອັນ",
          qty,
        });
      }
    }
    for (const leg of legs.values()) {
      if (leg.items.length > 0) plans.push(leg);
    }
  }
  return plans;
}

// PK of a branch leg: the parent bill number + '#' + the delivery branch —
// deterministic so re-running the planner can never create a duplicate.
/**
 * @param {string} parentBillNo
 * @param {string} transportCode
 * @returns {string}
 */
function branchLegBillNo(parentBillNo, transportCode) {
  return `${String(parentBillNo ?? "").trim()}#${String(transportCode ?? "").trim()}`;
}

module.exports = {
  BRANCH_STOCK_TO_TRANSPORT,
  DELIVERY_BRANCH_CODES,
  suggestTransportForBranchStock,
  groupRemainingItemsByWarehouse,
  planBranchLegs,
  branchLegBillNo,
};

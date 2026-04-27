"use client";

import { FaSpinner } from "react-icons/fa";

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

export interface JobBill {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  count_item: number;
  telephone: string;
  products: Product[];
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

/**
 * Expanded row content showing all bills + their products for a given job.
 * Used inside a `<tr>` with `colSpan` matching the parent table.
 */
export function JobBillsAccordion({
  docNo,
  createdAt,
  bills,
  loading,
  onClose,
  accentTone = "teal",
}: {
  docNo: string;
  createdAt?: string;
  bills: JobBill[];
  loading: boolean;
  onClose: () => void;
  accentTone?: "teal" | "emerald" | "sky" | "amber" | "orange";
}) {
  const accent = {
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  }[accentTone];

  return (
    <div className="m-3 rounded-lg glass overflow-hidden">
      <div className="px-4 py-3 bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            ລາຍການບິນໃນຖ້ຽວ {docNo}
          </p>
          {createdAt && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ສ້າງເມື່ອ {createdAt}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
        >
          ປິດ
        </button>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <FaSpinner className="animate-spin" size={12} /> ກຳລັງໂຫຼດ...
          </div>
        ) : bills.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            ບໍ່ພົບລາຍການບິນ
          </div>
        ) : (
          <div className="space-y-2">
            {bills.map((bill, idx) => (
              <div
                key={`${docNo}-${bill.bill_no}`}
                className="glass-subtle rounded-lg overflow-hidden"
              >
                <div className="px-3 py-2.5 bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded ${accent} flex items-center justify-center text-[10px] font-bold`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-white">
                          {bill.bill_no}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {bill.bill_date} · {bill.cust_name || bill.cust_code}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-medium ${accent} px-2 py-0.5 rounded`}
                    >
                      {toNumber(bill.count_item)} ລາຍການ
                    </span>
                  </div>
                  {bill.telephone && (
                    <p className="text-[10px] text-slate-400 mt-1 ml-7">
                      ໂທ: {bill.telephone}
                    </p>
                  )}
                </div>
                {bill.products && bill.products.length > 0 && (
                  <div className="p-2">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200/30 dark:border-white/5">
                          <th className="text-left py-1 pl-2 pr-1 font-medium w-6">
                            #
                          </th>
                          <th className="text-left py-1 px-1 font-medium">ລະຫັດ</th>
                          <th className="text-left py-1 px-1 font-medium">
                            ຊື່ສິນຄ້າ
                          </th>
                          <th className="text-right py-1 px-1 font-medium">
                            ຈຳນວນ
                          </th>
                          <th className="text-left py-1 pl-1 pr-2 font-medium">
                            ຫົວໜ່ວຍ
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.products.map((product, pIdx) => (
                          <tr
                            key={`${bill.bill_no}-${product.item_code}-${pIdx}`}
                            className="border-b border-slate-200/20 dark:border-white/5 last:border-0"
                          >
                            <td className="py-1 pl-2 pr-1 text-slate-400">
                              {pIdx + 1}
                            </td>
                            <td className="py-1 px-1 font-mono text-[9px] text-slate-500">
                              {product.item_code}
                            </td>
                            <td className="py-1 px-1 text-slate-700 dark:text-slate-300">
                              {product.item_name}
                            </td>
                            <td
                              className={`py-1 px-1 text-right font-semibold ${
                                accentTone === "teal"
                                  ? "text-teal-600"
                                  : accentTone === "emerald"
                                  ? "text-emerald-600"
                                  : accentTone === "sky"
                                  ? "text-sky-600"
                                  : accentTone === "amber"
                                  ? "text-amber-600"
                                  : "text-orange-600"
                              }`}
                            >
                              {product.qty}
                            </td>
                            <td className="py-1 pl-1 pr-2 text-slate-500">
                              {product.unit_code}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

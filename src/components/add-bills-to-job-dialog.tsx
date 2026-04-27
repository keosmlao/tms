"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBox,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTimes,
} from "react-icons/fa";
import { Actions } from "@/lib/api";

interface AvailableBill {
  doc_no: string;
  doc_date: string;
  cust_code: string;
  cust_name?: string | null;
  telephone?: string | null;
  count_item: number;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

type SourceMode = "available" | "search";

// outer key: bill_no, inner key: item_code, value: selected qty
type Selection = Record<string, Record<string, number>>;

export function AddBillsToJobDialog({
  open,
  docNo,
  onClose,
  onSaved,
}: {
  open: boolean;
  docNo: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bills, setBills] = useState<AvailableBill[]>([]);
  const [searchResults, setSearchResults] = useState<AvailableBill[]>([]);
  const [productsByBill, setProductsByBill] = useState<Record<string, Product[]>>({});
  const [billMeta, setBillMeta] = useState<Record<string, AvailableBill>>({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelection({});
    setProductsByBill({});
    setBillMeta({});
    setExpandedBill(null);
    setSearch("");
    setSearchResults([]);
    Actions.getAvailableBills()
      .then((data) => {
        const list = (data ?? []) as AvailableBill[];
        setBills(list);
        setBillMeta((prev) => {
          const next = { ...prev };
          for (const b of list) next[b.doc_no] = b;
          return next;
        });
      })
      .catch((e) => {
        console.error(e);
        setError(e instanceof Error ? e.message : "ບໍ່ສາມາດໂຫຼດບິນ");
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Debounced server search across ic_trans master.
  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      Actions.searchBillsForJob(q, docNo ?? undefined)
        .then((data) => {
          const list = (data ?? []) as AvailableBill[];
          setSearchResults(list);
          setBillMeta((prev) => {
            const next = { ...prev };
            for (const b of list) next[b.doc_no] = b;
            return next;
          });
        })
        .catch((e) => {
          console.error(e);
          setSearchResults([]);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [search, open, docNo]);

  const sourceMode: SourceMode = search.trim().length >= 2 ? "search" : "available";
  const visible = sourceMode === "search" ? searchResults : bills;

  const ensureProducts = async (billNo: string) => {
    if (productsByBill[billNo]) return productsByBill[billNo];
    setLoadingProducts(billNo);
    try {
      const data = (await Actions.getAvailableBillProducts(billNo)) as Product[];
      setProductsByBill((c) => ({ ...c, [billNo]: data ?? [] }));
      return data ?? [];
    } finally {
      setLoadingProducts(null);
    }
  };

  const handleExpand = async (billNo: string) => {
    if (expandedBill === billNo) {
      setExpandedBill(null);
      return;
    }
    setExpandedBill(billNo);
    try {
      const products = await ensureProducts(billNo);
      // First-time expansion auto-selects all items at full remaining qty,
      // mirroring the create-job flow.
      setSelection((prev) => {
        if (prev[billNo]) return prev;
        const all: Record<string, number> = {};
        for (const p of products) all[p.item_code] = p.qty;
        return { ...prev, [billNo]: all };
      });
    } catch (e) {
      console.error(e);
    }
  };

  const billPickedCount = (billNo: string) =>
    Object.keys(selection[billNo] ?? {}).length;

  const totalPickedBills = Object.keys(selection).filter(
    (k) => Object.keys(selection[k] ?? {}).length > 0
  ).length;

  const toggleItem = (billNo: string, item: Product) => {
    setSelection((prev) => {
      const next = { ...prev };
      const items = { ...(next[billNo] ?? {}) };
      if (item.item_code in items) delete items[item.item_code];
      else items[item.item_code] = item.qty;
      if (Object.keys(items).length === 0) delete next[billNo];
      else next[billNo] = items;
      return next;
    });
  };

  const setItemQty = (billNo: string, item: Product, qty: number) => {
    const clamped = Math.max(1, Math.min(qty, item.qty));
    setSelection((prev) => {
      const items = { ...(prev[billNo] ?? {}) };
      items[item.item_code] = clamped;
      return { ...prev, [billNo]: items };
    });
  };

  const toggleAll = (billNo: string, products: Product[]) => {
    setSelection((prev) => {
      const next = { ...prev };
      const items = next[billNo] ?? {};
      if (Object.keys(items).length === products.length) {
        delete next[billNo];
      } else {
        const all: Record<string, number> = {};
        for (const p of products) all[p.item_code] = p.qty;
        next[billNo] = all;
      }
      return next;
    });
  };

  const submit = async () => {
    if (!docNo) return;
    if (totalPickedBills === 0) {
      setError("ກະລຸນາເລືອກບິນ");
      return;
    }
    const payload = Object.entries(selection)
      .filter(([, items]) => Object.keys(items).length > 0)
      .map(([billNo, items]) => {
        const products = productsByBill[billNo] ?? [];
        return {
          bill_no: billNo,
          items: products
            .filter((p) => p.item_code in items)
            .map((p) => ({
              item_code: p.item_code,
              item_name: p.item_name,
              qty: p.qty,
              selectedQty: items[p.item_code],
              unit_code: p.unit_code,
            })),
        };
      });

    setSubmitting(true);
    setError(null);
    try {
      await Actions.addBillsToJob(docNo, payload);
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="glass rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between bg-white/30 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FaPlus size={12} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                ເພີ່ມບິນເຂົ້າຖ້ຽວ
              </h3>
              {docNo && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ຖ້ຽວ {docNo}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center disabled:opacity-50"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
          <div className="relative">
            <FaSearch
              size={11}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ຄົ້ນຫາເລກບິນ, ລະຫັດ/ຊື່ລູກຄ້າ ຈາກ ic_trans..."
              className="w-full pl-8 pr-8 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200"
            />
            {searching && (
              <FaSpinner
                size={11}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
              />
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            {sourceMode === "search"
              ? "ຄົ້ນຫາຈາກ ic_trans"
              : "ບິນທີ່ຍັງບໍ່ຖືກຈັດ (ພິມຢ່າງໜ້ອຍ 2 ຕົວເພື່ອຄົ້ນຫາທຸກບິນ)"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && sourceMode === "available" ? (
            <div className="py-16 flex items-center justify-center text-slate-400">
              <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
            </div>
          ) : visible.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
                <FaBox className="text-slate-400" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {sourceMode === "search"
                  ? searching
                    ? "ກຳລັງຄົ້ນຫາ..."
                    : "ບໍ່ພົບບິນຈາກ ic_trans"
                  : "ບໍ່ມີບິນທີ່ຍັງບໍ່ຖືກຈັດ"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/20 dark:divide-white/5">
              {visible.map((b) => {
                const pickedItems = selection[b.doc_no] ?? {};
                const pickedCount = Object.keys(pickedItems).length;
                const isExpanded = expandedBill === b.doc_no;
                const products = productsByBill[b.doc_no] ?? [];
                const allSelected =
                  products.length > 0 && pickedCount === products.length;
                return (
                  <div key={b.doc_no}>
                    <button
                      type="button"
                      onClick={() => void handleExpand(b.doc_no)}
                      className={`w-full px-5 py-3 text-left transition-colors flex items-center gap-3 ${
                        pickedCount > 0
                          ? "bg-emerald-500/10"
                          : "hover:bg-white/30 dark:hover:bg-white/5"
                      }`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-slate-500">
                        {isExpanded ? (
                          <FaChevronDown size={11} />
                        ) : (
                          <FaChevronRight size={11} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-white">
                            {b.doc_no}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {b.doc_date}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {b.cust_code}
                          {b.cust_name ? ` · ${b.cust_name}` : ""}
                        </p>
                      </div>
                      <div className="text-center">
                        <p
                          className={`text-xs font-bold ${
                            pickedCount > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-400"
                          }`}
                        >
                          {pickedCount > 0
                            ? `${pickedCount}/${b.count_item}`
                            : b.count_item}
                        </p>
                        <p className="text-[10px] text-slate-400">ລາຍການ</p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-slate-50/60 dark:bg-black/20 px-5 py-3">
                        {loadingProducts === b.doc_no ? (
                          <div className="py-6 flex items-center justify-center text-slate-400 text-xs">
                            <FaSpinner className="animate-spin mr-2" />
                            ກຳລັງໂຫຼດລາຍການ...
                          </div>
                        ) : products.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-400">
                            ບໍ່ມີລາຍການຄົງເຫຼືອ
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => toggleAll(b.doc_no, products)}
                              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/40 dark:hover:bg-white/5"
                            >
                              <span
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                  allSelected
                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                    : "border-slate-300 dark:border-white/20"
                                }`}
                              >
                                {allSelected && <FaCheck size={8} />}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                ເລືອກທັງໝົດ
                              </span>
                            </button>
                            {products.map((p) => {
                              const isPicked = p.item_code in pickedItems;
                              const qty = pickedItems[p.item_code] ?? p.qty;
                              return (
                                <div
                                  key={p.item_code}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                                    isPicked
                                      ? "bg-emerald-500/10"
                                      : "hover:bg-white/40 dark:hover:bg-white/5"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleItem(b.doc_no, p)}
                                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                  >
                                    <span
                                      className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                        isPicked
                                          ? "bg-emerald-600 border-emerald-600 text-white"
                                          : "border-slate-300 dark:border-white/20"
                                      }`}
                                    >
                                      {isPicked && <FaCheck size={8} />}
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-[11px] text-slate-700 dark:text-slate-200 truncate">
                                        {p.item_name}
                                      </span>
                                      <span className="block text-[10px] text-slate-400">
                                        {p.item_code}
                                      </span>
                                    </span>
                                  </button>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <input
                                      type="number"
                                      min={1}
                                      max={p.qty}
                                      value={qty}
                                      disabled={!isPicked}
                                      onChange={(e) =>
                                        setItemQty(
                                          b.doc_no,
                                          p,
                                          Number(e.target.value)
                                        )
                                      }
                                      className="w-16 px-2 py-1 text-[11px] text-right glass-input rounded text-slate-700 dark:text-slate-200 disabled:opacity-40"
                                    />
                                    <span className="text-[10px] text-slate-400 w-12">
                                      / {p.qty} {p.unit_code}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs border-t border-rose-500/20">
            {error}
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
            ເລືອກແລ້ວ{" "}
            <span className="font-bold text-emerald-600">
              {totalPickedBills}
            </span>{" "}
            ບິນ
            {totalPickedBills > 0 && (
              <span className="ml-2 text-[10px] text-slate-400">
                ·{" "}
                {Object.entries(selection)
                  .filter(([, items]) => Object.keys(items).length > 0)
                  .map(([k, items]) => `${k} (${Object.keys(items).length})`)
                  .join(", ")}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || totalPickedBills === 0}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <FaSpinner className="animate-spin" size={11} /> ກຳລັງເພີ່ມ...
                </>
              ) : (
                <>
                  <FaPlus size={10} /> ເພີ່ມ
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

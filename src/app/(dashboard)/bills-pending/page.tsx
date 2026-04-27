"use client";

import { Fragment, useEffect, useState } from "react";
import {
  FaBox,
  FaBoxOpen,
  FaChevronDown,
  FaChevronRight,
  FaExchangeAlt,
  FaFileInvoice,
  FaSearch,
  FaSortAmountDown,
  FaSortAmountUp,
  FaSpinner,
  FaTimes,
  FaTruck,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getBillProducts, getBillsPending, updateBillTransport

interface TimeUse {
  days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number;
  Days?: number; Hours?: number; Minutes?: number; Seconds?: number;
}

export interface Bill {
  row_num: number;
  doc_no: string;
  doc_date: string;
  transport_name: string;
  sale: string;
  department: string;
  transport: string;
  time_open: string;
  time_use: TimeUse | null;
  remaining_count: number;
  remaining_qty_total: number;
  partial_delivery?: boolean;
}

export interface Transport {
  code: string;
  name_1: string;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

// ── Theme ──
const T = {
  primary: "#2F65AB",
  primaryLight: "#E8EFF8",
  primaryDark: "#1E4A82",
  accent: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
} as const;

export default function BillsPendingClient() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [fromDate, setFromDate] = useState(FIXED_YEAR_START);
  const [toDate, setToDate] = useState(FIXED_YEAR_END);
  const [transportCode, setTransportCode] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedTransport, setSelectedTransport] = useState("");
  const [updating, setUpdating] = useState(false);
  const [tick, setTick] = useState(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [productsByDoc, setProductsByDoc] = useState<Record<string, Product[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const perPage = 20;

  useEffect(() => { const i = setInterval(() => setTick((v) => v + 1), 1000); return () => clearInterval(i); }, []);
  // Fetch on mount — replaces the Next.js server component that used to preload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchBills(); }, []);

  const fmtQty = (v: number) => {
    if (!Number.isFinite(v)) return "0";
    return Math.abs(v % 1) < 0.000001
      ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const baseSec = (t: TimeUse | null | undefined) => {
    if (!t) return 0;
    return (Number(t.days ?? t.Days ?? 0) || 0) * 86400 + (Number(t.hours ?? t.Hours ?? 0) || 0) * 3600 + (Number(t.minutes ?? t.Minutes ?? 0) || 0) * 60 + (Number(t.seconds ?? t.Seconds ?? 0) || 0);
  };

  const fmtDur = (t: TimeUse | null | undefined) => {
    if (!t) return null;
    const s = baseSec(t) + tick;
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = [];
    if (d > 0) p.push(`${d}d`);
    if (h > 0) p.push(`${h}h`);
    if (m > 0) p.push(`${m}m`);
    p.push(`${sec.toString().padStart(2, "0")}s`);
    return p.join(" ");
  };

  const deptList = [...new Set(bills.map((b) => b.department).filter(Boolean))].sort();

  const kw = searchText.trim().toLowerCase();
  const filtered = bills.filter((b) => {
    if (departmentFilter !== "all" && b.department !== departmentFilter) return false;
    if (!kw) return true;
    return [
      b.doc_no,
      b.doc_date,
      b.transport_name,
      b.sale,
      b.department,
      b.transport,
      b.time_open,
      b.partial_delivery ? "ກຳລັງທະຍອຍສົ່ງ partial delivery" : "",
    ].filter(Boolean).join(" ").toLowerCase().includes(kw);
  });

  // Sort by doc_date first, then by time_use within each date group.
  const sorted = [...filtered].sort((a, b) => {
    const dateCmp = sortOrder === "asc"
      ? a.doc_date.localeCompare(b.doc_date)
      : b.doc_date.localeCompare(a.doc_date);
    if (dateCmp !== 0) return dateCmp;
    return sortOrder === "asc" ? baseSec(a.time_use) - baseSec(b.time_use) : baseSec(b.time_use) - baseSec(a.time_use);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paged = sorted.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Per-date totals across the full filtered set, so the group header shows
  // meaningful numbers even when a date spans multiple pages.
  const dateTotals = filtered.reduce<Record<string, { count: number; qty: number }>>((acc, b) => {
    const prev = acc[b.doc_date] ?? { count: 0, qty: 0 };
    acc[b.doc_date] = {
      count: prev.count + (Number(b.remaining_count) || 0),
      qty: prev.qty + (Number(b.remaining_qty_total) || 0),
    };
    return acc;
  }, {});

  const fetchBills = async () => {
    setLoading(true); setTick(0); setCurrentPage(1);
    try {
      const data = await Actions.getBillsPending(fromDate, toDate, transportCode);
      setBills((data.trans || []) as Bill[]);
      setTransports((data.listtrans || []) as Transport[]);
      setExpandedDoc(null); setProductsByDoc({});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleProducts = async (docNo: string) => {
    if (expandedDoc === docNo) { setExpandedDoc(null); return; }
    setExpandedDoc(docNo);
    if (productsByDoc[docNo]) return;
    setLoadingDoc(docNo);
    try {
      const data = await Actions.getBillProducts(docNo);
      setProductsByDoc((c) => ({ ...c, [docNo]: data as Product[] }));
    } catch { setProductsByDoc((c) => ({ ...c, [docNo]: [] })); }
    finally { setLoadingDoc(null); }
  };

  const openModal = (b: Bill) => { setSelectedBill(b); setSelectedTransport(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setSelectedBill(null); setSelectedTransport(""); };

  const handleUpdate = async () => {
    if (!selectedBill || !selectedTransport) return;
    setUpdating(true);
    try {
      await Actions.updateBillTransport(selectedBill.doc_no, selectedTransport);
      const name = transports.find((t) => t.code === selectedTransport)?.name_1 ?? selectedBill.transport;
      const remove = transportCode !== "all" && selectedTransport !== transportCode;
      setBills((c) => c.map((b) => b.doc_no === selectedBill.doc_no ? { ...b, transport: name } : b).filter((b) => !remove || b.doc_no !== selectedBill.doc_no));
      closeModal();
    } finally { setUpdating(false); }
  };

  // ── Summary counts ──
  const totalQty = filtered.reduce((s, b) => s + (Number(b.remaining_qty_total) || 0), 0);
  const totalItems = filtered.reduce((s, b) => s + (Number(b.remaining_count) || 0), 0);
  const partialDeliveryCount = filtered.filter((b) => b.partial_delivery).length;

  const durColor = (t: TimeUse | null) => {
    const s = baseSec(t) + tick;
    if (s >= 4 * 3600) return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    if (s >= 2 * 3600) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  };

  const inputCls = "w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all";

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-teal-500/10">
            <FaFileInvoice className="text-lg text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white">ລາຍການລໍຖ້າຈັດສົ່ງ</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">ບິນທີ່ລໍຖ້າການຈັດສົ່ງ</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{filtered.length}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">ບິນທັງໝົດ</p>
          </div>
          <div className="w-px h-8 bg-slate-200/50 dark:bg-white/10" />
          <div className="text-right">
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmtQty(totalQty)}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">ຈຳນວນເຫຼືອ</p>
          </div>
          <div className="w-px h-8 bg-slate-200/50 dark:bg-white/10" />
          <div className="text-right">
            <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{totalItems}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">ລາຍການເຫຼືອ</p>
          </div>
          <div className="w-px h-8 bg-slate-200/50 dark:bg-white/10" />
          <div className="text-right">
            <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{partialDeliveryCount}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">ທະຍອຍສົ່ງ</p>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="glass rounded-lg p-4">
        <form onSubmit={(e) => { e.preventDefault(); void fetchBills(); }} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 items-end">
          <div className="col-span-2 md:col-span-4 xl:col-span-2">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຄົ້ນຫາ</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <input type="text" value={searchText} onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }} placeholder="ເລກບິນ, ລູກຄ້າ, ຂາຍ..." className={`${inputCls} pl-8`} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຈາກ</label>
            <input type="date" value={fromDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຫາ</label>
            <input type="date" value={toDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຂົນສົ່ງ</label>
            <select value={transportCode} onChange={(e) => setTransportCode(e.target.value)} className={inputCls}>
              <option value="all">ທັງໝົດ</option>
              {transports.map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ພະແນກ</label>
            <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }} className={inputCls}>
              <option value="all">ທັງໝົດ</option>
              {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <button type="submit" disabled={loading} className="w-full px-4 py-2 text-white rounded-lg text-xs font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500">
              {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
              ຄົ້ນຫາ
            </button>
          </div>
        </form>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="glass rounded-lg p-16 text-center">
          <FaSpinner className="animate-spin text-2xl mx-auto mb-3 text-teal-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">ກຳລັງໂຫຼດ...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-lg p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-500/10 flex items-center justify-center mx-auto mb-3">
            <FaFileInvoice className="text-slate-400 dark:text-slate-500 text-xl" />
          </div>
          <p className="text-sm text-slate-500">{kw ? "ບໍ່ພົບຂໍ້ມູນ" : "ບໍ່ມີຂໍ້ມູນ"}</p>
        </div>
      ) : (
        <>
          {/* Sort + count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">ພົບ <span className="font-bold text-slate-700">{filtered.length}</span> ລາຍການ</p>
            <button onClick={() => { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); setCurrentPage(1); }} className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
              {sortOrder === "asc" ? <><FaSortAmountUp size={11} /> ເກົ່າສຸດ</> : <><FaSortAmountDown size={11} /> ໃໝ່ສຸດ</>}
            </button>
          </div>

          {/* Table */}
          <div className="glass rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-teal-500/10">
                    {["#", "ເລກທີ", "ວັນທີ", "ລູກຄ້າ", "ຄົງເຫຼືອ", "ຂາຍ", "ພະແນກ", "ຂົນສົ່ງ", "ເວລາ", "ດຳເນີນ"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((bill, i) => {
                    const prods = productsByDoc[bill.doc_no] ?? [];
                    const exp = expandedDoc === bill.doc_no;
                    const showDateHeader = i === 0 || paged[i - 1].doc_date !== bill.doc_date;
                    const groupTotal = dateTotals[bill.doc_date] ?? { count: 0, qty: 0 };

                    return (
                      <Fragment key={bill.doc_no}>
                        {showDateHeader && (
                          <tr className="border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5">
                            <td colSpan={10} className="px-3 py-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold" style={{ color: T.primary }}>
                                  ວັນທີ {bill.doc_date}
                                </span>
                                <span className="text-slate-500">
                                  <span className="font-bold text-amber-700">{fmtQty(groupTotal.qty)} qty</span>
                                  <span className="mx-2 text-slate-300">·</span>
                                  <span className="font-semibold text-slate-700">{groupTotal.count} ລາຍການ</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className={`border-b border-slate-200/30 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors ${exp ? "bg-teal-500/5" : ""}`}>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400">
                              {(currentPage - 1) * perPage + i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => void toggleProducts(bill.doc_no)} className="flex items-center gap-1.5 font-semibold hover:underline" style={{ color: exp ? T.primary : "#1e293b" }}>
                              {exp ? <FaChevronDown size={8} style={{ color: T.primary }} /> : <FaChevronRight size={8} className="text-slate-400" />}
                              {bill.doc_no}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{bill.doc_date}</td>
                          <td className="px-3 py-2.5 text-slate-700 max-w-[140px] truncate" title={bill.transport_name}>{bill.transport_name}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-amber-700">{fmtQty(bill.remaining_qty_total)} qty</span>
                              <span className="text-[10px] text-slate-500">{bill.remaining_count} ລາຍການ</span>
                              {bill.partial_delivery && (
                                <span className="mt-1 inline-flex w-fit items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                                  ກຳລັງທະຍອຍສົ່ງ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{bill.sale}</td>
                          <td className="px-3 py-2.5">
                            {bill.department ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300">{bill.department}</span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{bill.transport || "-"}</td>
                          <td className="px-3 py-2.5">
                            {bill.time_use ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${durColor(bill.time_use)}`}>
                                {fmtDur(bill.time_use)}
                              </span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => openModal(bill)} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white transition-colors bg-teal-600 hover:bg-teal-700 dark:bg-teal-500">
                              <FaExchangeAlt className="inline mr-1" size={9} />ປ່ຽນ
                            </button>
                          </td>
                        </tr>

                        {/* Expanded products */}
                        {exp && (
                          <tr>
                            <td colSpan={10} className="p-0">
                              <div className="mx-3 my-2 rounded-lg glass overflow-hidden">
                                <div className="px-3 py-2 flex items-center justify-between bg-teal-500/10">
                                  <span className="text-[11px] font-bold flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                                    <FaBox size={10} />
                                    ສິນຄ້າ ({fmtQty(bill.remaining_qty_total)} qty / {prods.length} ລາຍການ)
                                    {bill.partial_delivery && (
                                      <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                                        ກຳລັງທະຍອຍສົ່ງ
                                      </span>
                                    )}
                                  </span>
                                  <button onClick={() => setExpandedDoc(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
                                    <FaTimes size={9} />
                                  </button>
                                </div>
                                <div className="bg-white/50 dark:bg-white/5">
                                  {loadingDoc === bill.doc_no ? (
                                    <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-6">
                                      <FaSpinner className="animate-spin" size={11} /> ກຳລັງໂຫຼດ...
                                    </div>
                                  ) : prods.length === 0 ? (
                                    <div className="flex flex-col items-center py-6 text-slate-400">
                                      <FaBoxOpen size={20} className="mb-1 opacity-50" />
                                      <p className="text-[11px]">ບໍ່ມີສິນຄ້າ</p>
                                    </div>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="border-b border-slate-200/30 dark:border-white/5 text-slate-500 dark:text-slate-400">
                                          <th className="text-left py-1.5 pl-3 pr-1 font-medium w-6">#</th>
                                          <th className="text-left py-1.5 px-1 font-medium">ລະຫັດ</th>
                                          <th className="text-left py-1.5 px-1 font-medium">ຊື່ສິນຄ້າ</th>
                                          <th className="text-right py-1.5 px-1 font-medium">ຈຳນວນ</th>
                                          <th className="text-left py-1.5 pl-1 pr-3 font-medium">ຫົວໜ່ວຍ</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {prods.map((p, pi) => (
                                          <tr key={`${bill.doc_no}-${p.item_code}-${pi}`} className="border-b border-slate-200/20 dark:border-white/5 last:border-0 hover:bg-white/30 dark:hover:bg-white/5">
                                            <td className="py-1.5 pl-3 pr-1 text-slate-400">{pi + 1}</td>
                                            <td className="py-1.5 px-1 font-mono text-[9px] text-slate-500">{p.item_code}</td>
                                            <td className="py-1.5 px-1 text-slate-700 font-medium">{p.item_name}</td>
                                            <td className="py-1.5 px-1 text-right">
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">{p.qty}</span>
                                            </td>
                                            <td className="py-1.5 pl-1 pr-3 text-slate-500">{p.unit_code}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200/30 dark:border-white/5">
                <p className="text-[11px] text-slate-500">
                  {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, sorted.length)} / {sorted.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage((v) => Math.max(1, v - 1))} disabled={currentPage === 1} className="px-2.5 py-1 text-[11px] font-medium rounded glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">ກ່ອນ</button>
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === pages || Math.abs(p - currentPage) <= 2)
                    .map((p, i, arr) => (
                      <span key={p}>
                        {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-slate-400">...</span>}
                        <button onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${p === currentPage ? "text-white bg-teal-600 dark:bg-teal-500" : "glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5"}`}>{p}</button>
                      </span>
                    ))}
                  <button onClick={() => setCurrentPage((v) => Math.min(pages, v + 1))} disabled={currentPage === pages} className="px-2.5 py-1 text-[11px] font-medium rounded glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">ຕໍ່ໄປ</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {modalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative glass-heavy glow-primary rounded-lg w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/20 dark:border-white/5 bg-teal-500/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-600 dark:bg-teal-500">
                  <FaExchangeAlt className="text-white" size={12} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">ປ່ຽນຂົນສົ່ງ</h3>
                  <p className="text-[11px] text-slate-500">{selectedBill.doc_no}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                <FaTimes size={12} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="glass-subtle rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">ລູກຄ້າ</span><span className="font-medium text-slate-700 text-right">{selectedBill.transport_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">ຂົນສົ່ງ</span><span className="font-medium text-slate-700 text-right">{selectedBill.transport || "-"}</span></div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <FaTruck className="inline mr-1 text-slate-400" size={10} />ເລືອກຂົນສົ່ງໃໝ່
                </label>
                <select value={selectedTransport} onChange={(e) => setSelectedTransport(e.target.value)} className={inputCls}>
                  <option value="">-- ເລືອກ --</option>
                  {transports.map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 dark:border-white/5 bg-white/30 dark:bg-white/5">
              <button onClick={closeModal} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ຍົກເລີກ</button>
              <button onClick={() => void handleUpdate()} disabled={!selectedTransport || updating} className="px-4 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600">
                {updating ? <FaSpinner className="animate-spin" size={10} /> : <FaExchangeAlt size={10} />}
                ຢືນຢັນ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

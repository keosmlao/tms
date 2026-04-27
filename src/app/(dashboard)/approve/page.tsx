"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaBoxOpen,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClipboardCheck,
  FaSearch,
  FaSpinner,
  FaTruck,
  FaUser,
} from "react-icons/fa";
import { Actions } from "@/lib/api";

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

interface Bill {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  telephone: string;
  count_item: number;
  products: Product[];
}

interface ApprovalItem {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  car: string;
  driver: string;
  item_bill: number;
  user_created: string;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export default function ApprovePage() {
  const router = useRouter();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [billsByDoc, setBillsByDoc] = useState<Record<string, Bill[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const perPage = 20;

  const fetchItems = () => {
    setLoading(true);
    setLoadError(null);
    void Actions.getApproveList()
      .then((data) => setItems((data ?? []) as ApprovalItem[]))
      .catch((e: any) => {
        console.error(e);
        setLoadError(e?.response?.data?.error ?? e?.message ?? "Unknown error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.doc_no, item.doc_date, item.date_logistic, item.car, item.driver, item.user_created]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [items, searchText]);

  const summary = useMemo(() => {
    return filteredItems.reduce(
      (result, item) => {
        result.jobs += 1;
        result.bills += toNumber(item.item_bill);
        if (item.car) result.cars.add(item.car);
        if (item.driver) result.drivers.add(item.driver);
        return result;
      },
      { jobs: 0, bills: 0, cars: new Set<string>(), drivers: new Set<string>() }
    );
  }, [filteredItems]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / perPage));
  const pagedItems = filteredItems.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleDetails = async (docNo: string) => {
    if (expandedDoc === docNo) {
      setExpandedDoc(null);
      return;
    }
    setExpandedDoc(docNo);
    if (billsByDoc[docNo]) return;

    setLoadingDoc(docNo);
    try {
      const data = await Actions.getJobBillsWithProducts(docNo);
      setBillsByDoc((current) => ({ ...current, [docNo]: data as Bill[] }));
    } catch (error) {
      console.error(error);
      setBillsByDoc((current) => ({ ...current, [docNo]: [] }));
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleApprove = async (docNo: string) => {
    if (!confirm(`ຕ້ອງການອະນຸມັດຖ້ຽວ ${docNo} ແທ້ບໍ?`)) return;
    setApproving(docNo);
    try {
      await Actions.approveJob(docNo);
      setItems((current) => current.filter((item) => item.doc_no !== docNo));
      if (expandedDoc === docNo) setExpandedDoc(null);
    } catch (error) {
      console.error(error);
      alert("ອະນຸມັດບໍ່ສຳເລັດ");
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <FaClipboardCheck className="text-emerald-600 text-lg" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">ອະນຸມັດຖ້ຽວ</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">ກວດ ແລະ ອະນຸມັດຖ້ຽວກ່ອນເຂົ້າຂັ້ນຕອນຈັດສົ່ງ</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass rounded-lg p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ຖ້ຽວລໍຖ້າອະນຸມັດ</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{summary.jobs}</p>
        </div>
        <div className="glass rounded-lg p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ລວມບິນ</p>
          <p className="mt-1 text-2xl font-bold text-teal-700 dark:text-teal-400">{summary.bills}</p>
        </div>
        <div className="glass rounded-lg p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ລົດ</p>
          <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">{summary.cars.size}</p>
        </div>
        <div className="glass rounded-lg p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ຄົນຂັບ</p>
          <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">{summary.drivers.size}</p>
        </div>
      </div>

      {/* Search */}
      <div className="glass rounded-lg p-4">
        <div className="max-w-md">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            <FaSearch className="inline mr-1.5 text-slate-400" size={11} />
            ຄົ້ນຫາ
          </label>
          <input
            type="text"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="ຄົ້ນຫາເລກຖ້ຽວ, ລົດ, ຄົນຂັບ..."
            className="w-full px-3 py-2 glass-input rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ພົບ <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredItems.length}</span> ລາຍການ
          </p>
          <p className="text-[11px] text-slate-400">ລໍຖ້າອະນຸມັດ</p>
        </div>

        {loading ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3 animate-pulse">
              <FaBoxOpen className="text-slate-400 text-xl" />
            </div>
            <p className="text-sm text-slate-500">ກຳລັງໂຫຼດ...</p>
          </div>
        ) : loadError ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
              <FaBoxOpen className="text-red-400 text-xl" />
            </div>
            <p className="text-sm text-red-600">ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ: {loadError}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
              <FaCheckCircle className="text-emerald-400 text-xl" />
            </div>
            <p className="text-sm text-slate-500">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ບໍ່ມີຖ້ຽວລໍຖ້າອະນຸມັດ"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລກທີ / ວັນທີ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນຈັດສົ່ງ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລົດ / ຄົນຂັບ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ບິນ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຜູ້ສ້າງ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item) => {
                    const bills = billsByDoc[item.doc_no] ?? [];
                    const isExpanded = expandedDoc === item.doc_no;
                    const isApproving = approving === item.doc_no;

                    return (
                      <Fragment key={item.doc_no}>
                        <tr className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => void toggleDetails(item.doc_no)}
                              className="flex items-center gap-2 text-left"
                            >
                              <span className="w-5 h-5 rounded-md bg-slate-500/10 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                                {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                              </span>
                              <span>
                                <span className="block font-semibold text-slate-800 dark:text-white">{item.doc_no}</span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{item.doc_date}</span>
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                              <FaTruck size={9} />
                              {item.date_logistic || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                            <div className="space-y-0.5">
                              <p className="font-medium">{item.car || "-"}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.driver || "-"}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold tabular-nums">
                              {item.item_bill}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <FaUser size={9} className="text-slate-400" />
                              <span className="truncate">{item.user_created || "-"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => void handleApprove(item.doc_no)}
                              disabled={isApproving}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                            >
                              {isApproving ? <FaSpinner className="animate-spin" size={10} /> : <FaCheck size={10} />}
                              ອະນຸມັດ
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-0 py-0 bg-white/20 dark:bg-white/5">
                              <div className="m-3 rounded-lg glass overflow-hidden">
                                <div className="px-4 py-3 bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                      ລາຍການບິນໃນຖ້ຽວ {item.doc_no}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      ສ້າງເມື່ອ {item.created_at || item.doc_date}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => setExpandedDoc(null)}
                                    className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700"
                                  >
                                    ປິດ
                                  </button>
                                </div>
                                <div className="p-3">
                                  {loadingDoc === item.doc_no ? (
                                    <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                                      <FaSpinner className="animate-spin" size={12} />
                                      ກຳລັງໂຫຼດ...
                                    </div>
                                  ) : bills.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-slate-400">
                                      ບໍ່ພົບລາຍການບິນ
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {bills.map((bill, idx) => (
                                        <div key={`${item.doc_no}-${bill.bill_no}`} className="glass-subtle rounded-lg overflow-hidden">
                                          <div className="px-3 py-2.5 bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                                                  {idx + 1}
                                                </span>
                                                <div>
                                                  <p className="text-xs font-semibold text-slate-800 dark:text-white">{bill.bill_no}</p>
                                                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                                    {bill.bill_date} · {bill.cust_name || bill.cust_code}
                                                  </p>
                                                </div>
                                              </div>
                                              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                                {toNumber(bill.count_item)} ລາຍການ
                                              </span>
                                            </div>
                                            {bill.telephone && (
                                              <p className="text-[10px] text-slate-400 mt-1 ml-7">ໂທ: {bill.telephone}</p>
                                            )}
                                          </div>
                                          {bill.products && bill.products.length > 0 && (
                                            <div className="p-2">
                                              <table className="w-full text-[10px]">
                                                <thead>
                                                  <tr className="text-slate-400 border-b border-slate-200/30 dark:border-white/5">
                                                    <th className="text-left py-1 pl-2 pr-1 font-medium w-6">#</th>
                                                    <th className="text-left py-1 px-1 font-medium">ລະຫັດ</th>
                                                    <th className="text-left py-1 px-1 font-medium">ຊື່ສິນຄ້າ</th>
                                                    <th className="text-right py-1 px-1 font-medium">ຈຳນວນ</th>
                                                    <th className="text-left py-1 pl-1 pr-2 font-medium">ຫົວໜ່ວຍ</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {bill.products.map((product, pIdx) => (
                                                    <tr key={`${bill.bill_no}-${product.item_code}-${pIdx}`} className="border-b border-slate-200/20 dark:border-white/5 last:border-0">
                                                      <td className="py-1 pl-2 pr-1 text-slate-400">{pIdx + 1}</td>
                                                      <td className="py-1 px-1 font-mono text-[9px] text-slate-500">{product.item_code}</td>
                                                      <td className="py-1 px-1 text-slate-700 dark:text-slate-200">{product.item_name}</td>
                                                      <td className="py-1 px-1 text-right font-semibold text-emerald-600">{product.qty}</td>
                                                      <td className="py-1 pl-1 pr-2 text-slate-500">{product.unit_code}</td>
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/30 dark:border-white/5">
                <p className="text-[11px] text-slate-500">
                  ສະແດງ {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filteredItems.length)} ຈາກ {filteredItems.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ກ່ອນ
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ຕໍ່ໄປ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* After-approve footer quick nav */}
      <button
        type="button"
        onClick={() => router.push("/approve/report")}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        ເບິ່ງລາຍງານການອະນຸມັດ →
      </button>
    </div>
  );
}

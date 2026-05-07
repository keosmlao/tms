"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FaPrint, FaArrowLeft, FaSpinner, FaExclamationTriangle } from "react-icons/fa";
import Link from "next/link";
import { Actions } from "@/lib/api";

interface PrintItem {
  item_code: string;
  item_name: string;
  qty: number;
  selected_qty: number;
  unit_code: string;
}

interface PrintBill {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  telephone: string;
  items: PrintItem[];
}

interface PrintHeader {
  doc_no: string;
  doc_date: string;
  date_logistic: string;
  created_at: string;
  car: string;
  driver: string;
  user_created: string;
  approve_user: string;
  delivery_round_code: string;
  delivery_round_name: string;
  delivery_round_time_label: string;
  job_status: number;
}

interface PrintData {
  header: PrintHeader;
  bills: PrintBill[];
}

const fmtQty = (v: number) => {
  if (!Number.isFinite(v)) return "0";
  return Math.abs(v % 1) < 0.000001
    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function JobPrintPage() {
  const params = useParams<{ docNo: string }>();
  const docNo = decodeURIComponent(params.docNo ?? "");
  const [data, setData] = useState<PrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docNo) {
      setError("ບໍ່ມີ doc_no");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Actions.getJobPrintData(docNo)
      .then((res) => {
        if (!active) return;
        setData(res as PrintData);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [docNo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center text-rose-600">
        <FaExclamationTriangle className="inline mr-2" />
        {error ?? "ບໍ່ພົບຂໍ້ມູນ"}
        <div className="mt-4">
          <Link href="/jobs" className="text-sm text-slate-500 underline">
            ← ກັບໄປ /jobs
          </Link>
        </div>
      </div>
    );
  }

  const { header, bills } = data;
  const totalBills = bills.length;
  const totalItems = bills.reduce((acc, b) => acc + b.items.length, 0);
  const totalQty = bills.reduce(
    (acc, b) => acc + b.items.reduce((s, it) => s + it.selected_qty, 0),
    0
  );

  return (
    <div className="max-w-[210mm] mx-auto bg-white text-slate-900 print:max-w-none print:mx-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }
          html,
          body {
            background: white !important;
          }
        }
      `}</style>
      {/* Action bar — hidden on print */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 print:hidden">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <FaArrowLeft size={12} /> ກັບ
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900"
        >
          <FaPrint size={13} /> ພິມ
        </button>
      </div>

      {/* Printable content */}
      <div className="px-6 py-5 print:px-4 print:py-2">
        {/* Title */}
        <div className="text-center border-b-2 border-slate-800 pb-2 mb-4">
          <h1 className="text-xl font-bold tracking-wide">ໃບລາຍການຈັດຖ້ຽວສິນຄ້າ</h1>
          <p className="text-xs text-slate-500 mt-0.5">DELIVERY DISPATCH SHEET</p>
        </div>

        {/* Header */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mb-4">
          <div>
            <span className="font-semibold">ເລກຖ້ຽວ:</span>{" "}
            <span className="font-mono">{header.doc_no}</span>
          </div>
          <div>
            <span className="font-semibold">ວັນທີ:</span> {header.doc_date}
          </div>
          <div>
            <span className="font-semibold">ລົດ:</span> {header.car}
          </div>
          <div>
            <span className="font-semibold">ຄົນຂັບ:</span> {header.driver}
          </div>
          <div>
            <span className="font-semibold">ວັນທີສົ່ງ:</span> {header.date_logistic}
          </div>
          <div>
            <span className="font-semibold">ຮອບສົ່ງ:</span>{" "}
            {header.delivery_round_name || "-"}
            {header.delivery_round_time_label && (
              <span className="text-slate-500"> ({header.delivery_round_time_label})</span>
            )}
          </div>
          <div>
            <span className="font-semibold">ຜູ້ສ້າງ:</span> {header.user_created}
          </div>
          <div>
            <span className="font-semibold">ອະນຸມັດ:</span> {header.approve_user}
          </div>
        </div>

        {/* Bills */}
        {bills.length === 0 ? (
          <p className="text-center text-slate-500 py-6 text-sm">
            ບໍ່ມີບິນໃນຖ້ຽວນີ້
          </p>
        ) : (
          <div className="space-y-3">
            {bills.map((bill, idx) => (
              <div
                key={bill.bill_no}
                className="border border-slate-300 rounded break-inside-avoid"
              >
                <div className="bg-slate-100 px-3 py-1.5 flex items-center justify-between text-[12px] border-b border-slate-300">
                  <div className="flex items-center gap-3">
                    <span className="font-bold">#{idx + 1}</span>
                    <span className="font-mono font-semibold">{bill.bill_no}</span>
                    <span className="text-slate-500">{bill.bill_date}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{bill.cust_name}</div>
                    {bill.telephone && (
                      <div className="text-[10px] text-slate-500">☎ {bill.telephone}</div>
                    )}
                  </div>
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-2 py-1 text-left w-8">#</th>
                      <th className="px-2 py-1 text-left">ລະຫັດ</th>
                      <th className="px-2 py-1 text-left">ຊື່ສິນຄ້າ</th>
                      <th className="px-2 py-1 text-right w-20">ຈຳນວນ</th>
                      <th className="px-2 py-1 text-left w-16">ໜ່ວຍ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-center text-slate-400">
                          —
                        </td>
                      </tr>
                    ) : (
                      bill.items.map((it, i) => (
                        <tr
                          key={`${it.item_code}-${i}`}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-2 py-1 text-slate-500">{i + 1}</td>
                          <td className="px-2 py-1 font-mono text-slate-600">
                            {it.item_code}
                          </td>
                          <td className="px-2 py-1">{it.item_name}</td>
                          <td className="px-2 py-1 text-right font-semibold">
                            {fmtQty(it.selected_qty)}
                          </td>
                          <td className="px-2 py-1 text-slate-600">{it.unit_code}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        <div className="mt-4 pt-3 border-t-2 border-slate-800 grid grid-cols-3 gap-x-6 text-[12px]">
          <div>
            <span className="font-semibold">ລວມບິນ:</span> {totalBills}
          </div>
          <div>
            <span className="font-semibold">ລວມລາຍການ:</span> {totalItems}
          </div>
          <div>
            <span className="font-semibold">ລວມຈຳນວນ:</span> {fmtQty(totalQty)}
          </div>
        </div>

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-[11px] text-center">
          <div>
            <div className="border-t border-slate-400 pt-1">ຄົນສ່ງ / Driver</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1">ຄົນຮັບ / Customer</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1">ຜູ້ກວດ / Checker</div>
          </div>
        </div>
      </div>
    </div>
  );
}

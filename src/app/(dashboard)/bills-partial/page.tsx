"use client";

import { FaBoxOpen, FaUser } from "react-icons/fa";
import StatusListPage, { type Column } from "@/components/StatusListPage";
import { Actions } from "@/lib/api";

interface PartialBill {
  doc_date: string;
  doc_no: string;
  bill_no: string;
  bill_date: string;
  date_logistic: string;
  completed_at: string | null;
  cust_code: string;
  cust_name: string;
  telephone: string;
  car: string;
  driver: string;
  remark: string;
  selected_total: number;
  delivered_total: number;
  remaining_total: number;
}

const fmtNum = (v: number) =>
  v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, "");

const columns: Column<PartialBill>[] = [
  { key: "completed_at", label: "ສຳເລັດເມື່ອ", render: (r) => r.completed_at ?? "-" },
  {
    key: "bill_no",
    label: "ເລກບິນ",
    className: "font-mono font-semibold text-amber-600 dark:text-amber-400",
  },
  {
    key: "cust_name",
    label: "ລູກຄ້າ",
    render: (r) => (
      <div>
        <div className="text-slate-700 dark:text-slate-200">{r.cust_name}</div>
        <div className="text-[11px] text-slate-400">{r.telephone}</div>
      </div>
    ),
  },
  {
    key: "qty",
    label: "ຈັດ / ສົ່ງ / ເຫຼືອ",
    render: (r) => (
      <span>
        <span className="text-slate-500">{fmtNum(r.selected_total)}</span>
        <span className="mx-1 text-slate-400">/</span>
        <span className="text-emerald-600 dark:text-emerald-400">{fmtNum(r.delivered_total)}</span>
        <span className="mx-1 text-slate-400">/</span>
        <span className="text-rose-600 dark:text-rose-400 font-bold">{fmtNum(r.remaining_total)}</span>
      </span>
    ),
  },
  { key: "car", label: "ລົດ" },
  {
    key: "driver",
    label: "ຄົນຂັບ",
    render: (r) => (
      <span>
        <FaUser className="inline mr-1 text-slate-400" size={10} /> {r.driver}
      </span>
    ),
  },
];

export default function BillsPartialPage() {
  return (
    <StatusListPage<PartialBill>
      title="ບິນສົ່ງບໍ່ຄົບ"
      subtitle="ບິນທີ່ສົ່ງໄປແລ້ວແຕ່ມີສິນຄ້າເຫຼືອ"
      icon={<FaBoxOpen />}
      tone="amber"
      fetchData={(from, to) =>
        Actions.getBillsPartialList(from, to) as Promise<PartialBill[]>
      }
      columns={columns}
      rowKey={(r) => `${r.doc_no}-${r.bill_no}`}
      searchKeys={["bill_no", "cust_name", "car", "driver"]}
      stats={(rows) => [
        {
          label: "ບິນສົ່ງບໍ່ຄົບ",
          value: rows.length,
          icon: <FaBoxOpen />,
          tone: "amber",
        },
        {
          label: "ຍອດເຫຼືອລວມ",
          value: fmtNum(rows.reduce((a, b) => a + Number(b.remaining_total ?? 0), 0)),
          icon: <FaBoxOpen />,
          tone: "rose",
        },
      ]}
    />
  );
}

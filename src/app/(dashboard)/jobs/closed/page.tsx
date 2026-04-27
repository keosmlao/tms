"use client";

import { FaBoxOpen, FaCheckCircle, FaTruck, FaUser } from "react-icons/fa";
import StatusListPage, { type Column } from "@/components/StatusListPage";
import { Actions } from "@/lib/api";

interface JobRow {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  driver_closed_at: string | null;
  admin_closed_at: string | null;
  car: string;
  driver: string;
  user_created: string;
  approve_user: string;
  admin_close_user: string;
  item_bill: number;
  pending_pickup_count: number;
  picked_count: number;
  miles_start: string;
  miles_end: string;
}

const columns: Column<JobRow>[] = [
  { key: "doc_date", label: "ວັນທີ" },
  {
    key: "doc_no",
    label: "ເລກຖ້ຽວ",
    className: "font-mono font-semibold text-emerald-600 dark:text-emerald-400",
  },
  { key: "admin_closed_at", label: "Admin ປິດເມື່ອ", render: (r) => r.admin_closed_at ?? "-" },
  { key: "admin_close_user", label: "Admin" },
  {
    key: "car",
    label: "ລົດ",
    render: (r) => (
      <span>
        <FaTruck className="inline mr-1 text-slate-400" size={10} /> {r.car}
      </span>
    ),
  },
  {
    key: "driver",
    label: "ຄົນຂັບ",
    render: (r) => (
      <span>
        <FaUser className="inline mr-1 text-slate-400" size={10} /> {r.driver}
      </span>
    ),
  },
  {
    key: "picked",
    label: "ເບີກແລ້ວ / ທັງໝົດ",
    headerClassName: "text-center",
    className: "text-center",
    render: (r) => (
      <span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
          {r.picked_count}
        </span>
        <span className="text-slate-400 mx-1">/</span>
        <span className="text-slate-700 dark:text-slate-200 font-bold">
          {r.item_bill}
        </span>
      </span>
    ),
  },
  {
    key: "pending_pickup_count",
    label: "ລໍ",
    headerClassName: "text-center",
    className: "text-center font-bold text-orange-600 dark:text-orange-400",
  },
  {
    key: "miles",
    label: "ໄມລ",
    render: (r) => `${r.miles_start || "-"} → ${r.miles_end || "-"}`,
  },
];

export default function JobsClosedPage() {
  return (
    <StatusListPage<JobRow>
      title="ປິດສຳເລັດແລ້ວ"
      subtitle="ຖ້ຽວທີ່ admin ປິດທ້າຍແລ້ວ"
      icon={<FaCheckCircle />}
      tone="emerald"
      fetchData={(from, to) =>
        Actions.getJobsClosed(from, to) as Promise<JobRow[]>
      }
      columns={columns}
      rowKey={(r) => r.doc_no}
      searchKeys={["doc_no", "car", "driver"]}
      stats={(rows) => [
        {
          label: "ຖ້ຽວທີ່ປິດສຳເລັດ",
          value: rows.length,
          icon: <FaCheckCircle />,
          tone: "emerald",
        },
        {
          label: "ບິນລໍເບີກ",
          value: rows.reduce((a, b) => a + Number(b.pending_pickup_count ?? 0), 0),
          icon: <FaBoxOpen />,
          tone: "orange",
        },
        {
          label: "ບິນເບີກແລ້ວ",
          value: rows.reduce((a, b) => a + Number(b.picked_count ?? 0), 0),
          icon: <FaTruck />,
          tone: "emerald",
        },
      ]}
    />
  );
}

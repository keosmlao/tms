"use client";

import { FaBoxOpen, FaTruck, FaUser } from "react-icons/fa";
import StatusListPage, { type Column } from "@/components/StatusListPage";
import { Actions } from "@/lib/api";

interface JobRow {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  car: string;
  driver: string;
  user_created: string;
  approve_user: string;
  item_bill: number;
  pending_receive_count: number;
  received_count: number;
}

const columns: Column<JobRow>[] = [
  { key: "doc_date", label: "ວັນທີ" },
  {
    key: "doc_no",
    label: "ເລກຖ້ຽວ",
    className: "font-mono font-semibold text-amber-600 dark:text-amber-400",
  },
  { key: "created_at", label: "ສ້າງເມື່ອ" },
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
    key: "received",
    label: "ຮັບແລ້ວ / ທັງໝົດ",
    headerClassName: "text-center",
    className: "text-center",
    render: (r) => (
      <span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
          {r.received_count}
        </span>
        <span className="text-slate-400 mx-1">/</span>
        <span className="text-slate-700 dark:text-slate-200 font-bold">
          {r.item_bill}
        </span>
      </span>
    ),
  },
  {
    key: "pending_receive_count",
    label: "ລໍ",
    headerClassName: "text-center",
    className: "text-center font-bold text-amber-600 dark:text-amber-400",
  },
];

export default function JobsWaitingReceivePage() {
  return (
    <StatusListPage<JobRow>
      title="ລໍຖ້າຮັບຖ້ຽວ"
      subtitle="ຖ້ຽວທີ່ອະນຸມັດແລ້ວ ລໍຄົນຂັບກົດ ‘ຮັບຖ້ຽວ’"
      icon={<FaBoxOpen />}
      tone="amber"
      fetchData={(from, to) =>
        Actions.getJobsWaitingReceive(from, to) as Promise<JobRow[]>
      }
      columns={columns}
      rowKey={(r) => r.doc_no}
      searchKeys={["doc_no", "car", "driver"]}
      stats={(rows) => [
        {
          label: "ຖ້ຽວທີ່ຍັງບໍ່ຮັບ",
          value: rows.length,
          icon: <FaBoxOpen />,
          tone: "amber",
        },
        {
          label: "ບິນລໍຮັບ",
          value: rows.reduce((a, b) => a + Number(b.pending_receive_count ?? 0), 0),
          icon: <FaBoxOpen />,
          tone: "orange",
        },
        {
          label: "ບິນຮັບແລ້ວ",
          value: rows.reduce((a, b) => a + Number(b.received_count ?? 0), 0),
          icon: <FaTruck />,
          tone: "emerald",
        },
      ]}
    />
  );
}

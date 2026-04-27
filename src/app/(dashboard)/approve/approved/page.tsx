"use client";

import { FaCheckDouble, FaTruck, FaUser } from "react-icons/fa";
import StatusListPage, { type Column } from "@/components/StatusListPage";
import { Actions } from "@/lib/api";

interface ApprovedJob {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  car: string;
  driver: string;
  user_created: string;
  approve_user: string;
  item_bill: number;
  job_status: number;
  job_status_text: string;
}

const STATUS_COLORS: Record<number, string> = {
  0: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  1: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  2: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  3: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  4: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const columns: Column<ApprovedJob>[] = [
  { key: "doc_date", label: "ວັນທີ" },
  {
    key: "doc_no",
    label: "ເລກຖ້ຽວ",
    className: "font-mono font-semibold text-teal-600 dark:text-teal-400",
  },
  {
    key: "job_status",
    label: "ສະຖານະ",
    render: (r) => (
      <span
        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
          STATUS_COLORS[r.job_status] ?? STATUS_COLORS[0]
        }`}
      >
        {r.job_status_text}
      </span>
    ),
  },
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
  { key: "approve_user", label: "ຜູ້ອະນຸມັດ" },
  {
    key: "item_bill",
    label: "ບິນ",
    headerClassName: "text-center",
    className: "text-center font-bold text-slate-700 dark:text-slate-200",
  },
];

export default function ApproveApprovedPage() {
  return (
    <StatusListPage<ApprovedJob>
      title="ອະນຸມັດແລ້ວ"
      subtitle="ຖ້ຽວທີ່ຖືກອະນຸມັດ ໃນຊ່ວງວັນທີ່ເລືອກ"
      icon={<FaCheckDouble />}
      tone="teal"
      fetchData={(from, to) =>
        Actions.getApprovedList(from, to) as Promise<ApprovedJob[]>
      }
      columns={columns}
      rowKey={(r) => r.doc_no}
      searchKeys={["doc_no", "car", "driver", "approve_user"]}
      stats={(rows) => [
        {
          label: "ຖ້ຽວທີ່ອະນຸມັດແລ້ວ",
          value: rows.length,
          icon: <FaCheckDouble />,
          tone: "teal",
        },
      ]}
    />
  );
}

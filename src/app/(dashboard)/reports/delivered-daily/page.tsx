"use client";

import { FaCheckCircle } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { DailyStatusReport, type AttemptItem, type StatusReportData, type StatusRow } from "../_daily-status-report";

interface ApiRow {
  finished_date: string;
  finished_date_display: string;
  finished_time: string;
  bill_no: string;
  doc_no: string;
  customer: string;
  department: string;
  sale: string;
  transport_code: string;
  transport: string;
  car: string;
  driver: string;
  item_count: number;
  remark: string;
}

export default function DeliveredDailyReportPage() {
  return (
    <DailyStatusReport
      title="ລາຍງານການຈັດສົ່ງສຳເລັດປະຈຳວັນ"
      subtitle="Delivered Bills · Daily"
      icon={<FaCheckCircle className="text-emerald-300" size={18} />}
      tone="emerald"
      filenamePrefix="delivered-bills"
      showFinished
      fetchDetails={async (row) => {
        const items = (await Actions.getAttemptDeliveryItems(
          row.doc_no,
          row.bill_no ?? row.doc_no
        )) as AttemptItem[];
        return items ?? [];
      }}
      fetcher={async (from, to) => {
        const raw = (await Actions.getReportDeliveredDaily(from, to)) as {
          rows: ApiRow[];
          days: string[];
          departments: string[];
          transports: string[];
          totals: { bills: number; items: number };
        };
        const rows: StatusRow[] = raw.rows.map((r) => ({
          primary_date: r.finished_date,
          primary_date_display: r.finished_date_display,
          finished_time: r.finished_time,
          department: r.department,
          transport_code: r.transport_code,
          transport: r.transport,
          doc_no: r.doc_no,
          bill_no: r.bill_no,
          customer: r.customer,
          sale: r.sale,
          car: r.car,
          driver: r.driver,
          item_count: Number(r.item_count) || 0,
          remark: r.remark,
        }));
        const data: StatusReportData = { ...raw, rows };
        return data;
      }}
    />
  );
}

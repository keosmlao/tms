"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCalendarDay,
  FaCheckCircle,
  FaLock,
  FaRegCommentDots,
  FaSearch,
  FaSpinner,
  FaSyncAlt,
  FaTimes,
  FaUser,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import Chatter from "@/components/Chatter";

interface DailyBillRow {
  bill_no: string;
  bill_date: string;
  bill_date_iso: string;
  created_at: string;
  customer_name: string;
  cust_code: string;
  sale_code: string;
  salesperson: string;
  sales_remark: string;
  scheduled_date: string | null;
  scheduled_date_display: string | null;
  transport_code: string;
  transport_name: string;
  action_status: string;
  delivery_route_code: string;
  delivery_round_code: string;
  updated_by: string;
  locked: boolean;
  pending_updated_at: string;
  scope_role: string;
  scope_label: string;
}

interface Branch {
  code: string;
  name_1: string;
}

interface SaveResult {
  scheduled_date: string | null;
  scheduled_date_display: string;
  transport_code: string;
  transport_name: string;
}

// One editable table row. Keeps its own draft state so editing one row never
// re-renders or resets the others.
function BillEditRow({
  row,
  branches,
  unread,
  selected,
  onSelect,
  onSaved,
}: {
  row: DailyBillRow;
  branches: Branch[];
  unread: number;
  selected: boolean;
  onSelect: () => void;
  onSaved: (billNo: string, r: SaveResult) => void;
}) {
  const [date, setDate] = useState(row.scheduled_date ?? "");
  const [branch, setBranch] = useState(row.transport_code ?? "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDate(row.scheduled_date ?? "");
    setBranch(row.transport_code ?? "");
  }, [row.scheduled_date, row.transport_code]);

  const locked = row.locked;
  const dirty =
    (date || "") !== (row.scheduled_date ?? "") || (branch || "") !== (row.transport_code ?? "");

  const save = async () => {
    setSaving(true);
    setError("");
    setSavedOk(false);
    try {
      const res = (await Actions.saveSalesBillSchedule({
        bill_no: row.bill_no,
        scheduled_date: date || null,
        transport_code: branch || null,
      })) as SaveResult;
      onSaved(row.bill_no, res);
      setSavedOk(true);
      window.setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      setError((err as Error)?.message ?? "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const scheduled = Boolean(row.scheduled_date);

  return (
    <tr className={selected ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"}>
      <td className="whitespace-nowrap px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-900 dark:text-white">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${scheduled ? "bg-emerald-500" : "bg-amber-400"}`} />
          {row.bill_no}
        </span>
      </td>
      <td className="max-w-[160px] truncate px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-slate-200">
        {row.customer_name || "-"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-[10px] text-slate-400">{row.created_at || row.bill_date}</td>
      <td className="px-2 py-1">
        <input
          type="date"
          value={date}
          min={FIXED_YEAR_START}
          max={FIXED_YEAR_END}
          disabled={locked}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 w-[130px] rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-800 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-white/5"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={branch}
          disabled={locked}
          onChange={(e) => setBranch(e.target.value)}
          className="h-7 w-[150px] rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-800 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-white/5"
        >
          <option value="">— ສາຂາ —</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name_1 || b.code}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        {locked ? (
          <span
            title="ຝ່າຍຂົນສົ່ງໄດ້ແກ້ໄຂແລ້ວ — ແກ້ບໍ່ໄດ້"
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
          >
            <FaLock size={9} /> ຂົນສົ່ງລັອກ
          </span>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            title={error || undefined}
            className={`inline-flex h-7 items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-bold text-white transition ${
              error
                ? "bg-rose-500"
                : saving || !dirty
                  ? "cursor-not-allowed bg-slate-300 dark:bg-slate-700"
                  : "bg-teal-600 hover:bg-teal-700"
            }`}
          >
            {saving ? (
              <FaSpinner className="animate-spin" size={10} />
            ) : savedOk ? (
              <FaCheckCircle size={10} />
            ) : null}
            {saving ? "..." : savedOk ? "ແລ້ວ" : "ບັນທຶກ"}
          </button>
        )}
      </td>
      <td className="px-1 py-1">
        <button
          type="button"
          onClick={onSelect}
          title="ສົນທະນາ / chatter"
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-teal-600 dark:hover:bg-white/10"
        >
          <FaRegCommentDots size={13} />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </td>
    </tr>
  );
}

export default function SalesDailyBillsPage() {
  const [date, setDate] = useState(getFixedTodayDate());
  const [searchText, setSearchText] = useState("");
  const [rows, setRows] = useState<DailyBillRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBillNo, setSelectedBillNo] = useState<string | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await Actions.getDailyOpenedBillsForSales({
        // Send undefined (not "") if the date was cleared — the schema requires
        // YYYY-MM-DD or nothing, and the action defaults a missing date to today.
        date: date || undefined,
        search: searchText.trim() || undefined,
      })) as DailyBillRow[];
      setRows(data ?? []);
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, searchText]);

  // Branch dropdown options — loaded once.
  useEffect(() => {
    Actions.getSalesTransportBranches()
      .then((data) => setBranches((data ?? []) as Branch[]))
      .catch(() => undefined);
  }, []);

  // (Re)load when the date changes (search is applied via the form submit).
  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Unread chatter badges for the visible bills.
  useEffect(() => {
    if (rows.length === 0) {
      setUnreadMap({});
      return;
    }
    Actions.getUnreadChatterCounts(
      "bill",
      rows.map((r) => r.bill_no)
    )
      .then((data) => {
        const map: Record<string, number> = {};
        ((data ?? []) as { record_id: string; unread: number }[]).forEach((x) => {
          map[x.record_id] = x.unread;
        });
        setUnreadMap(map);
      })
      .catch(() => undefined);
  }, [rows]);

  // Opening a bill marks its conversation read — clear its badge immediately.
  useEffect(() => {
    if (selectedBillNo) {
      setUnreadMap((m) => (m[selectedBillNo] ? { ...m, [selectedBillNo]: 0 } : m));
    }
  }, [selectedBillNo]);

  // Close the chatter drawer with Escape.
  useEffect(() => {
    if (!selectedBillNo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedBillNo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBillNo]);

  const onSaved = useCallback((billNo: string, res: SaveResult) => {
    setRows((prev) =>
      prev.map((r) =>
        r.bill_no === billNo
          ? {
              ...r,
              scheduled_date: res.scheduled_date,
              scheduled_date_display: res.scheduled_date_display || null,
              transport_code: res.transport_code,
              transport_name: res.transport_name || r.transport_name,
            }
          : r
      )
    );
  }, []);

  const scopeLabel = rows[0]?.scope_label ?? "ຂອງຕົນເອງ";
  const scheduledCount = useMemo(() => rows.filter((r) => r.scheduled_date).length, [rows]);
  const selectedRow = rows.find((r) => r.bill_no === selectedBillNo) ?? null;

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
        <div className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h1 className="text-sm font-extrabold text-slate-900 dark:text-white">ກຳນົດວັນຈັດສົ່ງ</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 dark:text-sky-400">
              <FaUser size={8} />
              {scopeLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-400">
              <FaCalendarDay size={8} />
              ກຳນົດແລ້ວ {scheduledCount}/{rows.length}
            </span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadRows();
            }}
            className="flex flex-wrap items-center gap-1.5"
          >
            <input
              type="date"
              value={date}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(event) => setDate(event.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] dark:border-white/10 dark:bg-white/5"
            />
            <div className="relative">
              <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ຄົ້ນຫາ..."
                className="h-8 w-40 rounded-md border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-[11px] text-slate-700 outline-hidden transition-colors focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-teal-600 px-3 text-[11px] font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
            >
              {loading ? <FaSpinner className="animate-spin" size={10} /> : <FaSyncAlt size={10} />}
              ອັບເດດ
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-white/[0.06]">
          <p className="text-[11px] font-semibold text-slate-500">{rows.length} ບິນ · ເບີດ {date}</p>
          {loading && <FaSpinner className="animate-spin text-teal-500" size={13} />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wide text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.03]">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold">ບິນ</th>
                <th className="px-2.5 py-1.5 font-semibold">ລູກຄ້າ</th>
                <th className="px-2.5 py-1.5 font-semibold">ເບີດ</th>
                <th className="px-2.5 py-1.5 font-semibold">ວັນຈັດສົ່ງ</th>
                <th className="px-2.5 py-1.5 font-semibold">ສາຂາຂົນສົ່ງ</th>
                <th className="px-2.5 py-1.5 font-semibold" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {rows.map((row) => (
                <BillEditRow
                  key={row.bill_no}
                  row={row}
                  branches={branches}
                  unread={unreadMap[row.bill_no] ?? 0}
                  selected={selectedBillNo === row.bill_no}
                  onSelect={() => setSelectedBillNo(row.bill_no)}
                  onSaved={onSaved}
                />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loading && (
            <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center text-slate-400">
              <FaCalendarDay size={26} className="mb-2 opacity-50" />
              <p className="text-xs font-semibold">ບໍ່ມີບິນທີ່ເບີດໃນວັນທີນີ້</p>
            </div>
          )}
        </div>
      </section>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="close"
            onClick={() => setSelectedBillNo(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-white/[0.06]">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-extrabold text-slate-900 dark:text-white">{selectedRow.bill_no}</p>
                <p className="truncate text-[11px] text-slate-500">{selectedRow.customer_name || "-"}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillNo(null)}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <FaTimes size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              <Chatter model="bill" recordId={selectedRow.bill_no} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

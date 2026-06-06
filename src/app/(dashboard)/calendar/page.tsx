"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaBoxOpen,
  FaCheckCircle,
  FaTruck,
  FaRoute,
  FaClock,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  StatusPageHeader,
  StatusStatGrid,
  StatusControlPanel,
} from "@/components/status-page-shell";
import {
  FIXED_MONTH_MIN,
  FIXED_MONTH_MAX,
  getFixedTodayMonth,
  getFixedTodayDate,
} from "@/lib/fixed-year";

interface RoundBreak {
  code: string | null;
  name: string;
  time_label: string;
  bills: number;
}
interface RouteBreak {
  code: string | null;
  name: string;
  bills: number;
}
interface CalDay {
  date: string;
  planned_bills: number;
  delivered_bills: number;
  planned_rounds: RoundBreak[];
  delivered_rounds: RoundBreak[];
  planned_routes: RouteBreak[];
  delivered_routes: RouteBreak[];
}
interface CalData {
  month: string;
  days: CalDay[];
  summary: { planned_bills: number; delivered_bills: number; active_days: number };
}
interface PlannedBill {
  bill_no: string;
  round_code: string | null;
  round_name: string;
  route_code: string | null;
  route_name: string;
  action_status: string;
  action_label: string;
  remark: string;
  customer: string;
}
interface DeliveredBill {
  bill_no: string;
  doc_no: string;
  round_code: string | null;
  round_name: string;
  route_code: string | null;
  route_name: string;
  sent_time: string;
  customer: string;
  car: string;
  driver: string;
  item_count: number;
}
interface DayDetail {
  date: string;
  planned: PlannedBill[];
  delivered: DeliveredBill[];
}

const WEEKDAYS = ["ອາທິດ", "ຈັນ", "ອັງຄານ", "ພຸດ", "ພະຫັດ", "ສຸກ", "ເສົາ"];
const WEEKDAYS_SHORT = ["ອາ", "ຈ", "ອ", "ພ", "ພຫ", "ສຸ", "ສ"];
const LAO_MONTHS = [
  "ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ",
  "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ",
];

const pad = (n: number) => String(n).padStart(2, "0");

function addMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (next < FIXED_MONTH_MIN) return FIXED_MONTH_MIN;
  if (next > FIXED_MONTH_MAX) return FIXED_MONTH_MAX;
  return next;
}

// Unique round names present on a day (delivered first, then planned-only) for
// the compact chips shown inside each calendar cell.
function dayRoundNames(day: CalDay): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...day.delivered_rounds, ...day.planned_rounds]) {
    if (!seen.has(r.name)) {
      seen.add(r.name);
      out.push(r.name);
    }
  }
  return out;
}

function groupByRound<T extends { round_name: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    if (!map.has(it.round_name)) map.set(it.round_name, []);
    map.get(it.round_name)!.push(it);
  }
  return Array.from(map.entries());
}

export default function DeliveryCalendarPage() {
  const today = getFixedTodayDate();
  const [month, setMonth] = useState<string>(() => getFixedTodayMonth());
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchMonth = useCallback(() => {
    setLoading(true);
    Actions.getDeliveryCalendar(month)
      .then((d) => setData(d as CalData))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    fetchMonth();
  }, [fetchMonth]);

  const dayMap = useMemo(() => {
    const m = new Map<string, CalDay>();
    for (const d of data?.days ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const openDay = useCallback((date: string) => {
    setSelectedDate(date);
    setDetailLoading(true);
    setDetail(null);
    Actions.getDeliveryCalendarDay(date)
      .then((d) => setDetail(d as DayDetail))
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, []);

  // When the month changes, default the drill-down to today (if it falls in the
  // visible month) so the panel is never empty on first paint.
  useEffect(() => {
    if (!data) return;
    const inMonth = today.startsWith(month);
    const target = inMonth ? today : null;
    setSelectedDate(target);
    if (target) openDay(target);
    else setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.month]);

  const [yStr, mStr] = month.split("-");
  const year = Number(yStr);
  const mon = Number(mStr);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstWeekday = new Date(year, mon - 1, 1).getDay();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const stats = [
    {
      label: "ບິນວາງແຜນສົ່ງ (ເດືອນນີ້)",
      value: data?.summary.planned_bills ?? 0,
      icon: <FaBoxOpen />,
      tone: "amber" as const,
    },
    {
      label: "ບິນສົ່ງສຳເລັດ (ເດືອນນີ້)",
      value: data?.summary.delivered_bills ?? 0,
      icon: <FaCheckCircle />,
      tone: "emerald" as const,
    },
    {
      label: "ວັນທີ່ມີຈັດສົ່ງ",
      value: data?.summary.active_days ?? 0,
      icon: <FaCalendarAlt />,
      tone: "teal" as const,
    },
    {
      label: "ວັນທີ່ບໍ່ມີຈັດສົ່ງ",
      value: Math.max(daysInMonth - (data?.summary.active_days ?? 0), 0),
      icon: <FaClock />,
      tone: "slate" as const,
    },
  ];

  return (
    <div className="space-y-4">
      <StatusPageHeader
        title="ປະຕິທິນຈັດສົ່ງ"
        subtitle="Delivery Calendar · ວາງແຜນ vs ສຳເລັດ ແຕ່ລະວັນ (ທຸກສາຂາ)"
        icon={<FaCalendarAlt />}
        tone="teal"
        aside={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth((m) => addMonth(m, -1))}
              disabled={month <= FIXED_MONTH_MIN}
              className="glass flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:text-teal-600 disabled:opacity-40 dark:text-slate-300"
              aria-label="ເດືອນກ່ອນ"
            >
              <FaChevronLeft size={13} />
            </button>
            <input
              type="month"
              value={month}
              min={FIXED_MONTH_MIN}
              max={FIXED_MONTH_MAX}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="glass rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200"
            />
            <button
              onClick={() => setMonth((m) => addMonth(m, 1))}
              disabled={month >= FIXED_MONTH_MAX}
              className="glass flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:text-teal-600 disabled:opacity-40 dark:text-slate-300"
              aria-label="ເດືອນຕໍ່ໄປ"
            >
              <FaChevronRight size={13} />
            </button>
          </div>
        }
      />

      <StatusStatGrid stats={stats} columns={4} />

      {/* Legend */}
      <StatusControlPanel>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {LAO_MONTHS[mon - 1]} {year}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            ວາງແຜນສົ່ງ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            ສົ່ງສຳເລັດ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-teal-400/40 bg-teal-500/10" />
            ວັນທີ່ມີຈັດສົ່ງ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-dashed border-slate-300/60 bg-slate-500/5" />
            ວັນທີ່ບໍ່ມີຈັດສົ່ງ
          </span>
        </div>
      </StatusControlPanel>

      {/* Calendar grid */}
      <div className="glass rounded-lg p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
            </div>
          ))}

          {loading
            ? Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="h-24 animate-pulse rounded-lg bg-slate-500/5 sm:h-28"
                />
              ))
            : cells.map((dayNum, idx) => {
                if (dayNum === null)
                  return <div key={`blank-${idx}`} className="h-24 sm:h-28" />;
                const date = `${month}-${pad(dayNum)}`;
                const day = dayMap.get(date);
                const planned = day?.planned_bills ?? 0;
                const delivered = day?.delivered_bills ?? 0;
                const active = planned > 0 || delivered > 0;
                const isToday = date === today;
                const isSelected = date === selectedDate;
                const rounds = day ? dayRoundNames(day) : [];

                return (
                  <button
                    key={date}
                    onClick={() => openDay(date)}
                    className={`group relative flex h-24 flex-col rounded-lg border p-1.5 text-left transition sm:h-28 sm:p-2 ${
                      active
                        ? "border-teal-400/30 bg-teal-500/[0.07] hover:border-teal-400/60 hover:bg-teal-500/[0.12]"
                        : "border-dashed border-slate-300/50 bg-slate-500/[0.03] opacity-70 hover:opacity-100 dark:border-white/5"
                    } ${
                      isSelected ? "ring-2 ring-teal-400/70" : ""
                    } ${isToday ? "outline outline-1 outline-amber-400/60" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          isToday
                            ? "text-amber-600 dark:text-amber-400"
                            : active
                            ? "text-slate-700 dark:text-slate-200"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {dayNum}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-amber-400/20 px-1.5 text-[9px] font-semibold text-amber-600 dark:text-amber-300">
                          ມື້ນີ້
                        </span>
                      )}
                    </div>

                    {active ? (
                      <>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {planned > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              <FaBoxOpen size={9} /> {planned}
                            </span>
                          )}
                          {delivered > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <FaCheckCircle size={9} /> {delivered}
                            </span>
                          )}
                        </div>
                        <div className="mt-auto flex flex-wrap gap-0.5 overflow-hidden">
                          {rounds.slice(0, 2).map((name) => (
                            <span
                              key={name}
                              className="max-w-full truncate rounded bg-teal-500/10 px-1 py-px text-[9px] text-teal-600 dark:text-teal-300"
                            >
                              {name}
                            </span>
                          ))}
                          {rounds.length > 2 && (
                            <span className="rounded bg-slate-500/10 px-1 py-px text-[9px] text-slate-500">
                              +{rounds.length - 2}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-auto text-[10px] text-slate-300 dark:text-slate-600">
                        ບໍ່ມີສົ່ງ
                      </div>
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      {/* Day detail */}
      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          detail={detail}
          loading={detailLoading}
        />
      )}
    </div>
  );
}

function DayDetailPanel({
  date,
  detail,
  loading,
}: {
  date: string;
  detail: DayDetail | null;
  loading: boolean;
}) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const heading = `ວັນ${weekday} ທີ ${d} ${LAO_MONTHS[m - 1]} ${y}`;

  const plannedGroups = detail ? groupByRound(detail.planned) : [];
  const deliveredGroups = detail ? groupByRound(detail.delivered) : [];

  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200/30 px-4 py-3 dark:border-white/5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <FaCalendarAlt className="text-teal-500" size={14} />
          {heading}
        </div>
        {detail && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-amber-600 dark:text-amber-400">
              ວາງແຜນ {detail.planned.length}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              ສຳເລັດ {detail.delivered.length}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-slate-400">ກຳລັງໂຫຼດ...</div>
      ) : !detail || (detail.planned.length === 0 && detail.delivered.length === 0) ? (
        <div className="p-6 text-center text-sm text-slate-400">
          ວັນນີ້ບໍ່ມີລາຍການວາງແຜນ ຫຼື ສົ່ງສຳເລັດ
        </div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {/* Planned */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <FaBoxOpen size={12} /> ວາງແຜນສົ່ງ ({detail.planned.length} ບິນ)
            </h3>
            {plannedGroups.length === 0 ? (
              <p className="text-xs text-slate-400">ບໍ່ມີ</p>
            ) : (
              <div className="space-y-3">
                {plannedGroups.map(([roundName, bills]) => (
                  <div
                    key={roundName}
                    className="rounded-lg border border-amber-400/20 bg-amber-500/[0.04] p-2.5"
                  >
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      <FaClock size={10} /> {roundName}
                      <span className="text-slate-400">· {bills.length} ບິນ</span>
                    </p>
                    <ul className="space-y-1">
                      {bills.map((b) => (
                        <li
                          key={b.bill_no}
                          className="flex items-start justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {b.customer}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {b.bill_no}
                              {b.action_label ? ` · ${b.action_label}` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] text-teal-600 dark:text-teal-300">
                            <FaRoute size={9} /> {b.route_name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Delivered */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              <FaCheckCircle size={12} /> ສົ່ງສຳເລັດ ({detail.delivered.length} ບິນ)
            </h3>
            {deliveredGroups.length === 0 ? (
              <p className="text-xs text-slate-400">ບໍ່ມີ</p>
            ) : (
              <div className="space-y-3">
                {deliveredGroups.map(([roundName, bills]) => (
                  <div
                    key={roundName}
                    className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.04] p-2.5"
                  >
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <FaClock size={10} /> {roundName}
                      <span className="text-slate-400">· {bills.length} ບິນ</span>
                    </p>
                    <ul className="space-y-1">
                      {bills.map((b) => (
                        <li
                          key={`${b.doc_no}-${b.bill_no}`}
                          className="flex items-start justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {b.customer}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {b.bill_no}
                              {b.sent_time ? ` · ${b.sent_time}` : ""}
                              {b.driver ? ` · ${b.driver}` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px]">
                            <span className="flex items-center gap-1 text-teal-600 dark:text-teal-300">
                              <FaRoute size={9} /> {b.route_name}
                            </span>
                            {b.car && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <FaTruck size={9} /> {b.car}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

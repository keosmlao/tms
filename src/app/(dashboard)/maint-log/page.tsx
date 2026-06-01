"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendar,
  FaCarCrash,
  FaChevronDown,
  FaChevronRight,
  FaClipboardCheck,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaPaperclip,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTools,
  FaTrash,
  FaTruck,
} from "react-icons/fa";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
  type StatusStat,
} from "@/components/status-page-shell";
import { getFixedTodayDate } from "@/lib/fixed-year";
import { searchInspectionOptions } from "@/services/vehicle-maintenance-api";
import type { VehicleOption } from "@/types";

interface MaintRule {
  code: string;
  name: string;
  interval_km: number;
}

interface PendingInspection {
  inspect_code: string;
  vehicle_code: string;
  vehicle_name: string;
  inspect_date: string;
  overall_status: "normal" | "warning" | "critical";
  detail_count: number;
  employee_name: string;
  note: string | null;
}

interface LineItemDetail {
  id: number;
  item_code: string | null;
  item_name: string | null;
  qty: number;
  unit_price: number;
  subtotal: number;
}

interface MaintLog {
  id: number;
  car_code: string;
  maint_date: string;
  odometer: number | string;
  inspect_code: string | null;
  item_code: string | null;
  maint_note: string | null;
  cost_amount: number | string;
  currency: string;
  invoice_no: string | null;
  repair_shop: string | null;
  payment_status: string;
  created_by: string | null;
  receipt_files: Array<{ name: string; data: string; type: string }> | null;
  line_items: LineItemDetail[];
  created_at: string;
}

interface TotalByCurrency {
  [currency: string]: { total_cost: number; entry_count: number };
}

interface MaintLogResponse {
  rows: MaintLog[];
  totalByCurrency: TotalByCurrency;
}

interface ScheduleRow {
  car_code: string;
  rule_code: string;
  odometer: number;
  next_due_km: number;
  inspect_odometer?: number | null;
}

interface MaintPlanAlert {
  plan_code: string;
  car_code: string;
  rule_code: string | null;
  next_due_km: number;
  maint_note: string | null;
  current_odometer: number;
  remaining_km: number;
}

interface MaintPlan {
  plan_code: string;
  car_code: string;
  rule_code: string | null;
  next_due_km: number;
  maint_note: string | null;
  created_at: string;
  created_by: string | null;
}

interface LineItem {
  _key: string;
  item_code: string;
  item_name: string;
  unit_price: string;
}

interface AttachedFile {
  name: string;
  data: string;
  type: string;
  preview?: string;
}

const CURRENCIES = [
  { value: "LAK", label: "ກີບ (LAK)" },
  { value: "THB", label: "ບາດ (THB)" },
  { value: "USD", label: "ໂດລາ (USD)" },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  LAK: "₭",
  THB: "฿",
  USD: "$",
};

const formatNumber = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const parseCostInput = (raw: string): string => {
  return raw.replace(/,/g, "");
};

const formatCostDisplay = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
};

function newLineItem(): LineItem {
  return {
    _key: Math.random().toString(36).slice(2),
    item_code: "",
    item_name: "",
    unit_price: "",
  };
}

function ItemCodeSelectInline({
  item,
  onChange,
}: {
  item: LineItem;
  onChange: (updates: Partial<LineItem>) => void;
}) {
  const [items, setItems] = useState<Array<{ item_code: string; item_name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputVal, setInputVal] = useState(item.item_name || item.item_code);
  const requestId = useRef(0);

  useEffect(() => {
    setInputVal(item.item_name || item.item_code);
  }, [item.item_name, item.item_code]);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    const t = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/maint-log/items?q=${encodeURIComponent(inputVal)}`)
        .then((r) => r.json())
        .then((d: Array<{ item_code: string; item_name: string }>) => {
          if (requestId.current === id) setItems(Array.isArray(d) ? d : []);
        })
        .catch(() => { if (requestId.current === id) setItems([]); })
        .finally(() => { if (requestId.current === id) setLoading(false); });
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, inputVal]);

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={inputVal}
        onChange={(e) => { setInputVal(e.target.value); onChange({ item_name: e.target.value, item_code: "" }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="ລາຍການ..."
        autoComplete="off"
        className="h-8 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
      />
      {open && (
        <div className="absolute left-0 right-0 z-40 mt-0.5 max-h-44 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-500">
              <FaSpinner className="animate-spin text-[10px]" /> ກຳລັງຄົ້ນຫາ...
            </div>
          ) : items.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">ບໍ່ພົບຂໍ້ມູນ</div>
          ) : (
            items.map((it) => (
              <button
                key={it.item_code}
                type="button"
                onMouseDown={() => {
                  onChange({ item_code: it.item_code, item_name: it.item_name });
                  setInputVal(it.item_name || it.item_code);
                  setOpen(false);
                }}
                className="flex w-full flex-col px-2 py-1.5 text-left hover:bg-amber-50 dark:hover:bg-slate-800"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{it.item_name}</span>
                <span className="text-[10px] text-slate-400">{it.item_code}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AsyncVehicleSelect({
  value,
  onChange,
}: {
  value: VehicleOption | null;
  onChange: (v: VehicleOption | null) => void;
}) {
  const [query, setQuery] = useState(value ? `${value.code}${value.name ? ` - ${value.name}` : ""}` : "");
  const [items, setItems] = useState<VehicleOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (value) setQuery(`${value.code}${value.name ? ` - ${value.name}` : ""}`);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    const t = window.setTimeout(() => {
      setLoading(true);
      searchInspectionOptions("vehicle", query)
        .then((data) => { if (requestId.current === id) setItems(data as VehicleOption[]); })
        .catch(() => { if (requestId.current === id) setItems([]); })
        .finally(() => { if (requestId.current === id) setLoading(false); });
    }, 250);
    return () => window.clearTimeout(t);
  }, [open, query]);

  return (
    <div className="relative">
      <div className="relative">
        <FaTruck className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="ພິມລະຫັດ ຫຼື ຊື່ລົດ"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
              <FaSpinner className="animate-spin text-xs" /> ກຳລັງຄົ້ນຫາ...
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">ບໍ່ພົບຂໍ້ມູນ</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={() => { onChange(item); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FaTruck className="shrink-0 text-xs text-slate-400" />
                <span className="font-medium">{item.code}</span>
                {item.name && <span className="text-slate-500">- {item.name}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const PAYMENT_STATUSES = [
  { value: "pending", label: "ຍັງບໍ່ຊຳລະ", color: "amber" },
  { value: "paid",    label: "ຊຳລະແລ້ວ",   color: "emerald" },
] as const;

const emptyForm = () => ({
  maint_date: getFixedTodayDate(),
  odometer: "",
  inspect_code: "",
  maint_note: "",
  currency: "LAK",
  invoice_no: "",
  repair_shop: "",
  payment_status: "pending",
});

export default function MaintLogPage() {
  const [data, setData] = useState<MaintLogResponse>({ rows: [], totalByCurrency: {} });
  const [fromDate, setFromDate] = useState(getFixedTodayDate());
  const [toDate, setToDate] = useState(getFixedTodayDate());
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [scheduleMap, setScheduleMap] = useState<Map<string, Map<string, ScheduleRow>>>(new Map());
  const [form, setForm] = useState(emptyForm());
  const [selectedCar, setSelectedCar] = useState<VehicleOption | null>(null);
  const [pendingInspections, setPendingInspections] = useState<PendingInspection[]>([]);
  const [inspectionDetails, setInspectionDetails] = useState<Array<{ item_code: string; item_name: string; status_name: string; status_code: number }>>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastServiceKm, setLastServiceKm] = useState<number | null>(null);
  const [rules, setRules] = useState<MaintRule[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ code: "", name: "", interval_km: "" });
  const [savingRule, setSavingRule] = useState(false);
  const [deletingRuleCode, setDeletingRuleCode] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [maintPlanAlerts, setMaintPlanAlerts] = useState<MaintPlanAlert[]>([]);
  const [maintPlans, setMaintPlans] = useState<MaintPlan[]>([]);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ plan_code: "", car_code: "", next_due_km: "", maint_note: "", rule_codes: [] as string[] });
  const [planCarOption, setPlanCarOption] = useState<VehicleOption | null>(null);
  const [planCurrentOdo, setPlanCurrentOdo] = useState<number | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanCode, setDeletingPlanCode] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const scheduleCarCodes = useMemo(() => Array.from(scheduleMap.keys()).sort(), [scheduleMap]);

  const latestOdoByCar = useMemo(() => {
    const m = new Map<string, number>();
    for (const [carCode, ruleMap] of scheduleMap.entries()) {
      let maxOdo = 0;
      for (const entry of ruleMap.values()) {
        // Prefer real-time odometer from latest inspection record
        const odo = Number(entry.inspect_odometer ?? entry.odometer);
        if (odo > maxOdo) maxOdo = odo;
      }
      if (maxOdo > 0) m.set(carCode, maxOdo);
    }
    return m;
  }, [scheduleMap]);

  const totalCost = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      return sum + (parseFloat(parseCostInput(item.unit_price || "0")) || 0);
    }, 0);
  }, [lineItems]);

  const distanceSinceLast = useMemo(() => {
    if (lastServiceKm == null || !form.odometer) return null;
    const odo = Number(form.odometer);
    if (!Number.isFinite(odo) || odo <= lastServiceKm) return null;
    return odo - lastServiceKm;
  }, [form.odometer, lastServiceKm]);


  const reloadPlanAlerts = () => {
    void fetch("/api/maint-plan?mode=alerts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MaintPlanAlert[]) => setMaintPlanAlerts(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  const reloadPlans = () => {
    void fetch("/api/maint-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MaintPlan[]) => setMaintPlans(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  const handleSavePlan = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setPlanError(null);
    if (!planCarOption) { setPlanError("ກະລຸນາເລືອກລົດ"); return; }
    const hasRules = planForm.rule_codes.length > 0;
    if (!hasRules && !planForm.next_due_km) {
      setPlanError("ກະລຸນາລະບຸ ຮອດ (km) ຫຼື ເລືອກ Rule");
      return;
    }
    if (hasRules && planCurrentOdo == null) {
      setPlanError("ບໍ່ພົບ odometer ລ້າສຸດຂອງລົດ ກະລຸນາກວດເຊັກ odg_tms_inspect");
      return;
    }
    const base = planForm.plan_code.trim() ||
      `${planCarOption.code}-${Date.now()}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
    const entries = hasRules
      ? planForm.rule_codes.map((rc) => {
          const rule = rules.find((r) => r.code === rc);
          return { rule_code: rc, next_due_km: planCurrentOdo! + Number(rule?.interval_km ?? 0) };
        })
      : [{ rule_code: null, next_due_km: Number(planForm.next_due_km) }];
    setSavingPlan(true);
    try {
      await Promise.all(
        entries.map(({ rule_code: rc, next_due_km: km }, i) => {
          const planCode = entries.length === 1 ? base : `${base}-${i + 1}`;
          return fetch("/api/maint-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plan_code: planCode,
              car_code: planCarOption!.code,
              next_due_km: km,
              maint_note: planForm.maint_note || null,
              rule_code: rc,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "ບໍ່ສາມາດບັນທຶກໄດ້" }));
              throw new Error((err as { error?: string }).error ?? "ເກີດຂໍ້ຜິດພາດ");
            }
          });
        })
      );
      setPlanForm({ plan_code: "", car_code: "", next_due_km: "", maint_note: "", rule_codes: [] as string[] });
      setPlanCarOption(null);
      reloadPlans();
      reloadPlanAlerts();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "ເກີດຂໍ້ຜິດພາດ");
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = async (planCode: string) => {
    if (!confirm(`ລຶບແຜນ "${planCode}"?`)) return;
    setDeletingPlanCode(planCode);
    try {
      await fetch(`/api/maint-plan?plan_code=${encodeURIComponent(planCode)}`, { method: "DELETE" });
      reloadPlans();
      reloadPlanAlerts();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingPlanCode(null);
    }
  };

  const reloadRules = () => {
    void fetch("/api/maint-log/rules")
      .then((r) => r.json())
      .then((d: MaintRule[]) => setRules(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  const handleSaveRule = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setRuleError(null);
    const km = parseInt(ruleForm.interval_km, 10);
    if (!ruleForm.code.trim() || !ruleForm.name.trim() || !km || km <= 0) {
      setRuleError("ກະລຸນາກວດສອບຂໍ້ມູນ");
      return;
    }
    setSavingRule(true);
    try {
      const res = await fetch("/api/maint-log/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: ruleForm.code.trim(), name: ruleForm.name.trim(), interval_km: km }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "ບໍ່ສາມາດບັນທຶກໄດ້" }));
        throw new Error((err as { error?: string }).error ?? "ເກີດຂໍ້ຜິດພາດ");
      }
      setRuleForm({ code: "", name: "", interval_km: "" });
      reloadRules();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "ເກີດຂໍ້ຜິດພາດ");
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (code: string) => {
    if (!confirm(`ລຶບ rule "${code}"?`)) return;
    setDeletingRuleCode(code);
    try {
      await fetch(`/api/maint-log/rules?code=${encodeURIComponent(code)}`, { method: "DELETE" });
      reloadRules();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingRuleCode(null);
    }
  };

  const load = () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ fromDate, toDate });
    void Promise.all([
      fetch(`/api/maint-log?${params}`, { cache: "no-store" }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${r.status}`);
        return json;
      }),
      fetch(`/api/maint-log?mode=inspect_codes`, { cache: "no-store" }).then((r) => r.json()),
      (() => {
        const d = new Date();
        const to = d.toISOString().slice(0, 10);
        d.setDate(d.getDate() - 30);
        const from = d.toISOString().slice(0, 10);
        return fetch(`/api/inspections?dateFrom=${from}&dateTo=${to}`, { cache: "no-store" }).then((r) => r.json());
      })(),
      fetch(`/api/maint-log?mode=schedule`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([maintData, handledCodesData, inspData, scheduleData]) => {
        const res = maintData as MaintLogResponse;
        const maintRows = res?.rows ?? [];
        setData({ rows: maintRows, totalByCurrency: res?.totalByCurrency ?? {} });
        const handledCodes = new Set(Array.isArray(handledCodesData) ? (handledCodesData as string[]) : []);
        const rows = (Array.isArray(inspData) ? inspData : []) as PendingInspection[];
        const seen = new Set<string>();
        const pending: PendingInspection[] = [];
        for (const r of rows) {
          if (r.overall_status === "normal") continue;
          if (seen.has(r.vehicle_code)) continue;
          if (handledCodes.has(r.inspect_code)) continue;
          seen.add(r.vehicle_code);
          pending.push(r);
        }
        setPendingInspections(pending);
        const m = new Map<string, Map<string, ScheduleRow>>();
        if (Array.isArray(scheduleData)) {
          for (const sr of scheduleData as ScheduleRow[]) {
            if (!m.has(sr.car_code)) m.set(sr.car_code, new Map());
            m.get(sr.car_code)!.set(sr.rule_code, sr);
          }
        }
        setScheduleMap(m);
      })
      .catch((err: unknown) => {
        console.error("[maint-log load]", err);
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    void fetch("/api/maint-log/rules")
      .then((r) => r.json())
      .then((d: MaintRule[]) => setRules(Array.isArray(d) ? d : []))
      .catch(console.error);
    reloadPlanAlerts();
    reloadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCar) return;
    const encoded = encodeURIComponent(selectedCar.code);
    void fetch(`/api/maint-log/defaults?car_code=${encoded}`)
      .then((r) => r.json())
      .then((d: {
        last_odometer?: number | null;
        last_item_code?: string | null;
        last_currency?: string;
        common_items?: string[];
      }) => {
        const lastSvcKm = d.last_odometer != null ? Number(d.last_odometer) : null;
        setLastServiceKm(lastSvcKm);
        setForm((f) => ({
          ...f,
          odometer: lastSvcKm != null ? String(lastSvcKm) : f.odometer,
          currency: d.last_currency ?? f.currency,
        }));
      })
      .catch(console.error);
  }, [selectedCar]);

  useEffect(() => {
    if (!planCarOption) { setPlanCurrentOdo(null); return; }
    void fetch(`/api/maint-log/defaults?car_code=${encodeURIComponent(planCarOption.code)}`)
      .then((r) => r.json())
      .then((d: { last_odometer?: number | null }) => {
        setPlanCurrentOdo(d.last_odometer != null ? Number(d.last_odometer) : null);
      })
      .catch(() => setPlanCurrentOdo(null));
  }, [planCarOption]);

  const filtered = useMemo(() => {
    const k = searchText.trim().toLowerCase();
    if (!k) return data.rows;
    return data.rows.filter((r) =>
      [r.car_code, r.item_code, r.invoice_no, r.maint_note, r.repair_shop]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(k)
    );
  }, [data.rows, searchText]);

  const totalEntries = useMemo(
    () => Object.values(data.totalByCurrency ?? {}).reduce((s, v) => s + v.entry_count, 0),
    [data.totalByCurrency]
  );

  const stats = useMemo(() => {
    const base: StatusStat[] = [
      {
        label: "ລາຍການທັງໝົດ",
        value: totalEntries,
        icon: <FaTools />,
        tone: "amber",
      },
    ];
    for (const [cur, info] of Object.entries(data.totalByCurrency ?? {})) {
      base.push({
        label: `ຍອດລວມ (${cur})`,
        value: `${CURRENCY_SYMBOLS[cur] ?? ""} ${formatNumber(info.total_cost)}`,
        icon: <FaMoneyBillWave />,
        tone: (cur === "LAK" ? "emerald" : cur === "THB" ? "slate" : "orange") as StatusStat["tone"],
      });
    }
    return base;
  }, [data.totalByCurrency, totalEntries]);

  const updateLineItem = (key: string, updates: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((it) => it._key === key ? { ...it, ...updates } : it));
  };

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.length <= 1 ? prev : prev.filter((it) => it._key !== key));
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = (ev.target?.result as string ?? "").split(",")[1] ?? "";
        const preview = file.type.startsWith("image/") ? (ev.target?.result as string) : undefined;
        setAttachedFiles((prev) => [...prev, { name: file.name, data, type: file.type, preview }]);
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = "";
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      if (!selectedCar) {
        setSaveError("ກະລຸນາເລືອກລົດ");
        setSaving(false);
        return;
      }
      const builtLineItems = lineItems
        .filter((it) => it.item_name || it.item_code || it.unit_price)
        .map((it) => ({
          item_code: it.item_code || null,
          item_name: it.item_name || null,
          qty: 1,
          unit_price: parseFloat(parseCostInput(it.unit_price || "0")) || 0,
        }));
      const body = {
        car_code: selectedCar.code,
        maint_date: form.maint_date || undefined,
        odometer: form.odometer ? Number(form.odometer) : 0,
        inspect_code: form.inspect_code || null,
        maint_note: form.maint_note || null,
        currency: form.currency,
        invoice_no: form.invoice_no || null,
        repair_shop: form.repair_shop || null,
        payment_status: form.payment_status,
        line_items: builtLineItems,
        receipt_files: attachedFiles.map(({ name, data, type }) => ({ name, data, type })),
      };
      const res = await fetch("/api/maint-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "ບໍ່ສາມາດບັນທຶກໄດ້" }));
        throw new Error((err as { error?: string }).error ?? "ເກີດຂໍ້ຜິດພາດ");
      }
      const savedInspectCode = form.inspect_code;
      setAddOpen(false);
      setForm(emptyForm());
      setSelectedCar(null);
      setLineItems([newLineItem()]);
      setAttachedFiles([]);
      setLastServiceKm(null);
      if (savedInspectCode) {
        setPendingInspections((prev) => prev.filter((p) => p.inspect_code !== savedInspectCode));
      }
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "ເກີດຂໍ້ຜິດພາດ");
    } finally {
      setSaving(false);
    }
  };

  const openFormFromInspection = (insp: PendingInspection) => {
    setForm({ ...emptyForm(), inspect_code: insp.inspect_code });
    setSelectedCar({ id: insp.vehicle_code, code: insp.vehicle_code, name: insp.vehicle_name });
    setInspectionDetails([]);
    setLineItems([newLineItem()]);
    setAttachedFiles([]);
    setSaveError(null);
    setAddOpen(true);

    void fetch(`/api/inspections/${encodeURIComponent(insp.inspect_code)}/details`)
      .then((r) => r.json())
      .then((details: Array<{ item_code: string; item_name: string; status_name: string; status_code: number }>) => {
        if (!Array.isArray(details) || details.length === 0) return;
        setInspectionDetails(details);
        setLineItems(details.map((d) => ({
          _key: Math.random().toString(36).slice(2),
          item_code: d.item_code,
          item_name: d.item_name,
          unit_price: "",
        })));
      })
      .catch(console.error);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("ຢືນຢັນການລຶບລາຍການນີ້?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/maint-log?id=${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <StatusPageHeader
        title="ປະຫວັດການສ້ອມແປງລົດ"
        subtitle="ບັນທຶກ ແລະ ຕິດຕາມຄ່າໃຊ້ຈ່າຍການບຳລຸງຮັກສາລົດ"
        icon={<FaCarCrash />}
        tone="amber"
      />

      <StatusStatGrid stats={stats} />

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">
          <FaTimes className="shrink-0 text-xs" />
          <span className="font-semibold">ໂຫລດຂໍ້ມູນຜິດພາດ:</span> {loadError}
        </div>
      )}

      <StatusControlPanel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">ຈາກວັນທີ</label>
            <div className="relative">
              <FaCalendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">ຫາວັນທີ</label>
            <div className="relative">
              <FaCalendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="relative">
            <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="ຄົ້ນຫາ..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <button
            onClick={load}
            className="h-9 rounded-md bg-slate-700 px-4 text-sm text-white hover:bg-slate-600"
          >
            ຄົ້ນຫາ
          </button>
          <button
            onClick={() => setRulesModalOpen(true)}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:border-amber-300 hover:bg-amber-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <FaTools className="text-xs" />
            ກຳໜົດບຳລຸງຮັກສາ
          </button>
          <button
            onClick={() => { setPlanModalOpen(true); setPlanError(null); }}
            className="flex h-9 items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-600 hover:border-orange-300 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300"
          >
            <FaClipboardCheck className="text-xs" />
            ຈັດການແຜນສ້ອມ
            {maintPlanAlerts.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {maintPlanAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setForm(emptyForm());
              setSaveError(null);
              setLineItems([newLineItem()]);
              setAttachedFiles([]);
              setInspectionDetails([]);
              setSelectedCar(null);
              setAddOpen(true);
            }}
            className="ml-auto flex h-9 items-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-400"
          >
            <FaPlus className="text-xs" /> ເພີ່ມລາຍການ
          </button>
        </div>
      </StatusControlPanel>

      {pendingInspections.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm dark:border-red-900/40 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-3 dark:border-red-900/30 dark:bg-red-950/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <FaClipboardCheck className="text-sm text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-700 dark:text-red-300">
                ການກວດທີ່ຕ້ອງສ້ອມ — {pendingInspections.length} ລາຍການ
              </p>
              <p className="text-xs text-red-500/80 dark:text-red-400/70">
                ກວດສະພາບລົດພົບຂໍ້ບົກພ່ອງ ກົດ "ສ້າງໃບສ້ອມ" ທັນທີ
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingInspections.map((insp) => {
              const isCritical = insp.overall_status === "critical";
              return (
                <div key={insp.inspect_code} className="flex items-center gap-4 px-5 py-4">
                  <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${isCritical ? "bg-red-500" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {insp.vehicle_code}
                      </span>
                      {insp.vehicle_name && (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {insp.vehicle_name}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isCritical
                          ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300"
                          : "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300"
                      }`}>
                        {isCritical ? "ຮີບດ່ວນ" : "ມີຂໍ້ບົກພ່ອງ"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      <span className="font-mono text-[10px]">{insp.inspect_code}</span>
                      {" · "}ກວດ {insp.inspect_date}
                      {" · "}ໂດຍ {insp.employee_name}
                      {" · "}{insp.detail_count} ລາຍການ
                      {insp.note && <span className="italic"> · "{insp.note}"</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openFormFromInspection(insp)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all active:scale-95 ${
                      isCritical
                        ? "bg-red-500 hover:bg-red-400 shadow-red-200 dark:shadow-red-900/30"
                        : "bg-amber-500 hover:bg-amber-400 shadow-amber-200 dark:shadow-amber-900/30"
                    }`}
                  >
                    <FaTools className="text-[10px]" />
                    ສ້າງໃບສ້ອມ
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rulesModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-700 to-slate-600 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <FaTools className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">ກຳໜົດແຜນບຳລຸງຮັກສາ</p>
                  <p className="text-xs text-white/70">ຕັ້ງຄ່າໄລຍະທາງ (km) ສຳລັບແຕ່ລະ rule</p>
                </div>
              </div>
              <button
                onClick={() => { setRulesModalOpen(false); setRuleError(null); setRuleForm({ code: "", name: "", interval_km: "" }); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 hover:bg-white/30"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
              {rules.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">ຍັງບໍ່ມີ rule ໃດ</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                        <th className="px-3 py-2">ລະຫັດ</th>
                        <th className="px-3 py-2">ຊື່</th>
                        <th className="px-3 py-2 text-right">ໄລຍະ (km)</th>
                        <th className="w-8 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.code} className="border-b border-slate-50 dark:border-slate-800">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                          <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{r.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                            {formatNumber(r.interval_km)} km
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(r.code)}
                              disabled={deletingRuleCode === r.code}
                              className="rounded p-1 text-slate-300 hover:text-red-500 disabled:opacity-40"
                            >
                              {deletingRuleCode === r.code ? (
                                <FaSpinner className="animate-spin text-xs" />
                              ) : (
                                <FaTrash className="text-xs" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <form onSubmit={handleSaveRule} className="overflow-hidden rounded-xl border border-amber-200 dark:border-amber-900/40">
                <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 dark:border-amber-900/30 dark:bg-amber-950/20">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">ເພີ່ມ / ແກ້ໄຂ Rule</p>
                </div>
                <div className="flex flex-col gap-3 bg-white p-4 dark:bg-slate-900">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">ລະຫັດ</label>
                      <input
                        value={ruleForm.code}
                        onChange={(e) => setRuleForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="OIL"
                        className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">ຊື່</label>
                      <input
                        value={ruleForm.name}
                        onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="ຖ່າຍນ້ຳມັນ"
                        className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">ໄລຍະ (km)</label>
                      <input
                        type="number"
                        min={1}
                        value={ruleForm.interval_km}
                        onChange={(e) => setRuleForm((f) => ({ ...f, interval_km: e.target.value }))}
                        placeholder="10000"
                        className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm tabular-nums focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                  {ruleError && (
                    <p className="text-xs text-red-500">{ruleError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={savingRule}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-bold text-white hover:bg-amber-400 disabled:opacity-60"
                  >
                    {savingRule ? <FaSpinner className="animate-spin text-xs" /> : <FaPlus className="text-xs" />}
                    ບັນທຶກ Rule
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {planModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <FaClipboardCheck className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">ຈັດການແຜນສ້ອມແປງ</p>
                  <p className="text-xs text-white/70">ກຳໜົດ next_due_km ຕໍ່ລົດ</p>
                </div>
              </div>
              <button
                onClick={() => { setPlanModalOpen(false); setPlanError(null); setPlanForm({ plan_code: "", car_code: "", next_due_km: "", maint_note: "", rule_codes: [] as string[] }); setPlanCarOption(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 hover:bg-white/30"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <form onSubmit={handleSavePlan} className="overflow-hidden rounded-xl border border-orange-200 dark:border-orange-900/40">
                <div className="border-b border-orange-100 bg-orange-50 px-4 py-2 dark:border-orange-900/30 dark:bg-orange-950/20">
                  <p className="text-xs font-bold text-orange-700 dark:text-orange-400">ເພີ່ມ / ແກ້ໄຂແຜນ</p>
                </div>
                <div className="flex flex-col gap-3 bg-white p-4 dark:bg-slate-900">
                  <div className={`grid gap-3 ${planForm.rule_codes.length > 0 ? "grid-cols-1" : "grid-cols-2"}`}>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">ລົດ <span className="text-red-500">*</span></label>
                      <AsyncVehicleSelect value={planCarOption} onChange={setPlanCarOption} />
                    </div>
                    {planForm.rule_codes.length === 0 && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500">ຮອດ (km) <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          min={0}
                          value={planForm.next_due_km}
                          onChange={(e) => setPlanForm((f) => ({ ...f, next_due_km: e.target.value }))}
                          placeholder="100000"
                          className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm tabular-nums focus:border-orange-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    )}
                  </div>
                  {rules.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-500">
                        ປະເພດການບຳລຸງ (Rule)
                        {planCurrentOdo != null && (
                          <span className="ml-1.5 font-normal text-slate-400">
                            — Odometer ປະຈຸບັນ: <span className="tabular-nums font-semibold text-slate-600 dark:text-slate-300">{formatNumber(planCurrentOdo)} km</span>
                          </span>
                        )}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {rules.map((rule) => {
                          const active = planForm.rule_codes.includes(rule.code);
                          const autoDue = planCurrentOdo != null ? planCurrentOdo + Number(rule.interval_km) : null;
                          return (
                            <button
                              key={rule.code}
                              type="button"
                              onClick={() => {
                                setPlanForm((f) => ({
                                  ...f,
                                  rule_codes: active
                                    ? f.rule_codes.filter((c) => c !== rule.code)
                                    : [...f.rule_codes, rule.code],
                                }));
                              }}
                              className={`flex flex-col items-start rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                                active
                                  ? "border-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-300 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              <span>{rule.name}</span>
                              <span className={`mt-0.5 tabular-nums text-[10px] font-bold ${active ? "text-orange-600 dark:text-orange-400" : "text-slate-400"}`}>
                                {autoDue != null
                                  ? `→ ${formatNumber(autoDue)} km`
                                  : `+${formatNumber(rule.interval_km)} km`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">ໝາຍເຫດ (ລາຍລະອຽດເພີ່ມເຕີມ)</label>
                    <input
                      type="text"
                      value={planForm.maint_note}
                      onChange={(e) => setPlanForm((f) => ({ ...f, maint_note: e.target.value }))}
                      placeholder="ຖ່າຍນ້ຳມັນ, ປ່ຽນໄສ້ຕງ, ..."
                      className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm focus:border-orange-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  {planError && <p className="text-xs text-red-500">{planError}</p>}
                  <button
                    type="submit"
                    disabled={savingPlan}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-400 disabled:opacity-60"
                  >
                    {savingPlan ? <FaSpinner className="animate-spin text-xs" /> : <FaPlus className="text-xs" />}
                    ບັນທຶກແຜນ
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {maintPlanAlerts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-orange-200 bg-white shadow-sm dark:border-orange-900/40 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-orange-100 bg-orange-50 px-5 py-3 dark:border-orange-900/30 dark:bg-orange-950/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40">
              <FaClipboardCheck className="text-sm text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-700 dark:text-orange-300">
                ໃກ້ຮ�ດກໍານົດສ້ອມແປງ — {maintPlanAlerts.length} ລາຍການ
              </p>
              <p className="text-xs text-orange-500/80 dark:text-orange-400/70">
                ລົດຕໍ່ໄປນີ້ຄວນໄດ້ຮັບການສ້ອມ (ຕ່ຳກວ່າ 500 km ຈາກ odg_tms_inspect)
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {maintPlanAlerts.map((alert) => {
              const remaining = Number(alert.remaining_km);
              const isOverdue = remaining < 0;
              return (
                <div key={alert.plan_code} className="flex items-center gap-4 px-5 py-3">
                  <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${isOverdue ? "bg-red-500" : "bg-orange-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{alert.car_code}</span>
                      {alert.maint_note && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{alert.maint_note}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isOverdue
                          ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300"
                          : "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-300"
                      }`}>
                        {isOverdue
                          ? `ເກີນໜ້ານັດ ${formatNumber(Math.abs(remaining))} km`
                          : `ອີກ ${formatNumber(remaining)} km`}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Odometer ປະຈຸບັນ:{" "}
                      <span className="tabular-nums font-semibold">{formatNumber(alert.current_odometer)} km</span>
                      {" → "}ຮອດ{" "}
                      <span className="tabular-nums font-semibold">{formatNumber(alert.next_due_km)} km</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {maintPlans.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40">
                <FaClipboardCheck className="text-sm text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">ແຜນສ້ອມແປງ — {maintPlans.length} ລາຍການ</p>
                <p className="text-xs text-slate-400">next_due_km ຕໍ່ລົດ</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setPlanModalOpen(true); setPlanError(null); }}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-600 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300"
            >
              <FaPlus className="text-[10px]" /> ເພີ່ມ
            </button>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-700">
                  <th className="px-4 py-2">ລົດ</th>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-3 py-2 text-right">ຮອດ (km)</th>
                  <th className="px-3 py-2">ໝາຍເຫດ</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {maintPlans.map((p) => (
                  <tr key={p.plan_code} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{p.car_code}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {p.rule_code ? (rules.find((r) => r.code === p.rule_code)?.name ?? p.rule_code) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-orange-600 dark:text-orange-400">
                      {formatNumber(p.next_due_km)}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-slate-400">{p.maint_note ?? "—"}</td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeletePlan(p.plan_code)}
                        disabled={deletingPlanCode === p.plan_code}
                        className="rounded p-1 text-slate-300 hover:text-red-500 disabled:opacity-40"
                      >
                        {deletingPlanCode === p.plan_code
                          ? <FaSpinner className="animate-spin text-xs" />
                          : <FaTrash className="text-xs" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scheduleCarCodes.length > 0 && rules.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setScheduleOpen((v) => !v)}
            className="flex w-full items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <FaTools className="text-sm text-amber-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                ກຳໜົດບຳລຸງຮັກສາ — {scheduleCarCodes.length} ລົດ
              </p>
              <p className="text-xs text-slate-400">ສະຖານະລ້ໍ, ນ້ຳມັນ ແລະ ຊ່ວງລ່າງ ຕາມ km ທີ່ກຳໜົດ</p>
            </div>
            {scheduleOpen ? (
              <FaChevronDown className="text-xs text-slate-400" />
            ) : (
              <FaChevronRight className="text-xs text-slate-400" />
            )}
          </button>
          {scheduleOpen && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">ລົດ</th>
                    {rules.map((rule) => (
                      <th key={rule.code} className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <div>{rule.name}</div>
                        <div className="font-normal text-slate-400">ທຸກ {formatNumber(rule.interval_km)} km</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleCarCodes.map((carCode) => {
                    const currentOdo = latestOdoByCar.get(carCode) ?? 0;
                    return (
                      <tr key={carCode} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{carCode}</span>
                          {currentOdo > 0 && (
                            <div className="text-[10px] text-slate-400 tabular-nums">{formatNumber(currentOdo)} km</div>
                          )}
                        </td>
                        {rules.map((rule) => {
                          const entry = scheduleMap.get(carCode)?.get(rule.code);
                          const nextDue = entry ? Number(entry.next_due_km) : null;
                          const remaining = nextDue != null ? nextDue - currentOdo : null;
                          const overdue = remaining != null && remaining < 0;
                          const nearPct = remaining != null && rule.interval_km > 0 ? remaining / rule.interval_km : null;
                          const [cellBg, textCls, dotCls] =
                            remaining == null
                              ? ["", "text-slate-300 dark:text-slate-600", "bg-slate-300 dark:bg-slate-600"]
                              : overdue
                              ? ["bg-red-50 dark:bg-red-950/20", "text-red-600 dark:text-red-400", "bg-red-500"]
                              : nearPct! < 0.1
                              ? ["bg-red-50 dark:bg-red-950/20", "text-red-500 dark:text-red-400", "bg-red-400"]
                              : nearPct! < 0.25
                              ? ["bg-amber-50 dark:bg-amber-950/20", "text-amber-600 dark:text-amber-400", "bg-amber-400"]
                              : ["bg-emerald-50 dark:bg-emerald-950/20", "text-emerald-700 dark:text-emerald-400", "bg-emerald-500"];
                          return (
                            <td key={rule.code} className={`px-3 py-2.5 text-center ${cellBg}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
                                <span className={`font-bold tabular-nums ${textCls}`}>
                                  {remaining == null
                                    ? "—"
                                    : overdue
                                    ? `ເກີນ ${formatNumber(Math.abs(remaining))}`
                                    : `ອີກ ${formatNumber(remaining)}`}
                                </span>
                              </div>
                              {nextDue != null && (
                                <div className="text-[10px] text-slate-400 tabular-nums">ຮອດ {formatNumber(nextDue)} km</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 max-h-[90vh] flex flex-col">

            <div className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-400 px-5 py-4 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <FaTools className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">ບັນທຶກການສ້ອມແປງ</p>
                  {selectedCar && (
                    <p className="text-xs text-white/80">{selectedCar.code}{selectedCar.name ? ` · ${selectedCar.name}` : ""}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setAddOpen(false); setSelectedCar(null); setInspectionDetails([]); setLineItems([newLineItem()]); setAttachedFiles([]); setLastServiceKm(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-0 overflow-y-auto">
              <div className="flex flex-col gap-4 p-5">

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      ລົດ <span className="text-red-500">*</span>
                    </label>
                    <AsyncVehicleSelect value={selectedCar} onChange={setSelectedCar} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">ວັນທີສ້ອມແປງ</label>
                    <div className="relative">
                      <FaCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
                      <input
                        type="date"
                        value={form.maint_date}
                        onChange={(e) => setForm((f) => ({ ...f, maint_date: e.target.value }))}
                        className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">ອູ່ສ້ອມແປງ</label>
                    <input
                      type="text"
                      value={form.repair_shop}
                      onChange={(e) => setForm((f) => ({ ...f, repair_shop: e.target.value }))}
                      placeholder="ຊື່ອູ່ / ສ້ອມໂດຍ..."
                      className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Odometer ຕອນນີ້ (km)
                      {selectedCar && form.odometer && form.odometer !== "0" && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">AUTO</span>
                      )}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.odometer}
                      onChange={(e) => setForm((f) => ({ ...f, odometer: e.target.value }))}
                      placeholder="ໝາຍເລກ km"
                      className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm tabular-nums focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>

                {(lastServiceKm != null || distanceSinceLast != null) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    {lastServiceKm != null && (
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <FaTools className="text-[9px] text-amber-500" />
                        ສ້ອມຄັ້ງສຸດທ້າຍ:
                        <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatNumber(lastServiceKm)} km</span>
                      </span>
                    )}
                    {distanceSinceLast != null && (
                      <span className="text-slate-500 dark:text-slate-400">
                        ໄລຍະ:
                        <span className="ml-1 font-bold tabular-nums text-amber-600 dark:text-amber-400">+{formatNumber(distanceSinceLast)} km</span>
                      </span>
                    )}
                  </div>
                )}

                {inspectionDetails.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
                    <div className="flex items-center gap-2 border-b border-red-100 px-4 py-2 dark:border-red-900/30">
                      <FaClipboardCheck className="text-xs text-red-500" />
                      <span className="text-xs font-bold text-red-700 dark:text-red-400">
                        ລາຍການຜິດປົກກະຕິຈາກການກວດ ({form.inspect_code})
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 px-4 py-3">
                      {inspectionDetails.map((d, i) => {
                        const minCode = Math.min(...inspectionDetails.map((x) => x.status_code));
                        const maxCode = Math.max(...inspectionDetails.map((x) => x.status_code));
                        const hasMixed = minCode !== maxCode;
                        const isCritical = hasMixed && d.status_code === minCode;
                        return (
                          <div key={d.item_code} className="flex items-center gap-2 text-sm">
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${isCritical ? "bg-red-500" : "bg-amber-400"}`}>
                              {i + 1}
                            </span>
                            <span className="font-medium text-slate-700 dark:text-slate-200">{d.item_name}</span>
                            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isCritical
                                ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
                            }`}>
                              {d.status_name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                    <FaTools className="text-xs text-amber-500" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">ລາຍການສ້ອມ</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-400">
                          <th className="w-7 px-2 py-1.5 text-center">#</th>
                          <th className="px-2 py-1.5 text-left">ລາຍການສ້ອມ</th>
                          <th className="w-36 px-2 py-1.5 text-right">ລາຄາ</th>
                          <th className="w-8 px-1 py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, idx) => (
                            <tr key={item._key} className="border-b border-slate-50 dark:border-slate-800">
                              <td className="px-2 py-1 text-center text-slate-400">{idx + 1}</td>
                              <td className="px-2 py-1">
                                <ItemCodeSelectInline
                                  item={item}
                                  onChange={(updates) => updateLineItem(item._key, updates)}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.unit_price}
                                  onChange={(e) => updateLineItem(item._key, { unit_price: formatCostDisplay(e.target.value) })}
                                  placeholder="0"
                                  className="h-8 w-full rounded border border-slate-200 bg-slate-50 px-1.5 text-right text-xs tabular-nums focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                                />
                              </td>
                              <td className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLineItem(item._key)}
                                  className="flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:text-red-400"
                                >
                                  <FaTimes className="text-[10px]" />
                                </button>
                              </td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setLineItems((prev) => [...prev, newLineItem()])}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    >
                      <FaPlus className="text-[10px]" /> ເພີ່ມລາຍການ
                    </button>
                    <div className="flex items-center gap-3">
                      <select
                        value={form.currency}
                        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                        className="h-7 rounded border border-slate-200 bg-slate-50 px-2 text-xs focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      {totalCost > 0 && (
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                          {CURRENCY_SYMBOLS[form.currency] ?? ""} {formatNumber(totalCost)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-amber-200 dark:border-amber-900/40">
                  <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900/30 dark:bg-amber-950/30">
                    <FaFileInvoiceDollar className="text-amber-500 text-xs" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">ເອກະສານ</span>
                  </div>
                  <div className="flex flex-col gap-3 bg-white p-4 dark:bg-slate-900">
                    <div className="flex items-end gap-3">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-slate-500">ເລກໃບບິນ / ໃບເສັດ</label>
                        <input
                          value={form.invoice_no}
                          onChange={(e) => setForm((f) => ({ ...f, invoice_no: e.target.value }))}
                          placeholder="INV-2025-001"
                          className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                      >
                        <FaPaperclip className="text-[10px]" /> ແນບໄຟລ໌
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        className="hidden"
                        onChange={handleFileAttach}
                      />
                    </div>
                    {attachedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {attachedFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
                            {f.preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={f.preview} alt={f.name} className="h-8 w-8 rounded object-cover" />
                            ) : (
                              <FaFileInvoiceDollar className="text-xs text-slate-400" />
                            )}
                            <span className="max-w-[120px] truncate text-xs text-slate-600 dark:text-slate-300">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="text-slate-300 hover:text-red-400"
                            >
                              <FaTimes className="text-[10px]" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">ສະຖານະການຊຳລະ</label>
                  <div className="flex gap-2">
                    {PAYMENT_STATUSES.map((ps) => {
                      const active = form.payment_status === ps.value;
                      const colorMap: Record<string, string> = {
                        amber:   active ? "border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-300 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300" : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                        emerald: active ? "border-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                        sky:     active ? "border-sky-400 bg-sky-50 text-sky-700 ring-1 ring-sky-300 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300" : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      };
                      return (
                        <button
                          key={ps.value}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, payment_status: ps.value }))}
                          className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${colorMap[ps.color]}`}
                        >
                          {ps.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">ໝາຍເຫດ / ຂໍ້ສັງເກດ</label>
                    <textarea
                      rows={2}
                      value={form.maint_note}
                      onChange={(e) => setForm((f) => ({ ...f, maint_note: e.target.value }))}
                      placeholder="ອາການ, ໝາຍເຫດເພີ່ມເຕີມ..."
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>

              </div>

              {saveError && (
                <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">
                  <FaTimes className="shrink-0 text-xs" /> {saveError}
                </div>
              )}

              <div className="flex items-center justify-between border-t px-5 py-4 dark:border-slate-700 shrink-0">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  ຜູ້ບັນທຶກ: <span className="font-medium text-slate-500 dark:text-slate-400">{typeof window !== "undefined" ? (document.cookie.match(/username=([^;]+)/)?.[1] ?? "") : ""}</span>
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setAddOpen(false); setSelectedCar(null); setInspectionDetails([]); setLineItems([newLineItem()]); setAttachedFiles([]); setLastServiceKm(null); }}
                    className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    ຍົກເລີກ
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-400 px-6 text-sm font-bold text-white shadow-sm hover:from-amber-400 hover:to-orange-300 disabled:opacity-60 transition-all"
                  >
                    {saving ? <FaSpinner className="animate-spin text-xs" /> : <FaTools className="text-xs" />}
                    ບັນທຶກການສ້ອມ
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <StatusTableShell count={filtered.length}>
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 dark:border-slate-700">
              <th className="w-6 px-2 py-2" />
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">ລົດ</th>
              <th className="px-3 py-2">ວັນທີ</th>
              <th className="px-3 py-2 text-right">Odo (km)</th>
              <th className="px-3 py-2">ອູ່ສ້ອມ</th>
              <th className="px-3 py-2">ໃບບິນ</th>
              <th className="px-3 py-2 text-right">ຄ່າໃຊ້ຈ່າຍ</th>
              <th className="px-3 py-2">ໝາຍເຫດ</th>
              <th className="px-3 py-2">ການຊຳລະ</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const isExpanded = expandedRows.has(row.id);
              const hasItems = row.line_items && row.line_items.length > 0;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={`border-b transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${isExpanded ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                  >
                    <td className="px-2 py-2 text-center">
                      {hasItems ? (
                        <button
                          type="button"
                          onClick={() => setExpandedRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                            return next;
                          })}
                          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-amber-500"
                        >
                          {isExpanded ? <FaChevronDown className="text-[10px]" /> : <FaChevronRight className="text-[10px]" />}
                        </button>
                      ) : <span className="block h-5 w-5" />}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {row.car_code}
                      {row.created_by && (
                        <div className="text-[10px] text-slate-400">{row.created_by}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.maint_date}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.odometer)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{row.repair_shop ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{row.invoice_no ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className="font-medium">
                        {CURRENCY_SYMBOLS[row.currency] ?? ""}{" "}
                        {formatNumber(row.cost_amount)}
                      </span>
                      <div className="text-xs text-slate-400">{row.currency}</div>
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500">
                      {row.maint_note ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.payment_status === "paid" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">ຊຳລະແລ້ວ</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">ຍັງບໍ່ຊຳລະ</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDelete(row.id)}
                        disabled={deletingId === row.id}
                        className="rounded p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-40"
                      >
                        {deletingId === row.id ? (
                          <FaSpinner className="animate-spin text-xs" />
                        ) : (
                          <FaTrash className="text-xs" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && hasItems && (
                    <tr className="border-b bg-amber-50/60 dark:border-slate-800 dark:bg-amber-950/10">
                      <td colSpan={12} className="px-8 pb-3 pt-1">
                        <div className="flex flex-wrap items-start gap-8">
                          <div className="min-w-0 flex-1">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              ລາຍການສ້ອມ
                            </p>
                            <table className="w-full max-w-lg text-xs">
                              <thead>
                                <tr className="text-left text-[10px] text-slate-400">
                                  <th className="pb-1 pr-4">#</th>
                                  <th className="pb-1 pr-4">ລາຍການ</th>
                                  <th className="pb-1 pr-4 text-center">ຈຳນວນ</th>
                                  <th className="pb-1 pr-4 text-right">ລາຄາ/ຫົວ</th>
                                  <th className="pb-1 text-right">ລວມ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.line_items.map((li, idx) => (
                                  <tr key={li.id} className="border-t border-amber-100 dark:border-amber-900/30">
                                    <td className="py-1 pr-4 text-slate-400">{idx + 1}</td>
                                    <td className="py-1 pr-4 font-medium text-slate-700 dark:text-slate-200">
                                      {li.item_name || li.item_code || "—"}
                                      {li.item_code && li.item_name && (
                                        <span className="ml-1 text-[10px] text-slate-400">({li.item_code})</span>
                                      )}
                                    </td>
                                    <td className="py-1 pr-4 text-center tabular-nums text-slate-500">{formatNumber(li.qty)}</td>
                                    <td className="py-1 pr-4 text-right tabular-nums text-slate-500">{formatNumber(li.unit_price)}</td>
                                    <td className="py-1 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                                      {CURRENCY_SYMBOLS[row.currency] ?? ""} {formatNumber(li.subtotal)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {rules.length > 0 && (
                            <div className="shrink-0">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                ກຳໜົດບຳລຸງຮັກສາ
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {rules.map((rule) => {
                                  const scheduleEntry = scheduleMap.get(row.car_code)?.get(rule.code);
                                  const nextDue = scheduleEntry ? Number(scheduleEntry.next_due_km) : null;
                                  const currentOdo = Number(row.odometer);
                                  const remaining = nextDue != null ? nextDue - currentOdo : null;
                                  const overdue = remaining != null && remaining < 0;
                                  const nearPct = remaining != null ? remaining / rule.interval_km : null;
                                  const [bgColor, textColor, dotColor] =
                                    remaining == null
                                      ? ["bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700", "text-slate-400", "bg-slate-300"]
                                      : overdue
                                      ? ["bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/40", "text-red-600 dark:text-red-400", "bg-red-500"]
                                      : nearPct! < 0.1
                                      ? ["bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/40", "text-red-500 dark:text-red-400", "bg-red-400"]
                                      : nearPct! < 0.25
                                      ? ["bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40", "text-amber-600 dark:text-amber-400", "bg-amber-400"]
                                      : ["bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/40", "text-emerald-700 dark:text-emerald-400", "bg-emerald-500"];
                                  return (
                                    <div key={rule.code} className={`rounded-lg border px-3 py-2 ${bgColor}`}>
                                      <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
                                        {rule.name}
                                      </p>
                                      <p className="text-[9px] text-slate-400 mb-1">ທຸກ {formatNumber(rule.interval_km)} km</p>
                                      <div className="flex items-center gap-1">
                                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                                        <span className={`text-xs font-bold tabular-nums ${textColor}`}>
                                          {remaining == null
                                            ? "ບໍ່ມີຂໍ້ມູນ"
                                            : overdue
                                            ? `ເກີນ ${formatNumber(Math.abs(remaining))} km`
                                            : `ອີກ ${formatNumber(remaining)} km`}
                                        </span>
                                      </div>
                                      {nextDue != null && (
                                        <p className="mt-0.5 text-[9px] text-slate-400">
                                          ຮອດ {formatNumber(nextDue)} km
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="py-10 text-center text-slate-400">
                  ບໍ່ມີຂໍ້ມູນໃນຊ່ວງວັນທີທີ່ເລືອກ
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {Object.keys(data.totalByCurrency ?? {}).length > 0 && (
          <div className="border-t px-4 py-3 dark:border-slate-700">
            <div className="flex flex-wrap gap-4">
              {Object.entries(data.totalByCurrency ?? {}).map(([cur, info]) => (
                <div key={cur} className="flex items-center gap-1.5 text-sm">
                  <FaMoneyBillWave className="text-amber-500 text-xs" />
                  <span className="text-slate-500">ຍອດລວມ {cur}:</span>
                  <span className="font-semibold tabular-nums">
                    {CURRENCY_SYMBOLS[cur] ?? ""} {formatNumber(info.total_cost)}
                  </span>
                  <span className="text-xs text-slate-400">({info.entry_count} ລາຍການ)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </StatusTableShell>
    </div>
  );
}

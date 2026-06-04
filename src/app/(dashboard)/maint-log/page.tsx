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
  FaPen,
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
  payment_files: Array<{ name: string; data: string; type: string }> | null;
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
  current_odometer: number | null;
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

function FileThumbnails({
  files,
  onOpen,
}: {
  files: Array<{ name: string; data: string; type: string }> | null;
  onOpen: () => void;
}) {
  if (!files || files.length === 0) return <span className="text-xs text-slate-300">—</span>;
  const first = files[0];
  const isImage = first.type.startsWith("image/");
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="flex items-center gap-1 rounded hover:opacity-80"
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:${first.type};base64,${first.data}`}
          alt={first.name}
          className="h-8 w-8 rounded object-cover border border-slate-200 dark:border-slate-600"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
          {first.name.split(".").pop()?.toUpperCase() ?? "FILE"}
        </span>
      )}
      {files.length > 1 && (
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          +{files.length - 1}
        </span>
      )}
    </button>
  );
}

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
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);
  const [paymentPopoverId, setPaymentPopoverId] = useState<number | null>(null);
  const [paymentFiles, setPaymentFiles] = useState<AttachedFile[]>([]);
  const paymentFileRef = useRef<HTMLInputElement>(null);
  const [receiptModalRow, setReceiptModalRow] = useState<MaintLog | null>(null);
  const [receiptViewType, setReceiptViewType] = useState<"receipt" | "payment">("receipt");
  const [receiptIndex, setReceiptIndex] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [scheduleMap, setScheduleMap] = useState<Map<string, Map<string, ScheduleRow>>>(new Map());
  const [form, setForm] = useState(emptyForm());
  const [selectedCar, setSelectedCar] = useState<VehicleOption | null>(null);
  const [pendingInspections, setPendingInspections] = useState<PendingInspection[]>([]);
  const [inspectionDetails, setInspectionDetails] = useState<Array<{ item_code: string; item_name: string; status_name: string; status_code: number }>>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formPaymentFiles, setFormPaymentFiles] = useState<AttachedFile[]>([]);
  const formPaymentFileRef = useRef<HTMLInputElement>(null);
  const currencyPickedByUser = useRef(false);
  const [lastServiceKm, setLastServiceKm] = useState<number | null>(null);
  const [rules, setRules] = useState<MaintRule[]>([]);
  const [fromAlertPlan, setFromAlertPlan] = useState<MaintPlanAlert | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ code: "", name: "", interval_km: "" });
  const [savingRule, setSavingRule] = useState(false);
  const [deletingRuleCode, setDeletingRuleCode] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [maintPlanAlerts, setMaintPlanAlerts] = useState<MaintPlanAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [plansOpen, setPlansOpen] = useState(true);
  const [inspectionsOpen, setInspectionsOpen] = useState(true);
  const [maintPlans, setMaintPlans] = useState<MaintPlan[]>([]);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ plan_code: "", car_code: "", next_due_km: "", maint_note: "", rule_codes: [] as string[] });
  const [planCarOption, setPlanCarOption] = useState<VehicleOption | null>(null);
  const [planCurrentOdo, setPlanCurrentOdo] = useState<number | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanCode, setDeletingPlanCode] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [expandedPlanCars, setExpandedPlanCars] = useState<Set<string>>(new Set());

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

  const groupedMaintPlans = useMemo(() => {
    const m = new Map<string, MaintPlan[]>();
    for (const p of maintPlans) {
      if (!m.has(p.car_code)) m.set(p.car_code, []);
      m.get(p.car_code)!.push(p);
    }
    return m;
  }, [maintPlans]);

  const groupedMaintPlanAlerts = useMemo(() => {
    const m = new Map<string, MaintPlanAlert[]>();
    for (const a of maintPlanAlerts) {
      if (!m.has(a.car_code)) m.set(a.car_code, []);
      m.get(a.car_code)!.push(a);
    }
    return m;
  }, [maintPlanAlerts]);

  const planHealthCounts = useMemo(() => {
    const counts = { overdue: 0, warn: 0, soon: 0, ok: 0 };
    for (const plans of groupedMaintPlans.values()) {
      const carOdo = plans[0]?.current_odometer != null ? Number(plans[0].current_odometer) : null;
      for (const p of plans) {
        const rem = carOdo != null ? p.next_due_km - carOdo : null;
        if (rem === null) counts.ok++;
        else if (rem <= 0) counts.overdue++;
        else if (rem <= 500) counts.warn++;
        else if (rem <= 3000) counts.soon++;
        else counts.ok++;
      }
    }
    return counts;
  }, [groupedMaintPlans]);

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

  const handleSavePlan = async (ev: React.SyntheticEvent<HTMLFormElement>) => {
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
        entries.map(async ({ rule_code: rc, next_due_km: km }, i) => {
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

  const handleSaveRule = async (ev: React.SyntheticEvent<HTMLFormElement>) => {
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

  const load = (overrides?: { fromDate?: string; toDate?: string }) => {
    const fd = overrides?.fromDate ?? fromDate;
    const td = overrides?.toDate ?? toDate;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ fromDate: fd, toDate: td });
    void Promise.all([
      fetch(`/api/maint-log?${params}`, { cache: "no-store" }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${r.status}`);
        return json;
      }),
      fetch(`/api/maint-log?mode=inspect_codes`, { cache: "no-store" }).then((r) => r.json()),
      (async () => {
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
          currency: currencyPickedByUser.current ? f.currency : (d.last_currency ?? f.currency),
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
    const paidRows = data.rows.filter((r) => r.payment_status === "paid");
    const pendingRows = data.rows.filter((r) => r.payment_status !== "paid");

    const sumByCurrency = (rows: MaintLog[]) => {
      const acc: Record<string, number> = {};
      for (const r of rows) {
        const amt = Number(r.cost_amount) || 0;
        if (amt > 0) acc[r.currency] = (acc[r.currency] ?? 0) + amt;
      }
      return acc;
    };
    const fmtAmountsNode = (sums: Record<string, number>) => {
      const entries = Object.entries(sums);
      if (entries.length === 0) return <span>—</span>;
      return (
        <span className="flex flex-col gap-0.5">
          {entries.map(([c, v]) => (
            <span key={c} className="tabular-nums leading-tight">
              {CURRENCY_SYMBOLS[c] ?? c} {formatNumber(v)}
            </span>
          ))}
        </span>
      );
    };

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
        tone: (cur === "LAK" ? "emerald" : cur === "THB" ? "violet" : "orange") as StatusStat["tone"],
      });
    }
    base.push({
      label: `ຊຳລະແລ້ວ (${paidRows.length} ລາຍການ)`,
      value: fmtAmountsNode(sumByCurrency(paidRows)),
      icon: <FaMoneyBillWave />,
      tone: "emerald",
    });
    base.push({
      label: `ຍັງບໍ່ຊຳລະ (${pendingRows.length} ລາຍການ)`,
      value: fmtAmountsNode(sumByCurrency(pendingRows)),
      icon: <FaMoneyBillWave />,
      tone: "orange",
    });
    return base;
  }, [data.rows, data.totalByCurrency, totalEntries]);

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

  const handleSubmit = async (ev: React.SyntheticEvent<HTMLFormElement>) => {
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
        payment_files: formPaymentFiles.map(({ name, data, type }) => ({ name, data, type })),
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
      const savedOdometer = form.odometer ? Number(form.odometer) : 0;
      const alertPlan = fromAlertPlan;
      setAddOpen(false);
      setForm(emptyForm());
      setSelectedCar(null);
      setLineItems([newLineItem()]);
      setAttachedFiles([]);
      setFormPaymentFiles([]);
      currencyPickedByUser.current = false;
      setLastServiceKm(null);
      setFromAlertPlan(null);
      if (savedInspectCode) {
        setPendingInspections((prev) => prev.filter((p) => p.inspect_code !== savedInspectCode));
      }
      if (alertPlan) {
        const rule = alertPlan.rule_code ? rules.find((r) => r.code === alertPlan.rule_code) : null;
        const newNextDueKm = rule
          ? savedOdometer + Number(rule.interval_km)
          : alertPlan.next_due_km;
        await fetch("/api/maint-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_code: alertPlan.plan_code,
            car_code: alertPlan.car_code,
            rule_code: alertPlan.rule_code ?? null,
            next_due_km: newNextDueKm,
            maint_note: alertPlan.maint_note ?? null,
          }),
        }).catch(console.error);
        reloadPlanAlerts();
        reloadPlans();
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
    setFormPaymentFiles([]);
    currencyPickedByUser.current = false;
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

  const openFormFromAlert = (alert: MaintPlanAlert) => {
    const ruleName = alert.rule_code ? (rules.find((r) => r.code === alert.rule_code)?.name ?? null) : null;
    setForm({ ...emptyForm(), maint_note: alert.maint_note ?? "" });
    setSelectedCar({ id: alert.car_code, code: alert.car_code, name: alert.car_code });
    setInspectionDetails([]);
    setLineItems(ruleName ? [{ ...newLineItem(), item_name: ruleName }] : [newLineItem()]);
    setAttachedFiles([]);
    setFormPaymentFiles([]);
    currencyPickedByUser.current = false;
    setSaveError(null);
    setFromAlertPlan(alert);
    setAddOpen(true);
  };

  const handleTogglePayment = async (id: number, newStatus: string, receiptFiles?: Array<{ name: string; data: string; type: string }>) => {
    setUpdatingPaymentId(id);
    try {
      const res = await fetch("/api/maint-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, payment_status: newStatus, receipt_files: receiptFiles ?? [] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "ເກີດຂໍ້ຜິດພາດ" }));
        throw new Error((err as { error?: string }).error ?? "ເກີດຂໍ້ຜິດພາດ");
      }
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingPaymentId(null);
    }
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
          {/* Quick month shortcuts */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">ຊ່ວງໄວ</label>
            <div className="flex gap-1.5">
              {[
                { label: "ເດືອນນີ້", offset: 0 },
                { label: "ເດືອນກ່ອນ", offset: -1 },
              ].map(({ label, offset }) => {
                const today = getFixedTodayDate();
                const [y, mo] = today.slice(0, 7).split("-").map(Number);
                let tm = mo + offset;
                let ty = y;
                if (tm < 1) { tm += 12; ty--; }
                const pad2 = (n: number) => String(n).padStart(2, "0");
                const fd = `${ty}-${pad2(tm)}-01`;
                const daysInMonth = new Date(ty, tm, 0).getDate();
                const td2 = offset === 0 ? today : `${ty}-${pad2(tm)}-${pad2(daysInMonth)}`;
                const isActive = fromDate === fd && (offset === 0 ? toDate >= fd : toDate === td2);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setFromDate(fd); setToDate(td2); load({ fromDate: fd, toDate: td2 }); }}
                    className={`h-9 rounded-md border px-3 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                        : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
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
            onClick={() => load()}
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
          <button
            type="button"
            onClick={() => setInspectionsOpen(v => !v)}
            className="flex w-full items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-3 text-left dark:border-red-900/30 dark:bg-red-950/30"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <FaClipboardCheck className="text-sm text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">
                ການກວດທີ່ຕ້ອງສ້ອມ — {pendingInspections.length} ລາຍການ
              </p>
              <p className="text-xs text-red-500/80 dark:text-red-400/70">
                ກວດສະພາບລົດພົບຂໍ້ບົກພ່ອງ ກົດ "ສ້າງໃບສ້ອມ" ທັນທີ
              </p>
            </div>
            {inspectionsOpen
              ? <FaChevronDown className="shrink-0 text-xs text-red-400" />
              : <FaChevronRight className="shrink-0 text-xs text-red-400" />}
          </button>
          {inspectionsOpen && <div className="max-h-56 overflow-auto divide-y divide-slate-100 dark:divide-slate-800">
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
          </div>}
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
          <button
            type="button"
            onClick={() => setAlertsOpen(v => !v)}
            className="flex w-full items-center gap-3 border-b border-orange-100 bg-orange-50 px-5 py-3 text-left dark:border-orange-900/30 dark:bg-orange-950/30"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40">
              <FaClipboardCheck className="text-sm text-orange-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-orange-700 dark:text-orange-300">
                ໃກ້ຮອດກໍານົດສ້ອມແປງ — {groupedMaintPlanAlerts.size} ລົດ · {maintPlanAlerts.length} ລາຍການ
              </p>
              <p className="text-xs text-orange-500/80 dark:text-orange-400/70">
                ລົດຕໍ່ໄປນີ້ຄວນໄດ້ຮັບການສ້ອມ (ຕ່ຳກວ່າ 500 km)
              </p>
            </div>
            {alertsOpen
              ? <FaChevronDown className="shrink-0 text-xs text-orange-400" />
              : <FaChevronRight className="shrink-0 text-xs text-orange-400" />}
          </button>
          {alertsOpen && <div className="max-h-56 overflow-auto divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from(groupedMaintPlanAlerts.entries()).map(([carCode, alerts]) => {
              const hasOverdue = alerts.some(a => Number(a.remaining_km) < 0);
              const currentOdo = alerts[0]?.current_odometer ?? 0;
              const worstAlert = alerts.reduce((w, a) => Number(a.remaining_km) < Number(w.remaining_km) ? a : w, alerts[0]);
              const fillPct = worstAlert.next_due_km > 0 ? Math.min(100, Math.round((currentOdo / worstAlert.next_due_km) * 100)) : 0;
              return (
                <div key={carCode} className="px-5 py-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${hasOverdue ? "bg-red-500" : "bg-orange-400"}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{carCode}</span>
                          {alerts.length > 1 && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-600 dark:bg-orange-900/50 dark:text-orange-300">
                              {alerts.length} ລາຍການ
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${hasOverdue ? "bg-red-500" : fillPct >= 95 ? "bg-orange-500" : "bg-orange-400"}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{fillPct}%</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                          Odo {formatNumber(currentOdo)} km
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-5 flex flex-col gap-1.5">
                    {alerts.map(alert => {
                      const remaining = Number(alert.remaining_km);
                      const isOverdue = remaining < 0;
                      return (
                        <div key={alert.plan_code} className="flex items-center gap-2">
                          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {(alert.rule_code || alert.maint_note) && (
                              <span className="text-xs text-slate-600 dark:text-slate-300">
                                {[
                                  alert.rule_code ? (rules.find((r) => r.code === alert.rule_code)?.name ?? alert.rule_code) : null,
                                  alert.maint_note,
                                ].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isOverdue
                                ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300"
                                : "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-300"
                            }`}>
                              {isOverdue ? `ເກີນ ${formatNumber(Math.abs(remaining))} km` : `ອີກ ${formatNumber(remaining)} km`}
                            </span>
                            <span className="text-[11px] text-slate-400 tabular-nums">ຮອດ {formatNumber(alert.next_due_km)} km</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openFormFromAlert(alert)}
                            className="shrink-0 flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-600 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-900/40"
                          >
                            <FaPlus className="text-[9px]" /> ສ້າງໃບ
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>}
        </div>
      )}

      {maintPlans.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setPlansOpen(v => !v)}
            onKeyDown={(e) => e.key === "Enter" && setPlansOpen(v => !v)}
            className="flex cursor-pointer items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 hover:bg-slate-100/70 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-700/40"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40">
              <FaClipboardCheck className="text-sm text-orange-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">ແຜນສ້ອມແປງ — {groupedMaintPlans.size} ລົດ · {maintPlans.length} ລາຍການ</p>
              <p className="text-xs text-slate-400">ຄລິກ row ເພື່ອ expand ລາຍການ rules</p>
            </div>
            {plansOpen
              ? <FaChevronDown className="shrink-0 text-xs text-slate-400" />
              : <FaChevronRight className="shrink-0 text-xs text-slate-400" />}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPlanModalOpen(true); setPlanError(null); }}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-600 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300"
            >
              <FaPlus className="text-[10px]" /> ເພີ່ມ
            </button>
          </div>
          {plansOpen && (() => {
            const { overdue, warn, soon, ok } = planHealthCounts;
            const total = overdue + warn + soon + ok;
            if (total === 0) return null;
            return (
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-2.5 dark:border-slate-700 dark:bg-slate-800/30">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {overdue > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />{overdue} ເກີນກຳໜົດ</span>}
                  {warn > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-500"><span className="inline-block h-2 w-2 rounded-full bg-orange-400" />{warn} ໃກ້ຮອດ</span>}
                  {soon > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-500"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />{soon} ເຝ້າລະວັງ</span>}
                  {ok > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />{ok} ດີ</span>}
                  <span className="ml-auto text-[10px] text-slate-400">{total} ລາຍການທັງໝົດ</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  {overdue > 0 && <div className="bg-red-500 transition-all duration-500" style={{ width: `${(overdue / total) * 100}%` }} />}
                  {warn > 0 && <div className="bg-orange-400 transition-all duration-500" style={{ width: `${(warn / total) * 100}%` }} />}
                  {soon > 0 && <div className="bg-amber-400 transition-all duration-500" style={{ width: `${(soon / total) * 100}%` }} />}
                  {ok > 0 && <div className="bg-emerald-400 transition-all duration-500" style={{ width: `${(ok / total) * 100}%` }} />}
                </div>
              </div>
            );
          })()}
          {plansOpen && <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <colgroup>
                <col className="w-24" />
                <col />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-8" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-700">
                  <th className="px-4 py-2">ລົດ</th>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-4 py-2 text-right">ປັດຈຸບັນ (km)</th>
                  <th className="px-4 py-2 text-right">ຮອດ (km)</th>
                  <th className="px-3 py-2">ໝາຍເຫດ</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {Array.from(groupedMaintPlans.entries()).map(([carCode, plans]) => {
                  const isExpanded = expandedPlanCars.has(carCode);
                  const carOdo = plans[0]?.current_odometer != null ? Number(plans[0].current_odometer) : null;
                  const worstRemaining = carOdo != null
                    ? Math.min(...plans.map(p => p.next_due_km - carOdo))
                    : null;
                  const hasOverdue = worstRemaining != null && worstRemaining <= 0;
                  const worstPlanDue = carOdo != null ? carOdo + (worstRemaining ?? 0) : null;
                  const groupFillPct = carOdo != null && worstPlanDue != null && worstPlanDue > 0
                    ? Math.min(100, Math.round((carOdo / worstPlanDue) * 100))
                    : null;
                  return (
                    <Fragment key={carCode}>
                      <tr
                        className="cursor-pointer border-b border-slate-100 bg-slate-50/80 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-700/50"
                        onClick={() => setExpandedPlanCars(prev => {
                          const next = new Set(prev);
                          if (next.has(carCode)) next.delete(carCode); else next.add(carCode);
                          return next;
                        })}
                      >
                        <td className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-200">
                          <div className="flex items-start gap-2">
                            <span className="mt-1">
                              {isExpanded
                                ? <FaChevronDown className="text-[10px] text-slate-400" />
                                : <FaChevronRight className="text-[10px] text-slate-400" />}
                            </span>
                            <div>
                              <span className="font-bold text-slate-700 dark:text-slate-200">{carCode}</span>
                              {groupFillPct != null && (
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${hasOverdue ? "bg-red-500" : groupFillPct >= 90 ? "bg-orange-400" : "bg-amber-400"}`}
                                      style={{ width: `${groupFillPct}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] tabular-nums text-slate-400">{groupFillPct}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-slate-400">{plans.length} ລາຍການ</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                          {carOdo != null ? formatNumber(carOdo) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {worstRemaining != null && (
                            <span className={`text-xs font-semibold ${hasOverdue ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400"}`}>
                              {hasOverdue ? `ເກີນ ${formatNumber(-worstRemaining)} km` : `ຕ່ຳສຸດ ${formatNumber(worstRemaining)} km`}
                            </span>
                          )}
                        </td>
                        <td colSpan={2} />
                      </tr>
                      {isExpanded && plans.map((p) => {
                        const currentOdo = p.current_odometer != null ? Number(p.current_odometer) : null;
                        const remaining = currentOdo != null ? p.next_due_km - currentOdo : null;
                        return (
                          <tr key={p.plan_code} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                            <td className="py-2 pl-9 pr-2 text-xs text-slate-300">└</td>
                            <td className="px-3 py-2 text-xs text-slate-500 truncate">
                              {p.rule_code ? (rules.find((r) => r.code === p.rule_code)?.name ?? p.rule_code) : "—"}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                              {currentOdo != null ? formatNumber(currentOdo) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              <span className={`text-xs font-bold ${remaining != null && remaining <= 0 ? "text-red-500 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`}>
                                {formatNumber(p.next_due_km)}
                              </span>
                              {remaining != null && (
                                <div className={`text-[10px] tabular-nums ${remaining <= 0 ? "text-red-400" : remaining <= 3000 ? "text-amber-500" : "text-slate-400"}`}>
                                  {remaining <= 0 ? `ເກີນ ${formatNumber(-remaining)} km` : `ເຫຼືອ ${formatNumber(remaining)} km`}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-400 truncate">{p.maint_note ?? "—"}</td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeletePlan(p.plan_code); }}
                                disabled={deletingPlanCode === p.plan_code}
                                className="rounded p-1 text-slate-300 hover:text-red-500 disabled:opacity-40"
                              >
                                {deletingPlanCode === p.plan_code
                                  ? <FaSpinner className="animate-spin text-xs" />
                                  : <FaTrash className="text-xs" />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {false && scheduleCarCodes.length > 0 && rules.length > 0 && (
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
                onClick={() => { setAddOpen(false); setSelectedCar(null); setInspectionDetails([]); setLineItems([newLineItem()]); setAttachedFiles([]); setFormPaymentFiles([]); setLastServiceKm(null); setFromAlertPlan(null); }}
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
                          <th className="w-7 px-2 py-1.5 text-center">ລຳດັບ</th>
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
                        onChange={(e) => { currencyPickedByUser.current = true; setForm((f) => ({ ...f, currency: e.target.value })); }}
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

                {form.payment_status === "paid" && (
                  <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">ຮູບໃບຊຳລະ</label>
                    <input
                      ref={formPaymentFileRef}
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        for (const file of Array.from(e.target.files ?? [])) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const data64 = (ev.target?.result as string ?? "").split(",")[1] ?? "";
                            setFormPaymentFiles((prev) => [...prev, { name: file.name, data: data64, type: file.type }]);
                          };
                          reader.readAsDataURL(file);
                        }
                        if (e.target) e.target.value = "";
                      }}
                    />
                    {formPaymentFiles.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => formPaymentFileRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 py-3 text-xs font-semibold text-emerald-600 hover:border-emerald-400 hover:bg-emerald-100/50 dark:border-emerald-700 dark:text-emerald-400"
                      >
                        <FaPaperclip /> ແນບຮູບໃບຊຳລະ
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {formPaymentFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800">
                            {f.type.startsWith("image/")
                              ? <img src={`data:${f.type};base64,${f.data}`} alt={f.name} className="h-8 w-8 rounded object-cover" />
                              : <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 dark:bg-slate-700"><FaPaperclip className="text-slate-400 text-xs" /></div>}
                            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600 dark:text-slate-300">{f.name}</span>
                            <button type="button" onClick={() => setFormPaymentFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400"><FaTimes className="text-[10px]" /></button>
                          </div>
                        ))}
                        <button type="button" onClick={() => formPaymentFileRef.current?.click()} className="text-[11px] text-emerald-500 hover:underline">+ ເພີ່ມໄຟລ໌</button>
                      </div>
                    )}
                  </div>
                )}

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
                    onClick={() => { setAddOpen(false); setSelectedCar(null); setInspectionDetails([]); setLineItems([newLineItem()]); setAttachedFiles([]); setFormPaymentFiles([]); setLastServiceKm(null); setFromAlertPlan(null); }}
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
            <tr className="sticky top-0 z-10 border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
              <th className="w-6 px-2 py-2.5" />
              <th className="px-3 py-2.5">ລຳດັບ</th>
              <th className="px-3 py-2.5">ລົດ</th>
              <th className="px-3 py-2.5">ວັນທີ</th>
              <th className="px-3 py-2.5 text-right">Odo (km)</th>
              <th className="px-3 py-2.5">ອູ່ສ້ອມ</th>
              <th className="px-3 py-2.5">ໃບບິນ</th>
              <th className="px-3 py-2.5">ຮູບໃບບິນ</th>
              <th className="px-3 py-2.5">ຮູບໃບຊຳລະ</th>
              <th className="px-3 py-2.5 text-right">ຄ່າໃຊ້ຈ່າຍ</th>
              <th className="px-3 py-2.5">ໝາຍເຫດ</th>
              <th className="px-3 py-2.5">ການຊຳລະ</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const isExpanded = expandedRows.has(row.id);
              const hasItems = row.line_items && row.line_items.length > 0;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={`border-b transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${isExpanded ? "bg-amber-50/40 dark:bg-amber-950/10" : i % 2 !== 0 ? "bg-slate-50/60 dark:bg-slate-800/20" : ""}`}
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
                    <td className="px-3 py-2 text-xs text-slate-300 dark:text-slate-600">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100">{row.car_code}</span>
                      {row.created_by && (
                        <div className="text-[10px] text-slate-400">{row.created_by}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                      {row.maint_date}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-400">
                      {formatNumber(row.odometer)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{row.repair_shop ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.invoice_no
                        ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{row.invoice_no}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    {/* ຮູບໃບບິນ (repair invoice) */}
                    <td className="px-3 py-1">
                      <FileThumbnails files={row.receipt_files} onOpen={() => { setReceiptViewType("receipt"); setReceiptModalRow(row); setReceiptIndex(0); }} />
                    </td>
                    {/* ຮູບໃບຊຳລະ (payment receipt) */}
                    <td className="px-3 py-1">
                      <FileThumbnails files={row.payment_files} onOpen={() => { setReceiptViewType("payment"); setReceiptModalRow(row); setReceiptIndex(0); }} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="tabular-nums font-bold text-slate-800 dark:text-slate-100">
                        {CURRENCY_SYMBOLS[row.currency] ?? ""}{formatNumber(row.cost_amount)}
                      </span>
                      <span className="ml-1 text-[10px] text-slate-400">{row.currency}</span>
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-400">
                      {row.maint_note ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={updatingPaymentId === row.id}
                        onClick={(e) => { e.stopPropagation(); setPaymentPopoverId(row.id); }}
                        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
                      >
                        {updatingPaymentId === row.id ? (
                          <FaSpinner className="animate-spin text-[10px] text-slate-400" />
                        ) : row.payment_status === "paid" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">ຊຳລະແລ້ວ</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">ຍັງບໍ່ຊຳລະ</span>
                        )}
                        <FaPen className="text-[8px] text-slate-300" />
                      </button>
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
                    <tr className="border-b dark:border-slate-800">
                      <td colSpan={12} className="bg-slate-50/80 px-6 py-3 dark:bg-slate-800/30">
                        <div className="flex flex-wrap gap-2">
                          {row.line_items.map((li, idx) => (
                            <div
                              key={li.id}
                              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                  {li.item_name || li.item_code || "—"}
                                </p>
                                {li.item_code && li.item_name && (
                                  <p className="text-[10px] text-slate-400">{li.item_code}</p>
                                )}
                              </div>
                              <div className="ml-2 shrink-0 text-right">
                                <p className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                                  {CURRENCY_SYMBOLS[row.currency] ?? ""} {formatNumber(li.subtotal)}
                                </p>
                                {li.qty > 1 && (
                                  <p className="text-[10px] tabular-nums text-slate-400">×{li.qty}</p>
                                )}
                              </div>
                            </div>
                          ))}
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

      {receiptModalRow && (() => {
        const files = receiptViewType === "payment"
          ? (receiptModalRow.payment_files ?? [])
          : (receiptModalRow.receipt_files ?? []);
        const f = files[receiptIndex];
        const src = f ? `data:${f.type};base64,${f.data}` : "";
        const isImage = f?.type.startsWith("image/");
        const isPdf = f?.type === "application/pdf";
        const total = files.length;
        const prev = () => setReceiptIndex((i) => (i - 1 + total) % total);
        const next = () => setReceiptIndex((i) => (i + 1) % total);
        return (
          <div
            className="fixed inset-0 z-[1100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setReceiptModalRow(null)}
          >
            {/* Header */}
            <div className="flex w-full max-w-3xl items-center justify-between px-4 pb-3" onClick={(e) => e.stopPropagation()}>
              <div>
                <p className="text-sm font-bold text-white">
                  {f?.name ?? "ໄຟລ໌"}
                </p>
                <p className="text-xs text-white/50">
                  ລົດ {receiptModalRow.car_code} · {receiptModalRow.maint_date}
                  {receiptModalRow.invoice_no && <> · <span className="font-mono">{receiptModalRow.invoice_no}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {f && (
                  <a href={src} download={f.name} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20" onClick={(e) => e.stopPropagation()}>
                    ດາວໂຫຼດ
                  </a>
                )}
                <button type="button" onClick={() => setReceiptModalRow(null)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20">
                  <FaTimes />
                </button>
              </div>
            </div>

            {/* Viewer */}
            <div className="relative flex w-full max-w-3xl flex-1 items-center justify-center px-4" style={{ maxHeight: "75vh" }} onClick={(e) => e.stopPropagation()}>
              {total > 1 && (
                <button type="button" onClick={prev} className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25">
                  <FaChevronRight className="rotate-180 text-sm" />
                </button>
              )}
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black/30">
                {isImage && <img src={src} alt={f!.name} className="max-h-full max-w-full object-contain" />}
                {isPdf && <iframe src={src} title={f!.name} className="h-full w-full" style={{ minHeight: "65vh" }} />}
                {f && !isImage && !isPdf && (
                  <div className="text-center text-white/60">
                    <FaPaperclip className="mx-auto mb-2 text-3xl" />
                    <p className="text-sm">ບໍ່ສາມາດ preview ໄດ້</p>
                    <p className="text-xs opacity-60">{f.name}</p>
                  </div>
                )}
                {!f && <p className="text-sm text-white/40">ບໍ່ມີໄຟລ໌</p>}
              </div>
              {total > 1 && (
                <button type="button" onClick={next} className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25">
                  <FaChevronRight className="text-sm" />
                </button>
              )}
            </div>

            {/* Thumbnails / counter */}
            {total > 1 && (
              <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {files.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReceiptIndex(idx)}
                    className={`h-2 rounded-full transition-all ${idx === receiptIndex ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`}
                  />
                ))}
                <span className="ml-2 text-xs text-white/50">{receiptIndex + 1} / {total}</span>
              </div>
            )}
          </div>
        );
      })()}

      {paymentPopoverId !== null && (() => {
        const target = data.rows.find((r) => r.id === paymentPopoverId);
        if (!target) return null;
        const isPaid = target.payment_status === "paid";
        const canConfirm = paymentFiles.length > 0;
        const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(e.target.files ?? []);
          for (const file of files) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const data64 = (ev.target?.result as string ?? "").split(",")[1] ?? "";
              setPaymentFiles((prev) => [...prev, { name: file.name, data: data64, type: file.type }]);
            };
            reader.readAsDataURL(file);
          }
          if (e.target) e.target.value = "";
        };
        return (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setPaymentPopoverId(null); setPaymentFiles([]); }}>
            <div className="w-96 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">ອັບເດດການຊຳລະ</p>
                <p className="mt-0.5 text-xs text-slate-400">ລົດ {target.car_code} · {target.maint_date}</p>
              </div>

              <div className="flex flex-col gap-2 p-4">
                {/* pending option */}
                <button
                  type="button"
                  onClick={async () => {
                    setPaymentPopoverId(null);
                    setPaymentFiles([]);
                    if (!isPaid) return;
                    await handleTogglePayment(target.id, "pending", []);
                  }}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 ${isPaid ? "opacity-60 hover:opacity-100" : "ring-2 ring-amber-400 ring-offset-1"}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-300">ຍັງບໍ່ຊຳລະ</p>
                    <p className="text-[11px] text-slate-400">ຍັງລໍຖ້າການຊຳລະ</p>
                  </div>
                  {!isPaid && <span className="text-xs font-bold text-slate-400">✓ ປັດຈຸບັນ</span>}
                </button>

                {/* paid option — requires receipt upload */}
                <div className={`rounded-xl border-2 transition-all border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 ${isPaid ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}>
                  <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">ຊຳລະແລ້ວ</p>
                      <p className="text-[11px] text-slate-400">ຕ້ອງອັບໂຫຼດໃບບິນ / ໃບເສັດ</p>
                    </div>
                    {isPaid && <span className="text-xs font-bold text-slate-400">✓ ປັດຈຸບັນ</span>}
                  </div>

                  {!isPaid && (
                    <div className="px-4 pb-3">
                      <input ref={paymentFileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFileAdd} />
                      {paymentFiles.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => paymentFileRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 py-3 text-xs font-semibold text-emerald-600 hover:border-emerald-400 hover:bg-emerald-100/50 dark:border-emerald-700 dark:text-emerald-400"
                        >
                          <FaPaperclip /> ແນບໃບບິນ / ໃບເສັດ
                        </button>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {paymentFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800">
                              {f.type.startsWith("image/")
                                ? <img src={`data:${f.type};base64,${f.data}`} alt={f.name} className="h-8 w-8 rounded object-cover" />
                                : <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100"><FaPaperclip className="text-slate-400 text-xs" /></div>}
                              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600 dark:text-slate-300">{f.name}</span>
                              <button type="button" onClick={() => setPaymentFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400"><FaTimes className="text-[10px]" /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => paymentFileRef.current?.click()} className="text-[11px] text-emerald-500 hover:underline">+ ເພີ່ມໄຟລ໌</button>
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={!canConfirm || updatingPaymentId === target.id}
                        onClick={async () => {
                          setPaymentPopoverId(null);
                          await handleTogglePayment(target.id, "paid", paymentFiles.map(({ name, data, type }) => ({ name, data, type })));
                          setPaymentFiles([]);
                        }}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-40"
                      >
                        {updatingPaymentId === target.id ? <FaSpinner className="animate-spin" /> : null}
                        ຢືນຢັນການຊຳລະ
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <button type="button" onClick={() => { setPaymentPopoverId(null); setPaymentFiles([]); }} className="w-full rounded-lg py-2 text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">ຍົກເລີກ</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

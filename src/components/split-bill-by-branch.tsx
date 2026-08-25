"use client";

import { useEffect, useMemo, useState } from "react";
import { FaSpinner, FaWarehouse, FaTimes, FaCodeBranch } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { getFixedTodayDate, FIXED_YEAR_START, FIXED_YEAR_END } from "@/lib/fixed-year";
import { userErrorMessage } from "@/lib/action-error";

interface RemainingItem {
  item_code: string;
  item_name: string;
  unit_code: string;
  erp_qty: number;
  placed_qty: number;
  remaining_qty: number;
}

interface WarehouseGroup {
  wh_code: string;
  wh_name: string;
  branch_stock: string;
  suggested_transport_code: string;
  items: RemainingItem[];
  remaining_qty_total: number;
}

interface Branch {
  code: string;
  name_1: string;
}

interface DeliveryRound {
  code: string;
  name: string;
  time_label?: string;
}

interface BranchSchedule {
  date: string;
  round: string;
}

interface SplitBillByBranchProps {
  billNo: string;
  onClose: () => void;
  onDone?: () => void;
}

// "ຈັດຖ້ຽວທີ່ເຫຼືອຕາມສາຂາ" — dialog that fans one multi-warehouse bill out into a
// separate delivery task per branch. Each warehouse group is assigned a delivery
// branch (pre-filled from the warehouse→branch suggestion); every distinct branch
// then gets a schedule (date + round). Confirming creates one custom sub-bill per
// branch on that branch's pending queue via Actions.dispatchBillRemainingByBranch.
export default function SplitBillByBranch({ billNo, onClose, onDone }: SplitBillByBranchProps) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<WarehouseGroup[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rounds, setRounds] = useState<DeliveryRound[]>([]);
  // wh_code -> chosen delivery branch (transport_type code)
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  // transport_code -> { date, round }
  const [schedules, setSchedules] = useState<Record<string, BranchSchedule>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      Actions.getBillRemainingItemsByWarehouse(billNo) as Promise<WarehouseGroup[]>,
      Actions.getTransportBranches() as Promise<Branch[]>,
      Actions.listDeliveryRounds(true) as Promise<DeliveryRound[]>,
    ])
      .then(([g, b, r]) => {
        if (cancelled) return;
        const usable = (g ?? []).filter((group) => group.remaining_qty_total > 0);
        setGroups(usable);
        setBranches(b ?? []);
        setRounds(r ?? []);
        setAssignments(
          Object.fromEntries(usable.map((group) => [group.wh_code, group.suggested_transport_code || ""]))
        );
      })
      .catch((e) => {
        if (!cancelled) setLoadError(userErrorMessage(e, "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billNo]);

  // Distinct branches currently chosen across all warehouse groups.
  const chosenBranches = useMemo(() => {
    const seen = new Map<string, string>();
    for (const group of groups) {
      const code = assignments[group.wh_code];
      if (code && !seen.has(code)) {
        seen.set(code, branches.find((b) => b.code === code)?.name_1 ?? code);
      }
    }
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [groups, assignments, branches]);

  // Keep a schedule stub for every chosen branch (default: today, no round yet).
  useEffect(() => {
    setSchedules((prev) => {
      const next: Record<string, BranchSchedule> = {};
      for (const { code } of chosenBranches) {
        next[code] = prev[code] ?? { date: getFixedTodayDate(), round: "" };
      }
      return next;
    });
  }, [chosenBranches]);

  const setAssignment = (whCode: string, transportCode: string) =>
    setAssignments((prev) => ({ ...prev, [whCode]: transportCode }));

  const setSchedule = (transportCode: string, patch: Partial<BranchSchedule>) =>
    setSchedules((prev) => ({
      ...prev,
      [transportCode]: { ...(prev[transportCode] ?? { date: getFixedTodayDate(), round: "" }), ...patch },
    }));

  const validationError = useMemo(() => {
    if (groups.length === 0) return "ບໍ່ມີລາຍການທີ່ຍັງເຫຼືອຈັດ";
    for (const group of groups) {
      if (!assignments[group.wh_code]) return `ເລືອກສາຂາໃຫ້ ${group.wh_name}`;
    }
    for (const { code, name } of chosenBranches) {
      const sched = schedules[code];
      if (!sched?.date) return `ເລືອກວັນຈັດສົ່ງໃຫ້ສາຂາ ${name}`;
      if (!sched?.round) return `ເລືອກຮອບຈັດສົ່ງໃຫ້ສາຂາ ${name}`;
    }
    return null;
  }, [groups, assignments, chosenBranches, schedules]);

  const handleConfirm = async () => {
    if (validationError) return;
    const summary = chosenBranches
      .map(({ name }) => name)
      .join(", ");
    const ok = await confirm({
      title: "ຈັດຖ້ຽວທີ່ເຫຼືອຕາມສາຂາ",
      message: `ແຍກບິນ ${billNo} ອອກເປັນ ${chosenBranches.length} ສາຂາ (${summary})? ແຕ່ລະສາຂາຈະໄດ້ບິນຍ່ອຍເຂົ້າຄິວຈັດຖ້ຽວຂອງຕົນ.`,
      tone: "warning",
      confirmLabel: "ຢືນຢັນແຍກ",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const payload = {
        bill_no: billNo,
        branches: groups.map((group) => {
          const transport = assignments[group.wh_code];
          const sched = schedules[transport];
          return {
            transport_code: transport,
            scheduled_date: sched.date,
            delivery_round_code: sched.round,
            wh_label: group.wh_name,
            items: group.items
              .filter((item) => item.remaining_qty > 0)
              .map((item) => ({
                item_code: item.item_code,
                item_name: item.item_name,
                unit_code: item.unit_code,
                qty: item.remaining_qty,
              })),
          };
        }),
      };
      const result = (await Actions.dispatchBillRemainingByBranch(payload)) as {
        created: Array<{ transport_name: string; item_count: number }>;
      };
      await confirm({
        title: "ແຍກສຳເລັດ",
        message: `ສ້າງບິນຍ່ອຍ ${result.created.length} ໃບ: ${result.created
          .map((c) => `${c.transport_name} (${c.item_count} ລາຍການ)`)
          .join(" · ")}`,
        tone: "success",
        single: true,
      });
      onDone?.();
      onClose();
    } catch (error) {
      const message = userErrorMessage(error, "ແຍກບໍ່ສຳເລັດ");
      void confirm({ title: "ຜິດພາດ", message, tone: "warning", single: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FaCodeBranch className="text-emerald-500" />
              ຈັດຖ້ຽວທີ່ເຫຼືອຕາມສາຂາ
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ບິນ <span className="font-semibold text-slate-700 dark:text-slate-200">{billNo}</span> ·
              ແຍກສິນຄ້າແຕ່ລະສາງໄປສາຂາທີ່ຈັດສົ່ງ
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 flex items-center justify-center"
            title="ປິດ"
          >
            <FaTimes size={13} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-400">
            <FaSpinner className="animate-spin" /> ກຳລັງໂຫຼດ...
          </div>
        ) : loadError ? (
          <div className="py-10 text-center text-xs text-rose-500">{loadError}</div>
        ) : groups.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            ບໍ່ມີລາຍການທີ່ຍັງເຫຼືອຈັດສຳລັບບິນນີ້
          </div>
        ) : (
          <>
            {/* Per-warehouse group → branch assignment */}
            <div className="space-y-2">
              {groups.map((group) => (
                <div
                  key={group.wh_code}
                  className="rounded-lg border border-slate-200/60 dark:border-white/10 p-3"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <FaWarehouse className="text-slate-400 shrink-0" size={12} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {group.wh_name || "ບໍ່ລະບຸສາງ"}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {group.items.length} ລາຍການ · ເຫຼືອ {group.remaining_qty_total}
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      ສາຂາ →
                      <select
                        value={assignments[group.wh_code] ?? ""}
                        onChange={(e) => setAssignment(group.wh_code, e.target.value)}
                        className="h-7 rounded-lg glass-input px-2 text-[11px] text-slate-700 dark:text-slate-200"
                      >
                        <option value="">- ເລືອກສາຂາ -</option>
                        {branches.map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.name_1} ({b.code})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {group.items.map((item) => (
                      <span
                        key={item.item_code}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-500/5 dark:bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500"
                        title={item.item_code}
                      >
                        {item.item_name}
                        <span className="font-semibold text-emerald-600">
                          {item.remaining_qty} {item.unit_code}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Schedule per chosen branch */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                ຕາຕະລາງຈັດສົ່ງຕໍ່ສາຂາ
              </p>
              {chosenBranches.length === 0 ? (
                <p className="text-[11px] text-slate-400">ເລືອກສາຂາຂ້າງເທິງກ່ອນ</p>
              ) : (
                chosenBranches.map(({ code, name }) => (
                  <div
                    key={code}
                    className="flex items-center gap-2 flex-wrap rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2"
                  >
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 min-w-[9rem]">
                      {name}
                    </span>
                    <input
                      type="date"
                      value={schedules[code]?.date ?? ""}
                      min={FIXED_YEAR_START}
                      max={FIXED_YEAR_END}
                      onChange={(e) => setSchedule(code, { date: e.target.value })}
                      className="h-7 rounded-lg glass-input px-2 text-[11px] text-slate-700 dark:text-slate-200"
                    />
                    <select
                      value={schedules[code]?.round ?? ""}
                      onChange={(e) => setSchedule(code, { round: e.target.value })}
                      className="h-7 rounded-lg glass-input px-2 text-[11px] text-slate-700 dark:text-slate-200"
                    >
                      <option value="">- ຮອບ -</option>
                      {rounds.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                          {r.time_label ? ` (${r.time_label})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-rose-500">{validationError ?? ""}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="h-8 px-3 rounded-lg text-xs text-slate-500 hover:text-slate-700"
                >
                  ຍົກເລີກ
                </button>
                <button
                  onClick={() => void handleConfirm()}
                  disabled={saving || !!validationError}
                  className="h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <FaSpinner className="animate-spin" size={11} />}
                  ຢືນຢັນແຍກ ({chosenBranches.length} ສາຂາ)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

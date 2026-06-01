"use client";

import { useEffect, useRef, useState } from "react";
import { FaCheck, FaSpinner, FaTimes } from "react-icons/fa";
import { approveInspection, getInspectionDetails, getInspections } from "@/services/vehicle-maintenance-api";
import type { ApprovalStatus, Inspection, InspectionDetailItem } from "@/types";

interface HistoryParams {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  version?: number;
}

interface ApprovalDialog {
  code: string;
  action: "approved" | "rejected";
  note: string;
  submitting: boolean;
  error: string;
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "critical") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
        🔴 ຜິດປົກກະຕິ
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
        🟡 ມີຈຸດບົກຜ່ອງ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
      🟢 ປົກກະຕິ
    </span>
  );
}

function ApprovalBadge({ status, approvedByName, approvedAt, note }: {
  status: ApprovalStatus;
  approvedByName?: string;
  approvedAt?: string;
  note?: string;
}) {
  if (status === "approved") {
    return (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          ✓ ອານຸມັດແລ້ວ
        </span>
        {approvedByName && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{approvedByName}</p>
        )}
        {approvedAt && (
          <p className="text-xs text-slate-400">{approvedAt}</p>
        )}
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
          ✗ ປະຕິເສດ
        </span>
        {note && (
          <p className="max-w-[140px] text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{note}</p>
        )}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
      ⏳ ລໍຖ້າ
    </span>
  );
}

function InspectDetailPopover({
  inspect_code,
  status,
}: {
  inspect_code: string;
  status: "warning" | "critical";
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<InspectionDetailItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const pinned = useRef(false);
  const fetched = useRef(false);

  function fetchOnce() {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    getInspectionDetails(inspect_code)
      .then(setDetails)
      .catch(() => setDetails([]))
      .finally(() => setLoading(false));
  }

  function openPopover() {
    if (triggerRef.current) setAnchorRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
    fetchOnce();
  }

  function handleMouseEnter() {
    hoverTimer.current = window.setTimeout(() => {
      if (!pinned.current) openPopover();
    }, 350);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (!pinned.current) setOpen(false);
  }

  function handleClick() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (open && pinned.current) {
      pinned.current = false;
      setOpen(false);
    } else {
      pinned.current = true;
      openPopover();
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node)) {
        pinned.current = false;
        setOpen(false);
      }
    }
    function onScroll() {
      pinned.current = false;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const recommendation =
    status === "critical"
      ? "ຄວນສົ່ງເຂົ້າອູ່ຊ່ອມບຳລຸງດ່ວນ, ຫ້າມນຳລົດອອກໃຊ້ງານ"
      : "ຄວນກວດສອບ ແລະ ສ້ອມແປງກ່ອນນຳໃຊ້";

  return (
    <span className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="focus:outline-none"
      >
        <StatusBadge status={status} />
      </button>

      {open && anchorRect && (
        <div
          style={{
            position: "fixed",
            top: anchorRect.top - 12,
            left: anchorRect.left + anchorRect.width / 2,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
          }}
          className="w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-slate-800"
        >
          {/* triangle arrow */}
          <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800" />

          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            ລາຍການທີ່ບໍ່ຜ່ານ
          </p>

          {loading ? (
            <div className="flex items-center gap-1.5 py-1 text-xs text-slate-400">
              <FaSpinner className="animate-spin" size={10} />
              ກຳລັງໂຫຼດ...
            </div>
          ) : details && details.length > 0 ? (
            <ul className="mb-3 space-y-1.5">
              {details.map((d, i) => (
                <li key={i} className="flex gap-1.5 text-xs">
                  <span className="shrink-0">❌</span>
                  <span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {d.item_name}
                    </span>
                    {d.status_name && (
                      <span className="text-slate-500 dark:text-slate-400">
                        : {d.status_name}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-xs text-slate-400">ບໍ່ມີລາຍລະອຽດ</p>
          )}

          <div
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              status === "critical"
                ? "bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
            }`}
          >
            ⚠ ຄຳແນະນຳ: {recommendation}
          </div>
        </div>
      )}
    </span>
  );
}

export function ChecklistHistory({ dateFrom, dateTo, search, version }: HistoryParams) {
  const [items, setItems] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ApprovalDialog | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await getInspections({ dateFrom, dateTo, search }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ໂຫຼດປະຫວັດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, search, version]);

  function openDialog(code: string, action: "approved" | "rejected") {
    setDialog({ code, action, note: "", submitting: false, error: "" });
  }

  function closeDialog() {
    setDialog(null);
  }

  async function submitApproval() {
    if (!dialog) return;
    if (dialog.action === "rejected" && !dialog.note.trim()) {
      setDialog((d) => d && { ...d, error: "ກະລຸນາລະບຸເຫດຜົນການປະຕິເສດ" });
      return;
    }
    setDialog((d) => d && { ...d, submitting: true, error: "" });
    try {
      await approveInspection(dialog.code, dialog.action, dialog.note.trim() || undefined);
      setItems((prev) =>
        prev.map((item) =>
          item.inspect_code === dialog.code
            ? { ...item, approval_status: dialog.action as ApprovalStatus, approval_note: dialog.note.trim() || undefined }
            : item
        )
      );
      setDialog(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ດຳເນີນການບໍ່ສຳເລັດ";
      setDialog((d) => d && { ...d, submitting: false, error: msg });
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              ປະຫວັດການກວດລົດ
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ສະແດງ 200 ລາຍການຫຼ້າສຸດ
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-white/5 dark:text-slate-200"
          >
            {loading ? "ກຳລັງໂຫຼດ..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="m-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            <FaSpinner className="mr-2 animate-spin" />
            ກຳລັງໂຫຼດປະຫວັດ...
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            ຍັງບໍ່ມີປະຫວັດການກວດລົດ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">ລະຫັດເອກະສານ</th>
                  <th className="px-4 py-3 text-left">ວັນທີ</th>
                  <th className="px-4 py-3 text-left">ລົດ</th>
                  <th className="px-4 py-3 text-center">ສະຖານະ</th>
                  <th className="px-4 py-3 text-right">km</th>
                  <th className="px-4 py-3 text-left">ຄົນຂັບ</th>
                  <th className="px-4 py-3 text-left">ຜູ້ກວດ</th>
                  <th className="px-4 py-3 text-center">ລາຍການ</th>
                  <th className="px-4 py-3 text-left">ໝາຍເຫດ</th>
                  <th className="px-4 py-3 text-center">ການອານຸມັດ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((item) => (
                  <tr
                    key={item.inspect_code}
                    className="hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-teal-700 dark:text-teal-400">
                      {item.inspect_code}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-200">
                      <div>{item.inspect_date}</div>
                      {item.inspect_time && (
                        <div className="text-xs text-slate-400">{item.inspect_time}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {item.vehicle_code}
                      </p>
                      {item.vehicle_name && (
                        <p className="text-xs text-slate-500">{item.vehicle_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.overall_status === "critical" || item.overall_status === "warning" ? (
                        <InspectDetailPopover
                          inspect_code={item.inspect_code}
                          status={item.overall_status}
                        />
                      ) : (
                        <StatusBadge status={item.overall_status} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                      {item.odometer != null
                        ? Number(item.odometer).toLocaleString("en-US")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {item.driver_code ? (
                        <div>
                          <div>{item.driver_name || item.driver_code}</div>
                          {item.driver_name && (
                            <div className="text-xs text-slate-400">{item.driver_code}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      <div>{item.employee_name || item.employee_code}</div>
                      {item.employee_name && (
                        <div className="text-xs text-slate-400">{item.employee_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                        {item.detail_count ?? 0} ລາຍການ
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-600 dark:text-slate-300">
                      {item.note || "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <ApprovalBadge
                          status={item.approval_status ?? "pending"}
                          approvedByName={item.approved_by_name}
                          approvedAt={item.approved_at}
                          note={item.approval_note}
                        />
                        {(item.approval_status ?? "pending") === "pending" && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openDialog(item.inspect_code, "approved")}
                              title="ອານຸມັດ"
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
                            >
                              <FaCheck size={9} />
                              ອານຸມັດ
                            </button>
                            <button
                              type="button"
                              onClick={() => openDialog(item.inspect_code, "rejected")}
                              title="ປະຕິເສດ"
                              className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
                            >
                              <FaTimes size={9} />
                              ປະຕິເສດ
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval / Rejection dialog */}
      {dialog && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-1 text-base font-bold text-slate-900 dark:text-white">
              {dialog.action === "approved" ? "✅ ຢືນຢັນການອານຸມັດ" : "❌ ຢືນຢັນການປະຕິເສດ"}
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              ລາຍການ: <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">{dialog.code}</span>
            </p>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {dialog.action === "rejected" ? "ເຫດຜົນການປະຕິເສດ *" : "ໝາຍເຫດ (ຖ້າມີ)"}
              </span>
              <textarea
                value={dialog.note}
                onChange={(e) => setDialog((d) => d && { ...d, note: e.target.value, error: "" })}
                rows={3}
                placeholder={dialog.action === "rejected" ? "ລະບຸເຫດຜົນ..." : "ໝາຍເຫດເພີ່ມເຕີມ..."}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            {dialog.error && (
              <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {dialog.error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={dialog.submitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={() => void submitApproval()}
                disabled={dialog.submitting}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60 ${
                  dialog.action === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {dialog.submitting && <FaSpinner className="animate-spin" size={12} />}
                {dialog.action === "approved" ? "ອານຸມັດ" : "ປະຕິເສດ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

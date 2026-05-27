"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FaCheck, FaSpinner } from "react-icons/fa";
import {
  createInspection,
  getInspectMeta,
  searchInspectionOptions,
} from "@/services/vehicle-maintenance-api";
import type {
  EmployeeOption,
  InspectItem,
  InspectionOptionType,
  InspectStatus,
  VehicleOption,
} from "@/types";

interface DailyChecklistFormProps {
  onSubmitted?: () => void;
}

type LookupOption = VehicleOption | EmployeeOption;

function optionKey(option: LookupOption): string {
  return "id" in option ? option.id : option.code;
}

function optionLabel(option: LookupOption): string {
  return `${option.code}${option.name ? ` - ${option.name}` : ""}`;
}

function AsyncOptionSelect({
  type,
  label,
  placeholder,
  value,
  onChange,
}: {
  type: InspectionOptionType;
  label: string;
  placeholder: string;
  value: LookupOption | null;
  onChange: (value: LookupOption | null) => void;
}) {
  const [query, setQuery] = useState(value ? optionLabel(value) : "");
  const [items, setItems] = useState<LookupOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (value) setQuery(optionLabel(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchInspectionOptions(type, query)
        .then((data) => {
          if (requestId.current === currentRequest) setItems(data);
        })
        .catch(() => {
          if (requestId.current === currentRequest) setItems([]);
        })
        .finally(() => {
          if (requestId.current === currentRequest) setLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, type]);

  return (
    <label className="relative block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
      />
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-500">ກຳລັງຄົ້ນຫາ...</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">ບໍ່ພົບຂໍ້ມູນ</div>
          ) : (
            items.map((item) => (
              <button
                key={`${type}-${optionKey(item)}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item);
                  setQuery(optionLabel(item));
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-teal-50 dark:text-slate-200 dark:hover:bg-white/10"
              >
                {optionLabel(item)}
              </button>
            ))
          )}
        </div>
      )}
    </label>
  );
}

function statusButtonClass(selected: boolean, index: number): string {
  if (!selected) {
    return "rounded-lg px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-white/10 transition";
  }
  const colors = [
    "bg-emerald-600 text-white border border-emerald-600",
    "bg-rose-600 text-white border border-rose-600",
    "bg-amber-500 text-white border border-amber-500",
    "bg-sky-600 text-white border border-sky-600",
    "bg-purple-600 text-white border border-purple-600",
    "bg-orange-600 text-white border border-orange-600",
  ];
  return `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${colors[index % colors.length]}`;
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

export function DailyChecklistForm({ onSubmitted }: DailyChecklistFormProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<EmployeeOption | null>(null);
  const [inspectDate, setInspectDate] = useState(todayDate());
  const [inspectTime, setInspectTime] = useState(nowTime());
  const [odometer, setOdometer] = useState("");
  const [note, setNote] = useState("");

  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [items, setItems] = useState<InspectItem[]>([]);
  const [statuses, setStatuses] = useState<InspectStatus[]>([]);

  // Map item_code -> status_code (default to first status when loaded)
  const [statusMap, setStatusMap] = useState<Record<string, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMetaLoading(true);
    setMetaError(null);
    getInspectMeta()
      .then(({ items: fetchedItems, statuses: fetchedStatuses }) => {
        setItems(fetchedItems);
        setStatuses(fetchedStatuses);
        if (fetchedStatuses.length > 0) {
          const defaultCode = fetchedStatuses[0].status_code;
          const initial: Record<string, number> = {};
          for (const item of fetchedItems) {
            initial[item.item_code] = defaultCode;
          }
          setStatusMap(initial);
        }
      })
      .catch((err) => {
        setMetaError(err instanceof Error ? err.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      })
      .finally(() => setMetaLoading(false));
  }, []);

  function setItemStatus(item_code: string, status_code: number) {
    setStatusMap((prev) => ({ ...prev, [item_code]: status_code }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedVehicle) {
      setError("ກະລຸນາເລືອກລົດ");
      return;
    }
    if (!selectedEmployee) {
      setError("ກະລຸນາເລືອກຜູ້ກວດ");
      return;
    }
    if (items.length > 0 && Object.keys(statusMap).length === 0) {
      setError("ກະລຸນາເລືອກສະຖານະຂອງລາຍການກວດ");
      return;
    }

    const details = items.map((item) => ({
      item_code: item.item_code,
      status_code: statusMap[item.item_code] ?? statuses[0]?.status_code ?? 0,
    }));

    setSubmitting(true);
    try {
      await createInspection({
        vehicle_code: selectedVehicle.code,
        inspect_date: inspectDate,
        inspect_time: inspectTime || undefined,
        driver_code: selectedDriver?.code || undefined,
        employee_code: selectedEmployee.code,
        odometer: odometer ? Math.trunc(Number(odometer)) : undefined,
        note: note.trim() || undefined,
        details,
      });

      setMessage("ບັນທຶກການກວດເຊັກສຳເລັດ");
      setSelectedVehicle(null);
      setSelectedEmployee(null);
      setSelectedDriver(null);
      setInspectDate(todayDate());
      setInspectTime(nowTime());
      setOdometer("");
      setNote("");

      if (statuses.length > 0) {
        const defaultCode = statuses[0].status_code;
        const reset: Record<string, number> = {};
        for (const item of items) reset[item.item_code] = defaultCode;
        setStatusMap(reset);
      }

      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
            ວັນທີກວດ
          </span>
          <input
            type="date"
            value={inspectDate}
            onChange={(e) => setInspectDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
            ເວລາກວດ
          </span>
          <input
            type="time"
            value={inspectTime}
            onChange={(e) => setInspectTime(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <AsyncOptionSelect
          type="vehicle"
          label="ເລືອກລົດ *"
          placeholder="ພິມລະຫັດ ຫຼື ຊື່ລົດ"
          value={selectedVehicle}
          onChange={(item) => setSelectedVehicle(item as VehicleOption | null)}
        />

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
            ເລກໄມລ໌ (ກມ)
          </span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder="ເຊັ່ນ 125000"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <AsyncOptionSelect
          type="driver"
          label="ຄົນຂັບ"
          placeholder="ພິມລະຫັດ ຫຼື ຊື່ຄົນຂັບ"
          value={selectedDriver}
          onChange={(item) => setSelectedDriver(item as EmployeeOption | null)}
        />

        <AsyncOptionSelect
          type="employee"
          label="ຜູ້ກວດ *"
          placeholder="ພິມລະຫັດ ຫຼື ຊື່ຜູ້ກວດ"
          value={selectedEmployee}
          onChange={(item) => setSelectedEmployee(item as EmployeeOption | null)}
        />
      </div>

      {/* Checklist items */}
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          ລາຍການກວດເຊັກ
        </h4>

        {metaLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <FaSpinner className="mr-2 animate-spin" />
            ກຳລັງໂຫຼດລາຍການ...
          </div>
        ) : metaError ? (
          <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {metaError}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            ບໍ່ມີລາຍການກວດໃນລະບົບ
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 w-8">
                    #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                    ລາຍການ
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                    ສະຖານະ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {items.map((item, idx) => (
                  <tr
                    key={item.item_code}
                    className="hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {item.item_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {statuses.map((status, si) => (
                          <button
                            key={status.status_code}
                            type="button"
                            onClick={() =>
                              setItemStatus(item.item_code, status.status_code)
                            }
                            className={statusButtonClass(
                              statusMap[item.item_code] === status.status_code,
                              si
                            )}
                          >
                            {status.status_name}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note */}
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          ໝາຍເຫດ
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="ລາຍລະອຽດເພີ່ມເຕີມ..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      {message && (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || metaLoading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? <FaSpinner className="animate-spin" /> : <FaCheck />}
        {submitting ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກການກວດເຊັກ"}
      </button>
    </form>
  );
}

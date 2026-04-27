"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCamera,
  FaCheck,
  FaChevronDown,
  FaGasPump,
  FaMoneyBillWave,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUserTie,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";

interface Option {
  code: string;
  name_1: string;
}

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  options: Option[];
  onChange: (code: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus the search input on open so the user can immediately type.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.code === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.code} ${o.name_1}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-full glass-input rounded-lg px-3 py-2 text-xs text-left text-slate-700 dark:text-slate-200 flex items-center justify-between disabled:opacity-50"
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected
            ? `${selected.code}${selected.name_1 ? ` · ${selected.name_1}` : ""}`
            : placeholder}
        </span>
        <span className="flex items-center gap-1.5">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-slate-400 hover:text-rose-500"
              aria-label="ລ້າງ"
            >
              <FaTimes size={10} />
            </span>
          )}
          <FaChevronDown
            size={10}
            className={`text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full glass rounded-lg shadow-lg overflow-hidden border border-slate-200/30 dark:border-white/5">
          <div className="p-2 border-b border-slate-200/30 dark:border-white/5">
            <div className="relative">
              <FaSearch
                size={10}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ຄົ້ນຫາ..."
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md glass-input text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                ບໍ່ພົບ
              </div>
            ) : (
              filtered.map((o) => {
                const isSel = o.code === value;
                return (
                  <button
                    type="button"
                    key={o.code}
                    onClick={() => {
                      onChange(o.code);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/30 dark:hover:bg-white/5 transition-colors ${
                      isSel
                        ? "bg-orange-500/10 text-orange-700 dark:text-orange-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <span className="truncate">
                      <span className="font-semibold">{o.code}</span>
                      {o.name_1 && (
                        <span className="text-slate-500 dark:text-slate-400">
                          {" "}· {o.name_1}
                        </span>
                      )}
                    </span>
                    {isSel && <FaCheck size={10} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FuelEntryDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [cars, setCars] = useState<Option[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(false);

  const [fuelDate, setFuelDate] = useState(getFixedTodayDate());
  const [driverCode, setDriverCode] = useState("");
  const [carCode, setCarCode] = useState("");
  const [liters, setLiters] = useState("");
  const [amount, setAmount] = useState("");
  const [odometer, setOdometer] = useState("");
  const [station, setStation] = useState("");
  const [note, setNote] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingMaster(true);
    Promise.all([Actions.getDrivers(), Actions.getCars()])
      .then(([d, c]) => {
        setDrivers((d as Option[]) ?? []);
        setCars((c as Option[]) ?? []);
      })
      .catch(console.error)
      .finally(() => setLoadingMaster(false));
  }, [open]);

  const reset = () => {
    setFuelDate(getFixedTodayDate());
    setDriverCode("");
    setCarCode("");
    setLiters("");
    setAmount("");
    setOdometer("");
    setStation("");
    setNote("");
    setImageData(null);
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("ຮູບໃຫຍ່ເກີນໄປ (>5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => setError("ບໍ່ສາມາດອ່ານຮູບ");
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const litersN = Number(liters);
    const amountN = Number(amount);
    if (!Number.isFinite(litersN) || litersN <= 0) {
      setError("ກະລຸນາໃສ່ຈຳນວນລິດ");
      return;
    }
    if (!Number.isFinite(amountN) || amountN <= 0) {
      setError("ກະລຸນາໃສ່ຈຳນວນເງິນ");
      return;
    }

    const driver = drivers.find((d) => d.code === driverCode);

    setSubmitting(true);
    try {
      await Actions.saveFuelRefill({
        fuel_date: fuelDate,
        user_code: driverCode || undefined,
        driver_name: driver?.name_1 || undefined,
        car: carCode || undefined,
        liters: litersN,
        amount: amountN,
        odometer: odometer ? Number(odometer) : undefined,
        station: station.trim() || undefined,
        note: note.trim() || undefined,
        image_data: imageData ?? undefined,
      });
      reset();
      onClose();
      onSaved();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={close}
    >
      <div
        className="glass rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between bg-white/30 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <FaGasPump size={14} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              ບັນທຶກເຕີມນ້ຳມັນ
            </h3>
          </div>
          <button
            onClick={close}
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
            disabled={submitting}
          >
            <FaTimes size={12} />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                ວັນທີ
              </label>
              <input
                type="date"
                value={fuelDate}
                onChange={(e) => setFuelDate(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                <FaUserTie className="inline mr-1.5 text-slate-400" size={11} />
                ຄົນຂັບ
              </label>
              <SearchableSelect
                value={driverCode}
                options={drivers}
                onChange={setDriverCode}
                placeholder="-- ເລືອກ --"
                disabled={loadingMaster}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaTruck className="inline mr-1.5 text-slate-400" size={11} /> ລົດ
            </label>
            <SearchableSelect
              value={carCode}
              options={cars}
              onChange={setCarCode}
              placeholder="-- ເລືອກ --"
              disabled={loadingMaster}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                <FaGasPump className="inline mr-1.5 text-amber-500" size={11} />
                ຈຳນວນລິດ <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                <FaMoneyBillWave
                  className="inline mr-1.5 text-emerald-500"
                  size={11}
                />
                ຈຳນວນເງິນ <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200"
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                ໄມລ (odometer)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                placeholder="-"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                ສະຖານີ
              </label>
              <input
                type="text"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                placeholder="ປໍ້າ..."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              ໝາຍເຫດ
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 resize-none"
              placeholder="..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              ຮູບ
            </label>
            {imageData ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageData}
                  alt="ຮູບເຕີມນ້ຳມັນ"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setImageData(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                >
                  <FaTrash size={11} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300/50 dark:border-white/10 rounded-lg cursor-pointer hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                <FaCamera className="text-slate-400 mb-1" size={20} />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ກົດເພື່ອເລືອກຮູບ
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    onPickFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}
        </form>

        <div className="px-5 py-3 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            ຍົກເລີກ
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting ? (
              <>
                <FaSpinner className="animate-spin" size={11} /> ກຳລັງບັນທຶກ...
              </>
            ) : (
              "ບັນທຶກ"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

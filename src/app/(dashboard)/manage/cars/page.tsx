"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBroadcastTower,
  FaCheckCircle,
  FaChevronDown,
  FaEdit,
  FaExclamationTriangle,
  FaIdCard,
  FaPlus,
  FaSatelliteDish,
  FaSave,
  FaSearch,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUser,
  FaUsers,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
// Ported from server actions: addCarProfile, deleteCarProfile, getCarProfiles, getDispatchDrivers, getDispatchWorkers, updateCarProfile

// ==================== Types ====================

interface Option {
  code: string;
  name_1: string;
}

interface CarProfile {
  code: string;
  name_1: string;
  imei: string;
  drivers: Option[];
  workers: Option[];
}

interface CarForm {
  code: string;
  name_1: string;
  imei: string;
  driverCodes: string[];
  workerCodes: string[];
}

type DirectoryFilter = "all" | "ready" | "attention" | "gps";

const emptyForm: CarForm = {
  code: "",
  name_1: "",
  imei: "",
  driverCodes: [],
  workerCodes: [],
};

// ==================== Helpers ====================

function getCarStatus(car: CarProfile) {
  if (car.drivers.length > 0 && car.workers.length > 0) {
    return {
      label: "ພ້ອມໃຊ້",
      tone: "emerald" as const,
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (car.drivers.length === 0 && car.workers.length === 0) {
    return {
      label: "ຍັງບໍ່ຄົບ",
      tone: "rose" as const,
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  }
  if (car.drivers.length === 0) {
    return {
      label: "ຂາດຄົນຂັບ",
      tone: "amber" as const,
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  return {
    label: "ຂາດກຳມະກອນ",
    tone: "orange" as const,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  };
}

// ==================== UI pieces ====================

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "teal" | "emerald" | "amber" | "sky";
}) {
  const palette = {
    sky: "from-sky-500/20 to-cyan-500/20 ring-sky-300/30 text-sky-100",
    emerald: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
    amber: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    teal: "from-teal-500/20 to-teal-400/20 ring-teal-300/30 text-teal-100",
  }[color];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${palette} backdrop-blur border border-white/10 px-3 py-1.5 ring-1 text-[11px]`}
    >
      <span className="opacity-80">{label}</span>
      <span className="font-bold text-white tabular-nums">{value}</span>
    </div>
  );
}

function AssignmentBadges({
  items,
  emptyLabel,
  tone,
}: {
  items: Option[];
  emptyLabel: string;
  tone: "sky" | "emerald";
}) {
  const toneClass =
    tone === "sky"
      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  if (items.length === 0) {
    return <span className="text-slate-400 text-[11px]">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.code}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass}`}
        >
          {item.name_1}
        </span>
      ))}
    </div>
  );
}

function SearchableMultiSelectField({
  label,
  icon,
  placeholder,
  allOptions,
  availableOptions,
  selectedCodes,
  onChange,
  emptyText,
  helperText,
  accent = "sky",
}: {
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  allOptions: Option[];
  availableOptions: Option[];
  selectedCodes: string[];
  onChange: (nextValue: string[]) => void;
  emptyText: string;
  helperText?: string;
  accent?: "sky" | "emerald";
}) {
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectedOptions = selectedCodes
    .map((code) => allOptions.find((item) => item.code === code))
    .filter((item): item is Option => Boolean(item));

  const keyword = searchText.trim().toLowerCase();
  const filteredOptions = availableOptions.filter((item) => {
    if (selectedCodes.includes(item.code)) return false;
    if (!keyword) return true;
    return (
      item.name_1.toLowerCase().includes(keyword) ||
      item.code.toLowerCase().includes(keyword)
    );
  });

  const accentClasses = {
    sky: { chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400", iconBg: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
    emerald: { chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  }[accent];

  return (
    <div className="glass rounded-lg p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${accentClasses.iconBg}`}>
            {icon}
          </span>
          {label}
        </label>
        <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
          {selectedOptions.length} ເລືອກ
        </span>
      </div>

      <div ref={dropdownRef} className="relative mt-2.5">
        <FaSearch className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs text-slate-300" />
        <input
          type="text"
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="glass-input h-10 w-full rounded-lg pl-9 pr-10 text-sm"
        />
        <button
          type="button"
          onClick={() => setShowDropdown((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <FaChevronDown className={`text-xs transition-transform ${showDropdown ? "rotate-180" : ""}`} />
        </button>

        {showDropdown && (
          <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-lg glass p-1 shadow-xl">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    onChange([...selectedCodes, item.code]);
                    setSearchText("");
                    setShowDropdown(true);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 dark:text-slate-200 transition-colors hover:bg-white/30 dark:hover:bg-white/5"
                >
                  <span className="font-medium truncate">{item.name_1}</span>
                  <span className="ml-2 shrink-0 text-[11px] text-slate-400">{item.code}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-center text-sm text-slate-400">{emptyText}</div>
            )}
          </div>
        )}
      </div>

      {selectedOptions.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {selectedOptions.map((item) => (
            <span
              key={item.code}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${accentClasses.chip}`}
            >
              <span>{item.name_1}</span>
              <button
                type="button"
                onClick={() =>
                  onChange(selectedCodes.filter((selectedCode) => selectedCode !== item.code))
                }
                className="text-slate-400 hover:text-rose-500 transition-colors"
              >
                <FaTimes className="text-[10px]" />
              </button>
            </span>
          ))}
        </div>
      ) : helperText ? (
        <p className="mt-2.5 text-[11px] text-slate-400">{helperText}</p>
      ) : null}
    </div>
  );
}

// ==================== Main Page ====================

export default function CarsManagePage() {
  const confirm = useConfirm();
  const [cars, setCars] = useState<CarProfile[]>([]);
  const [driverOptions, setDriverOptions] = useState<Option[]>([]);
  const [workerOptions, setWorkerOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<CarForm>(emptyForm);
  const [searchText, setSearchText] = useState("");
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryFilter>("all");

  const refreshData = async () => {
    setLoading(true);
    try {
      const [carsData, driversData, workersData] = await Promise.all([
        Actions.getCarProfiles(),
        Actions.getDispatchDrivers(),
        Actions.getDispatchWorkers(),
      ]);
      setCars(carsData as CarProfile[]);
      setDriverOptions(driversData as Option[]);
      setWorkerOptions(workersData as Option[]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingCode(null);
    setShowForm(false);
  };

  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [carsData, driversData, workersData] = await Promise.all([
          Actions.getCarProfiles(),
          Actions.getDispatchDrivers(),
          Actions.getDispatchWorkers(),
        ]);
        if (cancelled) return;
        setCars(carsData as CarProfile[]);
        setDriverOptions(driversData as Option[]);
        setWorkerOptions(workersData as Option[]);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetForm();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showForm]);

  const handleDriverChange = (driverCodes: string[]) => {
    setForm((current) => ({
      ...current,
      driverCodes,
      workerCodes: current.workerCodes.filter((workerCode) => !driverCodes.includes(workerCode)),
    }));
  };

  const handleWorkerChange = (workerCodes: string[]) => {
    setForm((current) => ({ ...current, workerCodes }));
  };

  const handleAddMode = () => {
    setEditingCode(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleEditMode = (car: CarProfile) => {
    setEditingCode(car.code);
    setForm({
      code: car.code,
      name_1: car.name_1,
      imei: car.imei ?? "",
      driverCodes: car.drivers.map((item) => item.code),
      workerCodes: car.workers
        .map((item) => item.code)
        .filter((workerCode) => !car.drivers.some((driver) => driver.code === workerCode)),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name_1.trim()) {
      void confirm({ title: "ຂໍ້ມູນບໍ່ຄົບ", message: "ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ລົດໃຫ້ຄົບ", tone: "warning", single: true });
      return;
    }
    setSaving(true);
    try {
      if (editingCode) {
        await Actions.updateCarProfile({
          code: form.code.trim(),
          name_1: form.name_1.trim(),
          imei: form.imei.trim(),
          driverCodes: form.driverCodes,
          workerCodes: form.workerCodes,
        });
      } else {
        await Actions.addCarProfile({
          code: form.code.trim(),
          name_1: form.name_1.trim(),
          imei: form.imei.trim(),
          driverCodes: form.driverCodes,
          workerCodes: form.workerCodes,
        });
      }
      resetForm();
      await refreshData();
    } catch (error) {
      console.error(error);
      void confirm({ title: "ຜິດພາດ", message: error instanceof Error ? error.message : "ບັນທຶກຂໍ້ມູນບໍ່ສຳເລັດ", tone: "warning", single: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!await confirm({ title: "ລຶບລົດ", message: "ຕ້ອງການລຶບລົດນີ້ແທ້ບໍ່?", tone: "danger", confirmLabel: "ລຶບ" })) return;
    try {
      await Actions.deleteCarProfile(code);
      await refreshData();
    } catch (error) {
      console.error(error);
      void confirm({ title: "ຜິດພາດ", message: "ລຶບຂໍ້ມູນບໍ່ສຳເລັດ", tone: "warning", single: true });
    }
  };

  const filteredDriverOptions = useMemo(
    () => driverOptions.filter((item) => !form.workerCodes.includes(item.code)),
    [driverOptions, form.workerCodes]
  );
  const filteredWorkerOptions = useMemo(
    () => workerOptions.filter((item) => !form.driverCodes.includes(item.code)),
    [workerOptions, form.driverCodes]
  );

  const stats = useMemo(() => {
    const totalCars = cars.length;
    const readyCars = cars.filter((c) => c.drivers.length > 0 && c.workers.length > 0).length;
    const attentionCars = cars.filter((c) => c.drivers.length === 0 || c.workers.length === 0).length;
    const gpsCars = cars.filter((c) => c.imei.trim().length > 0).length;
    return { totalCars, readyCars, attentionCars, gpsCars };
  }, [cars]);

  const filterCounts = {
    all: stats.totalCars,
    ready: stats.readyCars,
    attention: stats.attentionCars,
    gps: stats.gpsCars,
  };

  const keyword = searchText.trim().toLowerCase();
  const visibleCars = cars.filter((car) => {
    const passesDirectoryFilter =
      directoryFilter === "all"
        ? true
        : directoryFilter === "ready"
          ? car.drivers.length > 0 && car.workers.length > 0
          : directoryFilter === "gps"
            ? car.imei.trim().length > 0
            : car.drivers.length === 0 || car.workers.length === 0;
    if (!passesDirectoryFilter) return false;
    if (!keyword) return true;
    const pool = [
      car.code,
      car.name_1,
      car.imei,
      ...car.drivers.map((d) => d.name_1),
      ...car.drivers.map((d) => d.code),
      ...car.workers.map((w) => w.name_1),
      ...car.workers.map((w) => w.code),
    ]
      .join(" ")
      .toLowerCase();
    return pool.includes(keyword);
  });

  const selectedDrivers = form.driverCodes
    .map((code) => driverOptions.find((item) => item.code === code))
    .filter((item): item is Option => Boolean(item));
  const selectedWorkers = form.workerCodes
    .map((code) => workerOptions.find((item) => item.code === code))
    .filter((item): item is Option => Boolean(item));
  const selectionReady =
    selectedDrivers.length > 0 &&
    selectedWorkers.length > 0 &&
    form.code.trim().length > 0 &&
    form.name_1.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* ========== HERO ========== */}
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 sm:p-6 shadow-xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 10%, #38bdf8 0%, transparent 35%), radial-gradient(circle at 90% 80%, #a78bfa 0%, transparent 35%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <FaTruck className="text-sky-300" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                  Fleet Directory
                </p>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">ຈັດການລົດ ແລະ ຊຸດປະຈຳລົດ</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ກຳນົດຂໍ້ມູນລົດ, ຄົນຂັບ, ກຳມະກອນ ແລະ GPS ຕິດລົດ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatBadge label="ລົດທັງໝົດ" value={stats.totalCars} color="sky" />
            <StatBadge label="ພ້ອມໃຊ້" value={stats.readyCars} color="emerald" />
            <StatBadge label="ຕ້ອງກວດ" value={stats.attentionCars} color="amber" />
            <StatBadge label="ມີ GPS" value={`${stats.gpsCars}/${stats.totalCars}`} color="sky" />
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 px-3 py-2 text-[11px] font-semibold text-white transition-all disabled:opacity-60"
            >
              <FaSyncAlt className={loading ? "animate-spin" : ""} size={11} />
              ຣີເຟຣຊ
            </button>
            <button
              type="button"
              onClick={handleAddMode}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 transition-all"
            >
              <FaPlus size={11} /> ເພີ່ມລົດ
            </button>
          </div>
        </div>
      </div>

      {/* ========== SEARCH + FILTER ========== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="ຄົ້ນຫາລົດ, ທະບຽນ, IMEI, ຄົນຂັບ, ກຳມະກອນ..."
            className="glass-input w-full pl-9 pr-9 py-2.5 rounded-lg text-sm"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label="Clear"
            >
              <FaTimes size={10} />
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg glass p-1">
          {([
            { key: "all" as const, label: "ທັງໝົດ" },
            { key: "ready" as const, label: "ພ້ອມໃຊ້" },
            { key: "attention" as const, label: "ຕ້ອງກວດ" },
            { key: "gps" as const, label: "ມີ GPS" },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setDirectoryFilter(opt.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                directoryFilter === opt.key ? "glass-heavy glow-primary text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {opt.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                  directoryFilter === opt.key ? "bg-teal-500/20 text-teal-600 dark:text-teal-400" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                }`}
              >
                {filterCounts[opt.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ========== LIST ========== */}
      {loading ? (
        <div className="flex items-center justify-center py-16 rounded-lg glass">
          <p className="text-sm text-slate-400 dark:text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນລົດ...</p>
        </div>
      ) : visibleCars.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <div className="w-14 h-14 rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
            <FaTruck className="text-slate-300 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ບໍ່ພົບລາຍການລົດ</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ລອງປ່ຽນຄຳຄົ້ນຫາ ຫຼື filter ອີກຄັ້ງ</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {visibleCars.map((car) => {
              const status = getCarStatus(car);
              return (
                <article
                  key={car.code}
                  className="glass rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                        {car.code}
                      </p>
                      <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white truncate">{car.name_1}</h3>
                      {car.imei && (
                        <p className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-sky-700">
                          <FaSatelliteDish size={9} />
                          {car.imei}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div>
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                        ຄົນຂັບ
                      </p>
                      <AssignmentBadges items={car.drivers} emptyLabel="ຍັງບໍ່ມີຄົນຂັບ" tone="sky" />
                    </div>
                    <div>
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                        ກຳມະກອນຕິດລົດ
                      </p>
                      <AssignmentBadges items={car.workers} emptyLabel="ຍັງບໍ່ມີກຳມະກອນ" tone="emerald" />
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditMode(car)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-700 transition-colors"
                    >
                      <FaEdit size={10} /> ແກ້ໄຂ
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(car.code)}
                      className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 py-2 text-rose-600 hover:bg-rose-50 transition-colors"
                      title="ລຶບ"
                    >
                      <FaTrash size={11} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-hidden rounded-lg glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Car Directory</p>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍການລົດ</h2>
              </div>
              <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                {visibleCars.length} / {stats.totalCars}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2.5 text-left">ສະຖານະ</th>
                    <th className="px-4 py-2.5 text-left">ລົດ</th>
                    <th className="px-4 py-2.5 text-left">GPS / IMEI</th>
                    <th className="px-4 py-2.5 text-left">ຄົນຂັບ</th>
                    <th className="px-4 py-2.5 text-left">ກຳມະກອນຕິດລົດ</th>
                    <th className="px-4 py-2.5 text-right">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                  {visibleCars.map((car) => {
                    const status = getCarStatus(car);
                    return (
                      <tr key={car.code} className="align-top hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                              <FaTruck size={12} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">{car.name_1}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{car.code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {car.imei ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                                <FaSatelliteDish size={9} /> ມີ GPS
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">{car.imei}</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              <FaSatelliteDish size={9} /> ບໍ່ມີ GPS
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <AssignmentBadges items={car.drivers} emptyLabel="ຍັງບໍ່ມີຄົນຂັບ" tone="sky" />
                        </td>
                        <td className="px-4 py-3">
                          <AssignmentBadges items={car.workers} emptyLabel="ຍັງບໍ່ມີກຳມະກອນ" tone="emerald" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditMode(car)}
                              className="inline-flex items-center gap-1.5 rounded-lg glass px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
                            >
                              <FaEdit size={10} /> ແກ້ໄຂ
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(car.code)}
                              className="inline-flex items-center rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 transition-colors"
                              title="ລຶບ"
                            >
                              <FaTrash size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========== MODAL ========== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Close form"
            onClick={resetForm}
            onKeyDown={(e) => e.key === "Enter" && resetForm()}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm cursor-pointer"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="car-form-title"
            className="relative w-full max-w-5xl overflow-hidden rounded-lg glass-heavy shadow-2xl flex flex-col max-h-[92vh]"
          >
            {/* Modal header */}
            <div className="relative bg-[#0b1b18] px-5 py-4 text-white">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 10% 10%, #38bdf8 0%, transparent 40%), radial-gradient(circle at 90% 60%, #a78bfa 0%, transparent 40%)",
                }}
              />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
                    <FaTruck className="text-sky-300 text-lg" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                      Car Profile
                    </p>
                    <h2 id="car-form-title" className="mt-0.5 text-lg font-bold text-white">
                      {editingCode ? "ແກ້ໄຂຂໍ້ມູນລົດ" : "ເພີ່ມລົດໃໝ່"}
                    </h2>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      ກຳນົດລາຍລະອຽດລົດ ແລະ ຜູກຄົນຂັບ/ກຳມະກອນ
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="shrink-0 rounded-lg bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <FaTimes size={14} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto">
              <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="glass rounded-lg p-3.5">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <span className="w-6 h-6 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center">
                          <FaTruck size={10} />
                        </span>
                        ລະຫັດລົດ
                      </label>
                      <input
                        type="text"
                        value={form.code}
                        readOnly={Boolean(editingCode)}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, code: event.target.value }))
                        }
                        className="glass-input mt-2.5 h-10 w-full rounded-lg px-3 text-sm read-only:cursor-not-allowed read-only:opacity-60"
                      />
                    </div>
                    <div className="glass rounded-lg p-3.5">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <span className="w-6 h-6 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center">
                          <FaIdCard size={10} />
                        </span>
                        ຊື່ / ທະບຽນລົດ
                      </label>
                      <input
                        type="text"
                        value={form.name_1}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name_1: event.target.value }))
                        }
                        className="glass-input mt-2.5 h-10 w-full rounded-lg px-3 text-sm"
                      />
                    </div>
                  </div>

                  <div className="glass rounded-lg p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <span className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                          <FaBroadcastTower size={10} />
                        </span>
                        IMEI / GPS Tracker
                      </label>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          form.imei.trim()
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                            : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {form.imei.trim() ? "ມີ GPS" : "ຍັງບໍ່ມີ GPS"}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={form.imei}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, imei: event.target.value }))
                      }
                      placeholder="ເຊັ່ນ 860123456789012"
                      inputMode="numeric"
                      className="glass-input mt-2.5 h-10 w-full rounded-lg px-3 font-mono text-sm"
                    />
                    <p className="mt-2 text-[11px] text-slate-400">ປ່ອຍວ່າງຖ້າລົດຄັນນີ້ຍັງບໍ່ຕິດ GPS</p>
                  </div>

                  <SearchableMultiSelectField
                    label="ຄົນຂັບປະຈຳລົດ"
                    icon={<FaUser size={10} />}
                    placeholder="ຄົ້ນຫາຄົນຂັບ..."
                    allOptions={driverOptions}
                    availableOptions={filteredDriverOptions}
                    selectedCodes={form.driverCodes}
                    onChange={handleDriverChange}
                    emptyText="ບໍ່ພົບຂໍ້ມູນຄົນຂັບ"
                    helperText="ເລືອກໄດ້ຫຼາຍຄົນ"
                    accent="sky"
                  />

                  <SearchableMultiSelectField
                    label="ກຳມະກອນຕິດລົດ"
                    icon={<FaUsers size={10} />}
                    placeholder="ຄົ້ນຫາກຳມະກອນ..."
                    allOptions={workerOptions}
                    availableOptions={filteredWorkerOptions}
                    selectedCodes={form.workerCodes}
                    onChange={handleWorkerChange}
                    emptyText="ບໍ່ພົບຂໍ້ມູນກຳມະກອນ"
                    helperText="ຖ້າເລືອກເປັນຄົນຂັບແລ້ວ ຈະບໍ່ສະແດງໃນລາຍການນີ້"
                    accent="emerald"
                  />
                </div>

                {/* Summary panel */}
                <aside className="space-y-3">
                  <div className="glass rounded-lg p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Assignment Snapshot
                        </p>
                        <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">ສະຫຼຸບກ່ອນບັນທຶກ</h3>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          selectionReady
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {selectionReady ? <FaCheckCircle size={9} /> : <FaExclamationTriangle size={9} />}
                        {selectionReady ? "ພ້ອມ" : "ກວດ"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-white/30 dark:bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">ຄົນຂັບ</p>
                        <p className="mt-0.5 text-lg font-bold text-sky-600 tabular-nums">{selectedDrivers.length}</p>
                      </div>
                      <div className="rounded-lg bg-white/30 dark:bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">ກຳມະກອນ</p>
                        <p className="mt-0.5 text-lg font-bold text-emerald-600 tabular-nums">{selectedWorkers.length}</p>
                      </div>
                      <div className="rounded-lg bg-white/30 dark:bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">GPS</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums">
                          {form.imei.trim() ? (
                            <span className="text-sky-600">✓</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-lg p-3.5">
                    <p className="text-xs font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-1.5">
                      <FaUser size={10} className="text-sky-500" />
                      ຄົນຂັບທີ່ເລືອກ
                    </p>
                    <AssignmentBadges
                      items={selectedDrivers}
                      emptyLabel="ຍັງບໍ່ໄດ້ເລືອກຄົນຂັບ"
                      tone="sky"
                    />
                  </div>

                  <div className="glass rounded-lg p-3.5">
                    <p className="text-xs font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-1.5">
                      <FaUsers size={10} className="text-emerald-500" />
                      ກຳມະກອນຕິດລົດ
                    </p>
                    <AssignmentBadges
                      items={selectedWorkers}
                      emptyLabel="ຍັງບໍ່ໄດ້ເລືອກກຳມະກອນ"
                      tone="emerald"
                    />
                  </div>
                </aside>
              </div>
            </div>

            {/* Modal footer */}
            <div className="shrink-0 flex items-center justify-end gap-2 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 px-5 py-3">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="glass rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                <FaSave size={11} />
                {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກ"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

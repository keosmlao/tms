"use client";

import { useEffect, useState } from "react";
import { FaPlus, FaSearch } from "react-icons/fa";
import { ChecklistEntryDialog } from "@/components/forms/ChecklistEntryDialog";
import { ChecklistHistory } from "@/components/forms/ChecklistHistory";
import { getInspectionSummary } from "@/services/vehicle-maintenance-api";
import type { InspectionSummary } from "@/types";

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  search: string;
  version: number;
}

export function InspectionShell() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({
    dateFrom: firstOfMonth(),
    dateTo: today(),
    search: "",
    version: 0,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [summary, setSummary] = useState<InspectionSummary | null>(null);

  useEffect(() => {
    getInspectionSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [filters.version]);

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFilters((f) => ({ dateFrom, dateTo, search, version: f.version }));
  }

  function handleSaved() {
    setDialogOpen(false);
    setFilters((f) => ({ ...f, version: f.version + 1 }));
  }

  return (
    <>
      {summary !== null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glass rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">
              {summary.inspected_today}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              ກວດແລ້ວມື້ນີ້
            </p>
          </div>
          <div className="glass rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary.vehicles_with_issues}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              ພົບຈຸດບົກຜ່ອງ
            </p>
          </div>
          <div className="glass rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">
              {Math.max(0, summary.total_vehicles - summary.inspected_today)}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              ຍັງບໍ່ໄດ້ກວດ
            </p>
          </div>
          <div className="glass rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              {summary.pending_approval}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              ລໍຖ້າອານຸມັດ
            </p>
          </div>
        </div>
      )}

      <div className="glass rounded-lg p-3">
        <form
          onSubmit={handleSearch}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              ຈາກວັນທີ
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              ຮອດວັນທີ
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-col gap-1 min-w-48 flex-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              ຄົ້ນຫາ
            </span>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ຄົ້ນຫາລົດ, ຊື່, ທະບຽນ..."
                className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
          >
            <FaSearch size={12} />
            ຄົ້ນຫາ
          </button>

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700"
          >
            <FaPlus size={12} />
            ບັນທຶກໃໝ່
          </button>
        </form>
      </div>

      <ChecklistHistory
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        search={filters.search}
        version={filters.version}
      />

      <ChecklistEntryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}

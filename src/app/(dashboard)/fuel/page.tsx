"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaCalendar,
  FaGasPump,
  FaImage,
  FaMoneyBillWave,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUserTie,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
} from "@/components/status-page-shell";
import { Pagination, toNumber } from "@/components/status-page-helpers";
import { FuelEntryDialog } from "@/components/fuel-entry-dialog";

interface FuelLog {
  id: number;
  fuel_date: string;
  user_code: string | null;
  driver_name: string | null;
  car: string | null;
  doc_no: string | null;
  liters: number | string;
  amount: number | string;
  odometer: number | string | null;
  station: string | null;
  note: string | null;
  lat: string | null;
  lng: string | null;
  has_image: boolean;
  created_at: string;
}

const formatNumber = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export default function FuelPage() {
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [fromDate, setFromDate] = useState(getFixedTodayDate());
  const [toDate, setToDate] = useState(getFixedTodayDate());
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [photoOpen, setPhotoOpen] = useState<{
    id: number;
    src: string | null;
    loading: boolean;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const perPage = 20;

  const load = () => {
    setLoading(true);
    void Actions.getFuelLogs({ fromDate, toDate })
      .then((data) => setLogs((data ?? []) as FuelLog[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const k = searchText.trim().toLowerCase();
    if (!k) return logs;
    return logs.filter((r) =>
      [r.driver_name, r.user_code, r.car, r.station, r.doc_no, r.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(k)
    );
  }, [logs, searchText]);

  const summary = useMemo(
    () =>
      filtered.reduce(
        (r, x) => {
          r.entries += 1;
          r.liters += toNumber(x.liters);
          r.amount += toNumber(x.amount);
          return r;
        },
        { entries: 0, liters: 0, amount: 0 }
      ),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  const openPhoto = async (id: number) => {
    setPhotoOpen({ id, src: null, loading: true });
    try {
      const data = await Actions.getFuelImage(id);
      setPhotoOpen({ id, src: (data as string | null) ?? null, loading: false });
    } catch (e) {
      console.error(e);
      setPhotoOpen({ id, src: null, loading: false });
    }
  };

  const deleteLog = async (id: number) => {
    if (!confirm("ຢືນຢັນລຶບລາຍການນີ້?")) return;
    setDeletingId(id);
    try {
      await Actions.deleteFuelLog(id);
      setLogs((c) => c.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      alert("ລຶບບໍ່ສຳເລັດ");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ບັນທຶກເຕີມນ້ຳມັນ"
        subtitle="ປະຫວັດການເຕີມນ້ຳມັນຂອງລົດ"
        icon={<FaGasPump />}
        tone="orange"
      />

      <StatusStatGrid
        stats={[
          { label: "ລາຍການ", value: summary.entries, icon: <FaGasPump />, tone: "orange" },
          { label: "ລິດທັງໝົດ", value: formatNumber(summary.liters), icon: <FaGasPump />, tone: "amber" },
          { label: "ຍອດເງິນ", value: formatNumber(summary.amount), icon: <FaMoneyBillWave />, tone: "emerald" },
        ]}
      />

      <StatusControlPanel>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} /> ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">ເຖິງວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <div className="flex-[1.4] min-w-[220px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaSearch className="inline mr-1.5 text-slate-400" size={11} /> ຄົ້ນຫາ
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ຄົ້ນຫາຄົນຂັບ, ລົດ, ສະຖານີ..."
              className="w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "ກຳລັງໂຫຼດ..." : "ຄົ້ນຫາ"}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2"
          >
            <FaPlus size={10} /> ບັນທຶກໃໝ່
          </button>
        </form>
      </StatusControlPanel>

      <StatusTableShell count={filtered.length}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaGasPump className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ຍັງບໍ່ມີບັນທຶກເຕີມນ້ຳມັນ"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນທີ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຄົນຂັບ / ລົດ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ລິດ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຍອດເງິນ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສະຖານີ / ຫມາຍເຫດ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຮູບ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="block font-semibold text-slate-800 dark:text-white">{r.fuel_date}</span>
                          <span className="block text-[11px] text-slate-500">{r.created_at}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        <div className="space-y-1">
                          <p className="font-medium flex items-center gap-1.5">
                            <FaUserTie size={10} className="text-slate-400" />
                            {r.driver_name || r.user_code || "-"}
                          </p>
                          {r.car && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                              <FaTruck size={10} /> {r.car}
                            </p>
                          )}
                          {r.doc_no && (
                            <p className="text-[10px] text-slate-400">{r.doc_no}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {formatNumber(r.liters)}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">L</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatNumber(r.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div className="space-y-1">
                          {r.station && <p className="text-[11px]">{r.station}</p>}
                          {r.odometer !== null && r.odometer !== undefined && (
                            <p className="text-[10px] text-slate-400">
                              ໄມລ: {formatNumber(r.odometer)}
                            </p>
                          )}
                          {r.note && (
                            <p className="text-[10px] text-slate-400 italic">{r.note}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.has_image ? (
                          <button
                            onClick={() => void openPhoto(r.id)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:text-orange-400 dark:hover:bg-orange-500/10 transition-colors"
                            title="ເບິ່ງຮູບ"
                          >
                            <FaImage size={12} />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => void deleteLog(r.id)}
                          disabled={deletingId === r.id}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                          title="ລຶບ"
                        >
                          {deletingId === r.id ? (
                            <FaSpinner className="animate-spin" size={11} />
                          ) : (
                            <FaTrash size={11} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={filtered.length}
              perPage={perPage}
              onChange={setCurrentPage}
            />
          </>
        )}
      </StatusTableShell>

      <FuelEntryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={load}
      />

      {photoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPhotoOpen(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] glass rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPhotoOpen(null)}
              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
            >
              <FaTimes size={14} />
            </button>
            {photoOpen.loading ? (
              <div className="w-[480px] h-[320px] flex items-center justify-center text-slate-300">
                <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດຮູບ...
              </div>
            ) : photoOpen.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoOpen.src}
                alt="ຮູບເຕີມນ້ຳມັນ"
                className="max-w-full max-h-[90vh] object-contain"
              />
            ) : (
              <div className="w-[480px] h-[200px] flex items-center justify-center text-slate-300 text-sm">
                ບໍ່ພົບຮູບ
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

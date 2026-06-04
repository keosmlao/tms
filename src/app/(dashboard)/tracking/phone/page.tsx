"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaBatteryHalf,
  FaMapMarkedAlt,
  FaMobileAlt,
  FaRoute,
  FaSpinner,
  FaSyncAlt,
  FaTachometerAlt,
  FaTruck,
  FaUser,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { PhoneTrailMap, type TrailPoint } from "@/components/phone-trail-map";

interface TrackingJob {
  doc_no: string;
  doc_date: string;
  car: string;
  driver: string;
  job_status: number;
  point_count: number;
  last_at: string;
  last_battery: string;
  last_imei: string;
  device_model: string;
}

interface TrailPointFull extends TrailPoint {
  heading: string;
  accuracy: string;
  signal: string;
  imei: string;
}

interface Device {
  imei: string;
  model: string;
  os_version: string;
  app_version: string;
  carrier: string;
  sim_phone: string;
  updated_at: string;
}

interface Trail {
  job: { doc_no: string; doc_date: string; car: string; driver: string; job_status: number };
  device: Device | null;
  points: TrailPointFull[];
}

function jobStatusLabel(s: number): { text: string; cls: string } {
  if (s >= 3) return { text: "ປິດແລ້ວ", cls: "bg-slate-500/10 text-slate-500" };
  if (s === 2) return { text: "ກຳລັງຈັດສົ່ງ", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  if (s === 1) return { text: "ຮັບແລ້ວ", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { text: "ລໍຖ້າ", cls: "bg-slate-500/10 text-slate-500" };
}

function PhoneTrackingInner() {
  const searchParams = useSearchParams();
  const docParam = searchParams.get("doc")?.trim() ?? "";

  const [jobs, setJobs] = useState<TrackingJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [trail, setTrail] = useState<Trail | null>(null);
  const [loadingTrail, setLoadingTrail] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const didAutoSelectRef = useRef(false);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const rows = (await Actions.getPhoneTrackingJobs()) as TrackingJob[];
      setJobs(rows ?? []);
    } catch (e) {
      console.error("[phone-tracking] load jobs failed:", e);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // `silent` refreshes in place (no spinner, keeps the map) — used by the
  // auto-refresh tick so a live trip extends smoothly instead of flickering.
  const loadTrail = useCallback(async (docNo: string, silent = false) => {
    if (!silent) {
      setSelected(docNo);
      setLoadingTrail(true);
      setTrail(null);
    } else {
      setRefreshing(true);
    }
    try {
      const data = (await Actions.getPhoneTrail(docNo)) as Trail | null;
      setTrail(data);
    } catch (e) {
      console.error("[phone-tracking] load trail failed:", e);
    } finally {
      setLoadingTrail(false);
      setRefreshing(false);
    }
  }, []);

  // Opened from the phones-map "ເສັ້ນທາງເຕັມ" link (?doc=<doc_no>): load that
  // trip's trail once on mount so the user lands straight on its route.
  useEffect(() => {
    if (!docParam || didAutoSelectRef.current) return;
    didAutoSelectRef.current = true;
    void loadTrail(docParam);
  }, [docParam, loadTrail]);

  const isLive = !!trail && trail.job.job_status < 3;

  // Poll the selected trip every 15s while it's still active and auto-refresh
  // is on. Closed trips (job_status >= 3) never change, so we don't poll them.
  useEffect(() => {
    if (!selected || !autoRefresh || !isLive) return;
    const id = window.setInterval(() => {
      void loadTrail(selected, true);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [selected, autoRefresh, isLive, loadTrail]);

  const last = trail?.points?.[trail.points.length - 1];

  return (
    <div className="space-y-4">
      <div className="glass rounded-lg p-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <FaMobileAlt className="text-sky-600 dark:text-sky-400 text-lg" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500">
              Phone GPS Trail
            </p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-800 dark:text-white">
              ຕິດຕາມຕຳແໜ່ງຈາກມືຖືຄົນຂັບ
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-500">
              ເສັ້ນທາງເດີນທາງທີ່ເກັບຈາກ app ມືຖື (ທຸກ 3 ວິນາທີ)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          disabled={loadingJobs}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          <FaSyncAlt className={loadingJobs ? "animate-spin" : ""} size={12} />
          ໂຫຼດຄືນ
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trip list */}
        <div className="lg:col-span-1 glass rounded-lg p-3 max-h-[640px] overflow-auto">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 px-2 pb-2">
            ຖ້ຽວທີ່ມີຂໍ້ມູນມືຖື ({jobs.length})
          </p>
          {loadingJobs ? (
            <div className="py-16 flex items-center justify-center gap-2 text-slate-500">
              <FaSpinner className="animate-spin text-sky-500" size={14} />
              <span className="text-sm">ກຳລັງໂຫຼດ...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">ຍັງບໍ່ມີຂໍ້ມູນ</div>
          ) : (
            <ul className="space-y-1.5">
              {jobs.map((j) => {
                const st = jobStatusLabel(j.job_status);
                const active = j.doc_no === selected;
                return (
                  <li key={j.doc_no}>
                    <button
                      type="button"
                      onClick={() => void loadTrail(j.doc_no)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                        active
                          ? "bg-sky-500/15 ring-1 ring-sky-500/40"
                          : "hover:bg-white/40 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-bold text-slate-800 dark:text-white truncate">
                          {j.doc_no}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${st.cls}`}>
                          {st.text}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                        <FaTruck size={9} /> <span className="truncate">{j.car}</span>
                        <FaUser size={9} /> <span className="truncate">{j.driver}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <FaRoute size={9} /> {j.point_count} ຈຸດ
                        </span>
                        {j.last_battery && (
                          <span className="inline-flex items-center gap-1">
                            <FaBatteryHalf size={9} /> {j.last_battery}%
                          </span>
                        )}
                        <span className="truncate">{j.last_at}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Map + detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="glass rounded-lg py-24 text-center">
              <div className="w-16 h-16 mx-auto rounded-lg bg-sky-500/10 flex items-center justify-center mb-4">
                <FaMapMarkedAlt className="text-sky-400 text-2xl" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                ເລືອກຖ້ຽວເພື່ອເບິ່ງເສັ້ນທາງ
              </p>
            </div>
          ) : loadingTrail ? (
            <div className="glass rounded-lg py-24 flex items-center justify-center gap-2 text-slate-500">
              <FaSpinner className="animate-spin text-sky-500" size={16} />
              <span className="text-sm">ກຳລັງໂຫຼດເສັ້ນທາງ...</span>
            </div>
          ) : !trail || trail.points.length === 0 ? (
            <div className="glass rounded-lg py-24 text-center text-sm text-slate-400">
              ບໍ່ພົບຈຸດຕຳແໜ່ງສຳລັບຖ້ຽວນີ້
            </div>
          ) : (
            <>
              <div className="glass rounded-lg p-2">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="font-mono text-[13px] font-bold text-slate-700 dark:text-white">
                    {trail.job.doc_no}
                  </span>
                  <div className="flex items-center gap-2">
                    {isLive && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <span
                          className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${
                            refreshing ? "" : "animate-pulse"
                          }`}
                        />
                        {refreshing ? "ກຳລັງໂຫຼດ..." : "Live"}
                      </span>
                    )}
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        disabled={!isLive}
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      Auto 15s
                    </label>
                  </div>
                </div>
                <PhoneTrailMap
                  points={trail.points}
                  tripKey={trail.job.doc_no}
                  live={isLive}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="ຈຳນວນຈຸດ" value={String(trail.points.length)} icon={<FaRoute size={12} />} />
                <Stat
                  label="ໄວລ່າສຸດ"
                  value={last?.speed ? last.speed : "-"}
                  icon={<FaTachometerAlt size={12} />}
                />
                <Stat
                  label="ແບັດເຕີຣີ"
                  value={last?.battery ? `${last.battery}%` : "-"}
                  icon={<FaBatteryHalf size={12} />}
                />
                <Stat label="ສັນຍານ" value={last?.signal ? last.signal : "-"} icon={<FaMobileAlt size={12} />} />
              </div>

              {trail.device && (
                <div className="glass rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
                    ຂໍ້ມູນເຄື່ອງ (IMEI: <span className="font-mono">{trail.device.imei || "-"}</span>)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[12px]">
                    <Field label="ຮຸ່ນເຄື່ອງ" value={trail.device.model} />
                    <Field label="OS" value={trail.device.os_version} />
                    <Field label="ເວີຊັນ App" value={trail.device.app_version} />
                    <Field label="ເຄືອຂ່າຍ" value={trail.device.carrier} />
                    <Field label="ເບີ SIM" value={trail.device.sim_phone} />
                    <Field label="ອັບເດດລ່າສຸດ" value={trail.device.updated_at} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="glass rounded-lg p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="font-semibold text-slate-800 dark:text-white truncate">{value || "-"}</p>
    </div>
  );
}

export default function PhoneTrackingPage() {
  return (
    <Suspense fallback={null}>
      <PhoneTrackingInner />
    </Suspense>
  );
}

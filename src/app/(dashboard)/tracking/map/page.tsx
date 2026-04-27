"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaCompass,
  FaExternalLinkAlt,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaSatelliteDish,
  FaSpinner,
  FaSyncAlt,
  FaTachometerAlt,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";

interface GpsRealtime {
  imei: string;
  lat: string;
  lng: string;
  speed: string;
  heading: string;
  recorded_at: string;
  car_name: string;
  car_code: string;
  address: string;
}

const AUTO_REFRESH_MS = 30_000;

function buildEmbedUrl(lat: string, lng: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=17&output=embed`;
}

function buildOpenUrl(lat: string, lng: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function formatUpdatedAt(value: string) {
  if (!value) return "-";
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleString("lo-LA", { hour12: false });
  }
  return value;
}

export default function TrackingMapPage() {
  const searchParams = useSearchParams();
  const imei = (searchParams.get("imei") ?? "").trim();

  const [data, setData] = useState<GpsRealtime | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!imei) return;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const result = await Actions.getGpsRealtime(imei);
        setData(result);
        setFetchedAt(new Date());
        setError(result ? null : "ບໍ່ພົບຂໍ້ມູນຕຳແໜ່ງສຳລັບ IMEI ນີ້");
      } catch (err) {
        console.error(err);
        setError("ດຶງຂໍ້ມູນຈາກ GPS server ບໍ່ສຳເລັດ");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [imei]
  );

  useEffect(() => {
    if (!imei) return;
    void load("initial");
  }, [imei, load]);

  useEffect(() => {
    if (!imei || !autoRefresh) return;
    const id = window.setInterval(() => {
      void load("refresh");
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [imei, autoRefresh, load]);

  if (!imei) {
    return (
      <div className="glass rounded-lg py-20 text-center">
        <div className="w-16 h-16 mx-auto rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
          <FaExclamationTriangle className="text-amber-400 text-2xl" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ກະລຸນາລະບຸ IMEI</p>
        <p className="text-xs text-slate-400 mt-1">
          ຕົວຢ່າງ: <span className="font-mono">/tracking/map?imei=867869060229853</span>
        </p>
      </div>
    );
  }

  const hasLocation = Boolean(data?.lat && data?.lng);

  return (
    <div className="space-y-4">
      <div className="glass rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <FaSatelliteDish className="text-sky-600 dark:text-sky-400 text-lg" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500">
                GPS Live Location
              </p>
              <h1 className="mt-0.5 text-lg font-bold text-slate-800 dark:text-white">
                {data?.car_name || "ຕິດຕາມລົດດ້ວຍ GPS"}
              </h1>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                <FaTruck className="text-slate-400" size={10} />
                <span className="font-mono">{imei}</span>
                {data?.car_code && (
                  <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                    {data.car_code}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 glass rounded-lg px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="h-3.5 w-3.5 accent-sky-600"
              />
              Auto refresh {Math.round(AUTO_REFRESH_MS / 1000)}s
            </label>
            <button
              type="button"
              onClick={() => void load("refresh")}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              <FaSyncAlt className={refreshing || loading ? "animate-spin" : ""} size={12} />
              Refresh
            </button>
            {hasLocation && data && (
              <a
                href={buildOpenUrl(data.lat, data.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 glass rounded-lg px-3.5 py-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-white/30 dark:hover:bg-white/5"
              >
                <FaExternalLinkAlt size={10} />
                ເປີດ Google Maps
              </a>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-lg py-20 flex items-center justify-center gap-2">
          <FaSpinner className="animate-spin text-sky-500" size={16} />
          <span className="text-sm text-slate-500">ກຳລັງດຶງຕຳແໜ່ງ GPS...</span>
        </div>
      ) : !hasLocation ? (
        <div className="glass rounded-lg py-20 text-center">
          <div className="w-16 h-16 mx-auto rounded-lg bg-rose-500/10 flex items-center justify-center mb-4">
            <FaMapMarkerAlt className="text-rose-300 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{error ?? "ບໍ່ພົບຂໍ້ມູນ"}</p>
          <p className="text-xs text-slate-400 mt-1">ກວດສອບວ່າ IMEI ຖືກ ແລະ tracker ເປີດຢູ່</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <div className="glass rounded-lg overflow-hidden">
              <iframe
                key={`${data!.lat},${data!.lng}`}
                src={buildEmbedUrl(data!.lat, data!.lng)}
                title="GPS location"
                width="100%"
                height="560"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block w-full"
              />
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <InfoRow
              icon={<FaMapMarkerAlt size={12} />}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              label="ພິກັດປັດຈຸບັນ"
              value={`${data!.lat}, ${data!.lng}`}
              mono
            />
            <InfoRow
              icon={<FaTachometerAlt size={12} />}
              iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              label="ຄວາມໄວ"
              value={data!.speed ? `${data!.speed} km/h` : "-"}
            />
            <InfoRow
              icon={<FaCompass size={12} />}
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              label="ທິດທາງ"
              value={data!.heading ? `${data!.heading}°` : "-"}
            />
            <InfoRow
              icon={<FaSyncAlt size={12} />}
              iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              label="ເວລາອັບເດດ (tracker)"
              value={formatUpdatedAt(data!.recorded_at)}
            />
            {data!.address && (
              <InfoRow
                icon={<FaMapMarkerAlt size={12} />}
                iconClass="bg-slate-500/10 text-slate-600 dark:text-slate-400"
                label="ທີ່ຕັ້ງ"
                value={data!.address}
              />
            )}
            {fetchedAt && (
              <p className="text-[11px] text-slate-400 text-right">
                ດຶງຂໍ້ມູນລ່າສຸດ {fetchedAt.toLocaleTimeString("lo-LA", { hour12: false })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  iconClass,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="glass rounded-lg p-3 flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <p className={`mt-0.5 text-sm font-semibold text-slate-800 dark:text-white break-words ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

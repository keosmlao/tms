"use client";

import { useEffect, useRef, useState } from "react";
import { FaMapMarkerAlt, FaPaste, FaSpinner, FaTimes, FaTrash, FaCrosshairs } from "react-icons/fa";
import { Actions } from "@/lib/api";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => unknown;
  remove: () => unknown;
  on: (ev: string, cb: (e: { latlng: { lat: number; lng: number } }) => void) => unknown;
  invalidateSize: () => unknown;
};
type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  setIcon: (icon: unknown) => LeafletMarker;
  remove: () => unknown;
};
type LeafletApi = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LeafletMap) => unknown };
  marker: (latlng: [number, number], opts?: Record<string, unknown>) => LeafletMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
};

function getL(): LeafletApi | undefined {
  return (window as unknown as { L?: LeafletApi }).L;
}

function useLeafletReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!document.querySelector("link[data-leaflet]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.dataset.leaflet = "1";
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[data-src="${LEAFLET_JS}"]`)) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.async = true;
    s.dataset.src = LEAFLET_JS;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

function pinIcon(L: LeafletApi) {
  return L.divIcon({
    className: "tms-pending-pin",
    html: `<div style="
      background:#2c6fb6;color:white;width:32px;height:32px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);box-shadow:0 4px 10px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
    "><div style="transform:rotate(45deg);font-size:14px;">📍</div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export interface PendingLocationDefaults {
  planned_lat?: string | null;
  planned_lng?: string | null;
  cust_lat?: string | null;
  cust_lng?: string | null;
}

// Default centre when no location is known — Vientiane city centre.
const DEFAULT_CENTER: [number, number] = [17.9757, 102.6331];

function parseLatLng(lat?: string | null, lng?: string | null): [number, number] | null {
  if (!lat || !lng) return null;
  const a = Number(String(lat).trim());
  const b = Number(String(lng).trim());
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0 && b === 0) return null;
  return [a, b];
}

// Accept anything a user might copy off Google Maps and squeeze a (lat, lng)
// out of it. Inputs we handle:
//   "17.975700, 102.633100"            — the share-popup format
//   "17.975700,102.633100"              — comma without space
//   "17.975700 102.633100"              — space-separated
//   "https://maps.app.goo.gl/..."       — short links: needs server-side resolve, we reject
//   "https://www.google.com/maps/place/Name/@17.9757,102.6331,17z/..." — extract @lat,lng
//   "https://www.google.com/maps?q=17.9757,102.6331"
// Returns null when nothing usable is found so the caller can surface an error.
function parsePastedLatLng(raw: string): [number, number] | null {
  const text = raw.trim();
  if (!text) return null;
  // Try URL "@lat,lng" (Google Maps place links).
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const a = Number(at[1]);
    const b = Number(at[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  // Try q=lat,lng (?q=... or &q=...).
  const q = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (q) {
    const a = Number(q[1]);
    const b = Number(q[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  // Bare pair — first two finite numbers separated by comma / whitespace.
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      Math.abs(a) <= 90 &&
      Math.abs(b) <= 180
    ) {
      return [a, b];
    }
  }
  return null;
}

export function PendingBillLocationDialog({
  open,
  billNo,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  billNo: string | null;
  initial?: PendingLocationDefaults | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ready = useLeafletReady();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPasteInput("");
    setPasteError(null);
    setPoint(
      parseLatLng(initial?.planned_lat, initial?.planned_lng) ??
        parseLatLng(initial?.cust_lat, initial?.cust_lng)
    );
  }, [open, initial]);

  // Drive both the marker and the map view from a freshly parsed pair, so the
  // marker, the `point` state, and the visible centre all stay in sync. Used
  // for paste + "ຕຳແໜ່ງປະຈຸບັນ".
  const moveTo = (next: [number, number]) => {
    setPoint(next);
    const L = getL();
    const map = mapRef.current;
    if (L && map) {
      map.setView(next, 17);
      if (markerRef.current) {
        markerRef.current.setLatLng(next);
      } else {
        markerRef.current = L.marker(next, { icon: pinIcon(L) }).addTo(map);
      }
    }
  };

  const applyPaste = (raw: string) => {
    const parsed = parsePastedLatLng(raw);
    if (!parsed) {
      setPasteError("ບໍ່ສາມາດອ່ານ lat,lng ໄດ້ — ກວດສອບຮູບແບບ");
      return;
    }
    setPasteError(null);
    setPasteInput(`${parsed[0].toFixed(6)}, ${parsed[1].toFixed(6)}`);
    moveTo(parsed);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteError("ບໍ່ມີຂໍ້ມູນໃນ clipboard");
        return;
      }
      applyPaste(text);
    } catch {
      setPasteError("ບໍ່ສາມາດອ່ານ clipboard ໄດ້ — ໃຫ້ paste ໂດຍກົງ");
    }
  };

  useEffect(() => {
    if (!open || !ready || !mapEl.current) return;
    const L = getL();
    if (!L) return;
    if (mapRef.current) return;

    const start = point ?? DEFAULT_CENTER;
    const m = L.map(mapEl.current, { zoomControl: true });
    m.setView(start, point ? 16 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(m);
    m.on("click", (e) => {
      const next: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPoint(next);
      if (markerRef.current) {
        markerRef.current.setLatLng(next);
      } else {
        markerRef.current = L.marker(next, { icon: pinIcon(L) }).addTo(m);
      }
    });
    if (point) {
      markerRef.current = L.marker(point, { icon: pinIcon(L) }).addTo(m);
    }
    mapRef.current = m;
    // Map needs a paint cycle after the dialog finishes its open animation,
    // otherwise it renders into the wrong container size and tiles look cut.
    setTimeout(() => m.invalidateSize(), 60);

    return () => {
      m.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [open, ready, point]);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async (clear = false) => {
    if (!billNo) return;
    if (!clear && !point) {
      setError("ກະລຸນາແຕະຈຸດໃນແຜນທີ່");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Actions.setPendingBillLocation({
        bill_no: billNo,
        lat: clear ? null : point![0].toString(),
        lng: clear ? null : point![1].toString(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      moveTo([p.coords.latitude, p.coords.longitude]);
    });
  };

  if (!open || !billNo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={close}
    >
      <div
        className="glass rounded-xl w-full max-w-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between bg-white/30 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <FaMapMarkerAlt size={12} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                ກຳນົດຈຸດຈັດສົ່ງ
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ບິນ {billNo} · ແຕະຈຸດໃນແຜນທີ່ ຫຼືກົດປຸ່ມຫາຕຳແໜ່ງປະຈຸບັນ
              </p>
            </div>
          </div>
          <button
            onClick={close}
            disabled={submitting}
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center disabled:opacity-50"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="px-5 py-3 space-y-2">
          <div
            ref={mapEl}
            className="w-full h-[360px] rounded-lg overflow-hidden border border-slate-200/40 dark:border-white/10 bg-slate-100 dark:bg-white/5"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              onBlur={() => {
                if (pasteInput.trim()) applyPaste(pasteInput);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyPaste(pasteInput);
                }
              }}
              onPaste={(e) => {
                // Run parse on the actual pasted text right away — the
                // controlled input would otherwise need an extra Enter
                // before applyPaste fires.
                const t = e.clipboardData.getData("text");
                if (t) {
                  e.preventDefault();
                  setPasteInput(t);
                  applyPaste(t);
                }
              }}
              placeholder="ວາງ lat,lng ຈາກ Google Maps ເຊັ່ນ: 17.9757, 102.6331"
              className="flex-1 glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:text-[10px]"
            />
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              disabled={submitting}
              title="ວາງຈາກ clipboard"
              className="px-3 py-2 rounded-lg text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-500/10 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <FaPaste size={11} /> Paste
            </button>
          </div>
          {pasteError && (
            <p className="text-[10px] text-rose-500">{pasteError}</p>
          )}
          {point ? (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
              {point[0].toFixed(6)}, {point[1].toFixed(6)}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">ຍັງບໍ່ມີຈຸດທີ່ເລືອກ</p>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-40 inline-flex items-center gap-1.5"
            title="ລຶບຈຸດທີ່ກຳນົດ"
          >
            <FaTrash size={10} /> ລຶບຈຸດ
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={locateMe}
              disabled={submitting}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-500/10 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <FaCrosshairs size={11} /> ຕຳແໜ່ງປະຈຸບັນ
            </button>
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={submitting || !point}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
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
    </div>
  );
}

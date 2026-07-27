"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import "./tv.css";

// Leaflet touches `window` at import time, so it must never run on the server.
const TvMap = dynamic(() => import("./tv-map"), {
  ssr: false,
  loading: () => <div className="tv-map tv-map-loading">ກຳລັງໂຫຼດແຜນທີ່...</div>,
});

/**
 * TV mode — ຈໍຕິດຝາຫ້ອງຈັດສົ່ງ.
 *
 * ອ່ານຢ່າງດຽວ, ບໍ່ມີປຸ່ມ, ບໍ່ມີ scroll. ໝຸນໜ້າເອງທຸກ 20 ວິນາທີ ແລະ
 * ດຶງຂໍ້ມູນໃໝ່ທຸກ 15 ວິນາທີ.
 *
 * ເປີດດ້ວຍ: /tv?key=<TV_DASHBOARD_TOKEN>&branch=<ລະຫັດສາຂາ>
 */

const POLL_MS = 15_000;
const PAGE_MS = 20_000;

type Totals = {
  trips: number;
  delivered_today: number;
  cancelled_today: number;
  trips_out: number;
  trips_closed: number;
  bills: number;
  delivered: number;
  cancelled: number;
  pending: number;
};

type RunningTrip = {
  doc_no: string;
  car: string;
  driver: string;
  route: string;
  round: string;
  out_at: string | null;
  out_minutes: number | null;
  bills: number;
  delivered: number;
  last_at: string | null;
  idle_minutes: number | null;
  state: "ok" | "stalled" | "done";
};

type NotStarted = {
  doc_no: string;
  car: string;
  driver: string;
  route: string;
  bills: number;
  approved: boolean;
  status_label: string;
};

type OpenTrip = {
  doc_no: string;
  day: string;
  driver: string;
  car: string;
  days_open: number;
  open_bills: number;
};

type Cancelled = {
  bill_no: string;
  cust_name: string;
  driver: string;
  reason: string;
  at: string | null;
};

type FeedRow = {
  bill_no: string;
  cust_name: string;
  driver: string;
  at: string | null;
};

type TripPoint = {
  doc_no: string;
  car: string;
  driver: string;
  lat: number;
  lng: number;
  at: string | null;
  age_minutes: number | null;
  cust_name: string;
  running: boolean;
};

type Vehicle = {
  car_code: string;
  car_name: string;
  lat: number;
  lng: number;
  speed: number;
  address: string;
  at: string | null;
  age_minutes: number | null;
  moving: boolean;
  stale: boolean;
};

type TvData = {
  date: string;
  branch: string;
  live: boolean;
  generated_at: string;
  totals: Totals;
  running: RunningTrip[];
  not_started: NotStarted[];
  open_trips: OpenTrip[];
  cancelled: Cancelled[];
  feed: FeedRow[];
  vehicles: Vehicle[];
  trip_points: TripPoint[];
};

const PAGES = ["ພາບລວມມື້ນີ້", "ຖ້ຽວກຳລັງແລ່ນ", "ຕ້ອງແກ້ດຽວນີ້", "ຕຳແໜ່ງລົດ"];

export default function TvPage() {
  const [data, setData] = useState<TvData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [clock, setClock] = useState("");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const paused = useRef(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch(`/api/tv?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as TvData;
      setData(body);
      setFetchedAt(Date.now());
      setError(null);
    } catch (fetchError) {
      // Keep the last good screen up — a blank TV tells the room nothing. The
      // staleness clock in the corner is what says the feed died.
      setError(fetchError instanceof Error ? fetchError.message : "error");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Rotate pages. Space bar pauses, arrow keys step — handy when somebody walks
  // up to the screen to look at one thing.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused.current) setPage((current) => (current + 1) % PAGES.length);
    }, PAGE_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        paused.current = !paused.current;
        setPage((current) => current);
      } else if (event.code === "ArrowRight") {
        setPage((current) => (current + 1) % PAGES.length);
      } else if (event.code === "ArrowLeft") {
        setPage((current) => (current - 1 + PAGES.length) % PAGES.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      setClock(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const staleSeconds = fetchedAt
    ? Math.round((Date.now() - fetchedAt) / 1000)
    : null;

  if (!data) {
    return (
      <main className="tv-root tv-center">
        <div className="tv-boot">
          {error ? `ເຊື່ອມຕໍ່ບໍ່ໄດ້ · ${error}` : "ກຳລັງໂຫຼດ..."}
        </div>
      </main>
    );
  }

  const { totals } = data;
  const percent =
    totals.bills > 0 ? Math.round((totals.delivered / totals.bills) * 100) : 0;

  return (
    <main className="tv-root">
      <header className="tv-head">
        <div className="tv-head-left">
          <span className="tv-title">ຕິດຕາມການຈັດສົ່ງ</span>
          <span className="tv-date">{formatDate(data.date)}</span>
        </div>
        <nav className="tv-tabs">
          {PAGES.map((label, index) => (
            <span
              key={label}
              className={index === page ? "tv-tab tv-tab-on" : "tv-tab"}
            >
              {label}
            </span>
          ))}
        </nav>
        <div className="tv-head-right">
          <span className="tv-clock">{clock}</span>
          <span className={staleFlagClass(staleSeconds, error)}>
            {error
              ? "ຂໍ້ມູນຄ້າງ"
              : staleSeconds === null
                ? ""
                : `ອັບເດດ ${staleSeconds} ວິ`}
          </span>
        </div>
      </header>

      <section className="tv-body">
        <Page active={page === 0}>
          <Overview totals={totals} percent={percent} data={data} />
        </Page>
        <Page active={page === 1}>
          <Running trips={data.running} />
        </Page>
        <Page active={page === 2}>
          <Alerts data={data} />
        </Page>
        <Page active={page === 3}>
          <Vehicles
            vehicles={data.vehicles}
            tripPoints={data.trip_points}
            active={page === 3}
          />
        </Page>
      </section>

      <Ticker rows={data.feed} />
    </main>
  );
}

function Page({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={active ? "tv-page" : "tv-page tv-page-off"}>{children}</div>
  );
}

// ── ໜ້າ 1 ────────────────────────────────────────────────────────────────

function Overview({
  totals,
  percent,
  data,
}: {
  totals: Totals;
  percent: number;
  data: TvData;
}) {
  const stalled = data.running.filter((trip) => trip.state === "stalled").length;
  return (
    <div className="tv-overview">
      <div className="tv-kpis">
        <Kpi label="ບິນທັງໝົດ" value={totals.bills} tone="plain" />
        <Kpi label="ສົ່ງສຳເລັດ" value={totals.delivered} tone="good" />
        <Kpi label="ຍັງຄ້າງ" value={totals.pending} tone="warn" />
        <Kpi label="ຍົກເລີກ" value={totals.cancelled} tone="bad" />
      </div>

      <div className="tv-progress-wrap">
        <div className="tv-progress-head">
          <span>ຄວາມຄືບໜ້າຂອງມື້</span>
          <span className="tv-progress-pct">{percent}%</span>
        </div>
        <div className="tv-progress">
          <div className="tv-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="tv-subrow">
        <Sub label="ຖ້ຽວທັງໝົດ" value={totals.trips} />
        <Sub label="ອອກແລ້ວ" value={totals.trips_out} />
        <Sub label="ປິດຖ້ຽວແລ້ວ" value={totals.trips_closed} />
        <Sub label="ຍັງບໍ່ອອກ" value={data.not_started.length} tone={data.not_started.length > 0 ? "warn" : "plain"} />
        <Sub label="ຖ້ຽວຊັກຊ້າ" value={stalled} tone={stalled > 0 ? "bad" : "plain"} />
        {totals.delivered_today !== totals.delivered && (
          <Sub label="ປິດບິນພາຍໃນວັນ" value={totals.delivered_today} />
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "plain" | "good" | "warn" | "bad";
}) {
  return (
    <div className={`tv-kpi tv-tone-${tone}`}>
      <div className="tv-kpi-value">{value.toLocaleString()}</div>
      <div className="tv-kpi-label">{label}</div>
    </div>
  );
}

function Sub({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: number;
  tone?: "plain" | "warn" | "bad";
}) {
  return (
    <div className={`tv-sub tv-tone-${tone}`}>
      <span className="tv-sub-value">{value.toLocaleString()}</span>
      <span className="tv-sub-label">{label}</span>
    </div>
  );
}

// ── ໜ້າ 2 ────────────────────────────────────────────────────────────────

function Running({ trips }: { trips: RunningTrip[] }) {
  if (trips.length === 0) {
    return <Empty text="ຍັງບໍ່ມີຖ້ຽວອອກແລ່ນ" />;
  }
  // Never scroll: split into two columns and cap what one screen can hold.
  const shown = trips.slice(0, 16);
  const left = shown.slice(0, Math.ceil(shown.length / 2));
  const right = shown.slice(Math.ceil(shown.length / 2));
  return (
    <div className="tv-two-col">
      <div className="tv-col">{left.map((trip) => <TripRow key={trip.doc_no} trip={trip} />)}</div>
      <div className="tv-col">{right.map((trip) => <TripRow key={trip.doc_no} trip={trip} />)}</div>
      {trips.length > shown.length && (
        <div className="tv-more">ແລະ ອີກ {trips.length - shown.length} ຖ້ຽວ</div>
      )}
    </div>
  );
}

function TripRow({ trip }: { trip: RunningTrip }) {
  const percent = trip.bills > 0 ? Math.round((trip.delivered / trip.bills) * 100) : 0;
  return (
    <div className={`tv-trip tv-trip-${trip.state}`}>
      <div className="tv-trip-main">
        <span className="tv-trip-car">{trip.car}</span>
        <span className="tv-trip-driver">{trip.driver}</span>
        {trip.route && <span className="tv-trip-route">{trip.route}</span>}
      </div>
      <div className="tv-trip-bar">
        <div className="tv-trip-fill" style={{ width: `${percent}%` }} />
        <span className="tv-trip-count">
          {trip.delivered}/{trip.bills}
        </span>
      </div>
      <div className="tv-trip-meta">
        {trip.out_at ? `ອອກ ${trip.out_at}` : "ຍັງບໍ່ບັນທຶກເວລາອອກ"}
        {trip.out_minutes !== null && ` · ${durationLabel(trip.out_minutes)}`}
        {trip.state === "stalled" && trip.idle_minutes !== null && (
          <span className="tv-flag"> ບໍ່ຄືບໜ້າ {durationLabel(trip.idle_minutes)}</span>
        )}
        {trip.state === "done" && <span className="tv-flag-ok"> ຄົບທຸກບິນ ລໍປິດຖ້ຽວ</span>}
      </div>
    </div>
  );
}

// ── ໜ້າ 3 ────────────────────────────────────────────────────────────────

function Alerts({ data }: { data: TvData }) {
  const notStarted = data.not_started;
  return (
    <div className="tv-alerts">
      <AlertPanel
        title={`ຍັງບໍ່ອອກຈາກສາງ (${notStarted.length})`}
        empty="ອອກຄົບທຸກຖ້ຽວແລ້ວ"
        rows={notStarted.slice(0, 6).map((trip) => ({
          key: trip.doc_no,
          main: `${trip.car} · ${trip.driver}`,
          side: trip.status_label,
          tone: trip.approved ? "warn" : "bad",
          meta: `${trip.route || "-"} · ${trip.bills} ບິນ`,
        }))}
      />
      <AlertPanel
        title={`ຄ້າງປິດຖ້ຽວ (${data.open_trips.length})`}
        empty="ປິດຖ້ຽວຄົບແລ້ວ"
        rows={data.open_trips.slice(0, 6).map((trip) => ({
          key: trip.doc_no,
          main: `${trip.car} · ${trip.driver}`,
          side: `ຄ້າງ ${trip.days_open} ວັນ`,
          tone: trip.days_open >= 3 ? "bad" : "warn",
          meta: `${trip.day} · ບິນຄ້າງ ${trip.open_bills}`,
        }))}
      />
      <AlertPanel
        title={`ບິນຍົກເລີກມື້ນີ້ (${data.cancelled.length})`}
        empty="ບໍ່ມີບິນຍົກເລີກ"
        rows={data.cancelled.slice(0, 6).map((bill) => ({
          key: bill.bill_no,
          main: bill.cust_name,
          side: bill.at ?? "",
          tone: "bad" as const,
          meta: `${bill.bill_no} · ${bill.reason}`,
        }))}
      />
    </div>
  );
}

function AlertPanel({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{
    key: string;
    main: string;
    side: string;
    tone: "warn" | "bad";
    meta: string;
  }>;
}) {
  return (
    <div className="tv-panel">
      <h2 className="tv-panel-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="tv-panel-empty">{empty}</div>
      ) : (
        rows.map((row) => (
          <div key={row.key} className={`tv-panel-row tv-tone-${row.tone}`}>
            <div className="tv-panel-main">
              <span className="tv-panel-name">{row.main}</span>
              <span className="tv-panel-side">{row.side}</span>
            </div>
            <div className="tv-panel-meta">{row.meta}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ── ໜ້າ 4 ────────────────────────────────────────────────────────────────

function Vehicles({
  vehicles,
  tripPoints,
  active,
}: {
  vehicles: Vehicle[];
  tripPoints: TripPoint[];
  active: boolean;
}) {
  if (vehicles.length === 0 && tripPoints.length === 0) {
    return <Empty text="ຍັງບໍ່ມີພິກັດຈາກລົດ ຫຼື ຈາກການສົ່ງ" />;
  }
  const moving = vehicles.filter((vehicle) => vehicle.moving && !vehicle.stale).length;
  const stopped = vehicles.filter((vehicle) => !vehicle.moving && !vehicle.stale).length;
  const stale = vehicles.filter((vehicle) => vehicle.stale).length;
  return (
    <div className="tv-vehicles">
      <div className="tv-subrow">
        <Sub label="ລົດມີ GPS" value={vehicles.length} />
        <Sub label="ກຳລັງແລ່ນ" value={moving} />
        <Sub label="ຈອດຢູ່" value={stopped} tone="warn" />
        <Sub label="ຂາດສັນຍານ" value={stale} tone={stale > 0 ? "bad" : "plain"} />
        <Sub label="ຈຸດສົ່ງລ່າສຸດ" value={tripPoints.length} />
        <span className="tv-legend">
          <i className="tv-dot tv-dot-move" /> GPS ແລ່ນ
          <i className="tv-dot tv-dot-stop" /> GPS ຈອດ
          <i className="tv-dot tv-dot-bill" /> ຈຸດສົ່ງລ່າສຸດ
        </span>
      </div>
      <TvMap vehicles={vehicles} tripPoints={tripPoints} active={active} />
    </div>
  );
}

// ── ແຖບແລ່ນ ──────────────────────────────────────────────────────────────

function Ticker({ rows }: { rows: FeedRow[] }) {
  if (rows.length === 0) {
    return (
      <footer className="tv-ticker">
        <span className="tv-ticker-tag">ສຳເລັດລ່າສຸດ</span>
        <span className="tv-ticker-empty">ຍັງບໍ່ມີບິນສຳເລັດມື້ນີ້</span>
      </footer>
    );
  }
  // Duplicated so the marquee never shows a gap when it wraps.
  const stream = [...rows, ...rows];
  return (
    <footer className="tv-ticker">
      <span className="tv-ticker-tag">ສຳເລັດລ່າສຸດ</span>
      <div className="tv-ticker-track">
        {stream.map((row, index) => (
          <span className="tv-ticker-item" key={`${row.bill_no}-${index}`}>
            <b>{row.at ?? ""}</b> {row.cust_name}
            <em>{row.driver}</em>
          </span>
        ))}
      </div>
    </footer>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="tv-empty">{text}</div>;
}

// ── ຕົວຊ່ວຍ ──────────────────────────────────────────────────────────────

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} ນທ`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ຊມ` : `${hours} ຊມ ${rest} ນທ`;
}

function formatDate(value: string): string {
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function staleFlagClass(seconds: number | null, error: string | null): string {
  if (error) return "tv-stale tv-stale-bad";
  if (seconds !== null && seconds > 60) return "tv-stale tv-stale-warn";
  return "tv-stale";
}

"use client";

import { useCallback, useEffect, useState } from "react";

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

type Fleet = {
  total: number;
  busy: number;
  available: number;
};

type RunningTrip = {
  doc_no: string;
  car: string;
  driver: string;
  route: string;
  round: string;
  out_at: string | null;
  out_minutes: number | null;
  out_seconds: number | null;
  from_base_m: number | null;
  eta_seconds: number | null;
  distance_km: number | null;
  bills: number;
  delivered: number;
  last_at: string | null;
  idle_minutes: number | null;
  status_label: string;
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

type LateBill = {
  bill_no: string;
  cust_name: string;
  area: string;
  due_label: string;
  days_late: number;
  late_minutes: number | null;
  has_due: boolean;
};

type TodoRow = {
  due_label: string;
  days_late: number;
  bills: number;
};

type Workload = {
  kpi_hours: number;
  total: number;
  on_time: number;
  late: number;
  on_time_percent: number;
  late_percent: number;
  scheduled: number;
  scheduled_on_time: number;
  scheduled_percent: number;
  unscheduled: number;
  unscheduled_on_time: number;
  unscheduled_percent: number;
  due_today: number;
  chase: number;
  delivered: number;
};

type Trail = {
  car_code: string;
  car_name: string;
  points: Array<[number, number]>;
};

type DriverRow = {
  name: string;
  car: string;
  trips: number;
  bills: number;
  delivered: number;
  cancelled: number;
  percent: number;
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
  branch_name: string;
  live: boolean;
  generated_at: string;
  totals: Totals;
  fleet: Fleet;
  running: RunningTrip[];
  not_started: NotStarted[];
  open_trips: OpenTrip[];
  cancelled: Cancelled[];
  feed: FeedRow[];
  vehicles: Vehicle[];
  trip_points: TripPoint[];
  trails: Trail[];
  drivers: DriverRow[];
  todo: TodoRow[];
  late_bills: LateBill[];
  workload: Workload;
};

const PAGES = [
  "ພາບລວມມື້ນີ້",
  "ຖ້ຽວກຳລັງແລ່ນ",
  "ຕ້ອງແກ້ດຽວນີ້",
  "ແຜນທີ່ສົດ",
  "ອັນດັບຄົນຂັບ",
  "ບິນທີ່ຊ້າ",
];

/**
 * ລັອກໜ້າ: /tv?page=1 ສະແດງແຕ່ "ພາບລວມມື້ນີ້" ບໍ່ໝຸນ.
 * 1=ພາບລວມ 2=ຖ້ຽວກຳລັງແລ່ນ 3=ຕ້ອງແກ້ດຽວນີ້ 4=ແຜນທີ່ສົດ 5=ອັນດັບຄົນຂັບ
 * ບໍ່ໃສ່ = ໝຸນຄົບທຸກໜ້າ.
 */
/**
 * ?page=N ລັອກໃຫ້ສະແດງໜ້ານັ້ນໜ້າດຽວ (ສຳລັບຈໍທີ່ມີໜ້າທີ່ຂອງມັນເອງ).
 * ບໍ່ໃສ່ = ໝຸນຄົບທຸກໜ້າ.
 */
function requestedPage(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("page");
  if (!raw) return null;
  const index = Number(raw) - 1;
  return Number.isInteger(index) && index >= 0 && index < PAGES.length ? index : null;
}

export default function TvPage() {
  const [data, setData] = useState<TvData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [locked, setLocked] = useState<number | null>(null);
  const [clock, setClock] = useState("");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

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

  // Read once on mount: the URL cannot change on a kiosk without a reload.
  useEffect(() => {
    const index = requestedPage();
    if (index === null) return;
    setLocked(index);
    setPage(index);
  }, []);

  // ໝຸນໜ້າເອງເມື່ອບໍ່ໄດ້ລັອກ — ຈໍດຽວຈຶ່ງເຫັນຂໍ້ມູນຄົບທຸກໜ້າ.
  // ກົດ Space ຢຸດ · ← → ປ່ຽນເອງ ເວລາມີຄົນຍ່າງມາເບິ່ງ.
  useEffect(() => {
    if (locked !== null) return;
    let paused = false;
    const timer = setInterval(() => {
      if (!paused) setPage((current) => (current + 1) % PAGES.length);
    }, PAGE_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") paused = !paused;
      else if (event.code === "ArrowRight")
        setPage((current) => (current + 1) % PAGES.length);
      else if (event.code === "ArrowLeft")
        setPage((current) => (current - 1 + PAGES.length) % PAGES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [locked]);

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
  // ວິນາທີທີ່ຜ່ານໄປນັບແຕ່ດຶງຂໍ້ມູນ — ບວກໃສ່ເວລາຈາກ server ໃຫ້ໂມງເດີນ
  const drift = staleSeconds ?? 0;

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
          {data.branch_name && (
            <span className="tv-branch">{data.branch_name}</span>
          )}
        </div>
        <nav className="tv-tabs">
          {locked !== null ? (
            <span className="tv-tab tv-tab-on">{PAGES[locked]}</span>
          ) : (
            PAGES.map((label, index) => (
              <span
                key={label}
                className={index === page ? "tv-tab tv-tab-on" : "tv-tab"}
              >
                {label}
              </span>
            ))
          )}
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
          <Overview totals={totals} percent={percent} data={data} drift={drift} />
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
            trails={data.trails}
            active={page === 3}
          />
        </Page>
        <Page active={page === 4}>
          <Drivers rows={data.drivers} />
        </Page>
        <Page active={page === 5}>
          <LateBills rows={data.late_bills} drift={drift} />
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

/**
 * ໜ້າພາບລວມ — 3 ແຖບເຕັມຄວາມກວ້າງ.
 *
 * ແບບເກົ່າໃຊ້ 3 ບັດຂ້າງກັນ ຈຶ່ງເສຍພື້ນທີ່ໄປກັບຂອບບັດ ແລະ ຊ່ອງຫວ່າງໃນບັດ
 * ຈົນຂໍ້ມູນຈິງກິນພື້ນທີ່ບໍ່ເຖິງເຄິ່ງຈໍ. ແບບນີ້ວາງເປັນແຖບ: ເທິງ = ໂຕເລກ
 * ທີ່ຕ້ອງເຫັນທຸກເມື່ອ, ກາງ = ວຽກທີ່ຕ້ອງລົງມື, ລຸ່ມ = ຖ້ຽວທີ່ກຳລັງແລ່ນ.
 */
function Overview({
  totals,
  percent,
  data,
  drift,
}: {
  totals: Totals;
  percent: number;
  data: TvData;
  drift: number;
}) {
  const work = data.workload;
  const fleet = data.fleet ?? { total: 0, busy: 0, available: 0 };
  const stalled = data.running.filter((trip) => trip.state === "stalled").length;
  const dayTone = percent >= 80 ? "ok" : percent >= 50 ? "warn" : "bad";
  return (
    <div className="tv-overview">
      <div className="tv-top">
        <DonutHighlight
          percent={percent}
          done={totals.delivered}
          total={totals.bills}
          onTruck={work.scheduled}
        />

        <div className="tv-right">
        <FlowBand
          delivered={totals.delivered}
          onTruck={work.scheduled}
          unscheduled={work.unscheduled}
          onTimePercent={work.on_time_percent}
          latePercent={work.late_percent}
          onTime={work.on_time}
          late={work.late}
          kpiHours={work.kpi_hours}
        />

          <TodoBand rows={data.todo} />
        </div>
      </div>

      <div className="tv-trips">
        <div className="tv-trips-head">
          <span>ຖ້ຽວກຳລັງແລ່ນ</span>
          <span className="tv-fleet-kpi">
            <span className="tv-fleet-total">🚚 ລົດທັງໝົດ <b>{fleet.total}</b> ຄັນ</span>
            <span className="tv-fleet-free">ວ່າງ <b>{fleet.available}</b> ຄັນ</span>
            <span className="tv-fleet-busy">ມີວຽກ <b>{fleet.busy}</b> ຄັນ</span>
          </span>
          <span className="tv-trips-counts">
            ຖ້ຽວທັງໝົດ {totals.trips} · ອອກແລ້ວ {totals.trips_out} · ປິດຖ້ຽວແລ້ວ{" "}
            {totals.trips_closed}
            {data.not_started.length > 0 && (
              <span className="tv-count-warn">
                {" "}
                · ຍັງບໍ່ອອກ {data.not_started.length}
              </span>
            )}
            {stalled > 0 && <span className="tv-count-bad"> · ຊັກຊ້າ {stalled}</span>}
          </span>
        </div>
        <RunningStrip trips={data.running} drift={drift} />
      </div>
    </div>
  );
}

/**
 * ວົງແຫວນເປັນຈຸດເດັ່ນຂອງຈໍ — ກວມ 2 ຊ່ອງຂອງແຖບເທິງ.
 *
 * ວາດເສັ້ນດ້ວຍ stroke-dasharray ບໍ່ໃຊ້ library ກຣາຟ ເພາະຈໍ kiosk
 * ບໍ່ຄວນຂຶ້ນກັບ script ພາຍນອກ.
 */
function DonutHighlight({
  percent,
  done,
  total,
  onTruck,
}: {
  percent: number;
  done: number;
  total: number;
  onTruck: number;
}) {
  const tone = percent >= 80 ? "ok" : percent >= 50 ? "warn" : "bad";
  const color =
    tone === "ok"
      ? "var(--tv-ok)"
      : tone === "warn"
        ? "var(--tv-warn)"
        : "var(--tv-bad)";
  const radius = 76;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <div className="tv-hl">
      <svg viewBox="0 0 190 190" className="tv-hl-svg">
        <circle
          cx="95"
          cy="95"
          r={radius}
          fill="none"
          stroke="var(--tv-track)"
          strokeWidth={stroke}
        />
        <circle
          cx="95"
          cy="95"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform="rotate(-90 95 95)"
          className="tv-hl-arc"
        />
      </svg>
      <div className="tv-hl-mid">
        <span className="tv-hl-cap">ຖ້ຽວທີ່ອອກມື້ນີ້</span>
        <span className={`tv-hl-pct tv-tone-${tone}`}>{percent}%</span>
        <span className="tv-hl-count">
          ສົ່ງແລ້ວ {done}/{total} ບິນ
        </span>
        <span className="tv-hl-rest">ຍັງຢູ່ເທິງລົດ {onTruck}</span>
      </div>
    </div>
  );
}

/**
 * ແຖບໄຫລວຽກ — ບອກວ່າວຽກມື້ນີ້ຄ້າງຢູ່ຂັ້ນໃດແດ່ ໃນແຖບດຽວ.
 *
 * ໂຕເລກ 6 ອັນລອຍໆບອກຄ່າແຕ່ບໍ່ບອກຄວາມສຳພັນ. ແຖບນີ້ໃຫ້ເຫັນວ່າ ຈາກວຽກ
 * ທັງໝົດ ສ່ວນໃດຮອດລູກຄ້າແລ້ວ ສ່ວນໃດຢູ່ເທິງລົດ ແລະ ສ່ວນໃດຍັງບໍ່ອອກຈາກສາງ —
 * ຄວາມກວ້າງຂອງແຕ່ລະຊ່ວງຄືສັດສ່ວນຈິງ.
 */
function FlowBand({
  delivered,
  onTruck,
  unscheduled,
  onTimePercent,
  latePercent,
  onTime,
  late,
  kpiHours,
}: {
  delivered: number;
  onTruck: number;
  unscheduled: number;
  onTimePercent: number;
  latePercent: number;
  onTime: number;
  late: number;
  kpiHours: number;
}) {
  const total = delivered + onTruck + unscheduled;
  const steps = [
    { key: "done", label: "ສົ່ງແລ້ວ", value: delivered },
    { key: "truck", label: "ຢູ່ເທິງລົດ", value: onTruck },
    { key: "waiting", label: "ຍັງບໍ່ຈັດຖ້ຽວ", value: unscheduled },
  ];
  return (
    <div className="tv-flow">
      <div className="tv-flow-head">
        <span>ບິນທັງໝົດມື້ນີ້</span>
        <span className="tv-flow-total">{total.toLocaleString()}</span>
      </div>

      <div className="tv-flow-bar">
        {steps.map((step) => (
          <span
            key={step.key}
            className={`tv-flow-seg tv-seg-${step.key}`}
            style={{ flexGrow: Math.max(step.value, total > 0 ? total * 0.04 : 1) }}
          >
            {step.value}
          </span>
        ))}
      </div>

      <div className="tv-flow-legend">
        {steps.map((step) => (
          <span className="tv-flow-key" key={step.key}>
            <i className={`tv-flow-dot tv-seg-${step.key}`} />
            {step.label} <b>{step.value.toLocaleString()}</b>
          </span>
        ))}
      </div>

      <div className="tv-flow-kpi">
        <span className="tv-flow-kpi-part">
          ທັນ {kpiHours} ຊມ
          <b className="tv-tone-ok">{onTimePercent}%</b>
          <em>{onTime} ບິນ</em>
        </span>
        <span className="tv-flow-kpi-part">
          ເກີນ {kpiHours} ຊມ
          <b className="tv-tone-bad">{latePercent}%</b>
          <em>{late} ບິນ</em>
        </span>
      </div>
    </div>
  );
}

/**
 * ບິນທີ່ຕ້ອງຈັດເຂົ້າຖ້ຽວ ວາງເປັນແຜ່ນ ບໍ່ແມ່ນແຖບຍາວ.
 *
 * ແຖບຍາວກິນຄວາມກວ້າງເຄິ່ງຈໍເພື່ອບອກສິ່ງທີ່ໂຕເລກຂ້າງມັນບອກຢູ່ແລ້ວ.
 * ແຜ່ນນ້ອຍວາງໄດ້ຫຼາຍກ້ອນຕໍ່ແຖວ ຈຶ່ງເຫັນທຸກວັນພ້ອມກັນ.
 */
function TodoBand({ rows }: { rows: TodoRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.bills, 0);
  return (
    <div className="tv-todo">
      <div className="tv-todo-head">
        <span>ຕ້ອງຈັດເຂົ້າຖ້ຽວ</span>
        <span className="tv-todo-total">{total.toLocaleString()} ບິນ</span>
      </div>
      {rows.length === 0 ? (
        <div className="tv-todo-clear">ຈັດຄົບໝົດແລ້ວ</div>
      ) : (
        <div className="tv-tiles">
          {rows.map((row) => {
            const noDue = row.due_label === "ບໍ່ມີວັນສົ່ງ";
            const late = noDue
              ? "ຕ້ອງກຳນົດວັນ"
              : row.days_late < 0
                ? `ອີກ ${Math.abs(row.days_late)} ວັນ`
                : row.days_late === 0
                  ? "ມື້ນີ້"
                  : `ຊ້າ ${row.days_late} ວັນ`;
            const tone = noDue
              ? "warn"
              : row.days_late < 0
                ? "soon"
                : row.days_late === 0
                  ? "ok"
                  : row.days_late <= 1
                    ? "warn"
                    : "bad";
            return (
              <div className={`tv-tile tv-tile-${tone}`} key={row.due_label}>
                <span className="tv-tile-count">{row.bills}</span>
                <span className="tv-tile-due">{row.due_label}</span>
                <span className="tv-tile-late">{late}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * ແຖບຖ້ຽວທີ່ກຳລັງແລ່ນ ຢູ່ລຸ່ມສຸດຂອງໜ້າພາບລວມ.
 *
 * ຈໍມີໜ້າດຽວ ຈຶ່ງຕ້ອງເຫັນວ່າແຕ່ລະຄັນຄືບໜ້າເທົ່າໃດ ບໍ່ພຽງແຕ່ຍອດລວມ.
 */
function RunningStrip({
  trips,
  drift,
}: {
  trips: RunningTrip[];
  drift: number;
}) {
  if (trips.length === 0) {
    return <div className="tv-strip tv-strip-empty">ຍັງບໍ່ມີຖ້ຽວອອກແລ່ນ</div>;
  }
  const shown = trips.slice(0, 8);
  return (
    <div className="tv-strip">
      {shown.map((trip) => {
        const percent = trip.bills > 0 ? Math.round((trip.delivered / trip.bills) * 100) : 0;
        // ສະຖານະທີ່ບອກຫຍັງໄດ້ຫຼາຍກວ່າ "ກຳລັງຈັດສົ່ງ" ຊະນະຄຳສັບມາດຕະຖານ:
        // ຄົນເບິ່ງຈໍຢາກຮູ້ວ່າຄັນໃດຄ້າງ ບໍ່ແມ່ນວ່າຄັນໃດຍັງແລ່ນຢູ່.
        const status =
          trip.state === "done"
            ? "ຄົບແລ້ວ ລໍປິດຖ້ຽວ"
            : trip.state === "stalled"
              ? `ຄ້າງ ${trip.idle_minutes !== null ? durationLabel(trip.idle_minutes) : ""}`
              : trip.status_label;
        return (
          <div className={`tv-scard tv-scard-${trip.state}`} key={trip.doc_no}>
            <div className="tv-scard-top">
              <span className="tv-scard-car">{trip.car}</span>
              <span className="tv-scard-doc">{trip.doc_no}</span>
              <span className="tv-scard-count">
                {trip.delivered}/{trip.bills}
              </span>
            </div>
            <div className="tv-scard-bar">
              <div className="tv-scard-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="tv-scard-status">{status}</div>
            <div className="tv-scard-meta">
              {trip.out_at ? `ອອກ ${trip.out_at}` : "ບໍ່ມີເວລາອອກ"}
              {trip.out_seconds !== null && (
                <span className="tv-scard-run">
                  {" · "}
                  {clockLabel(trip.out_seconds + drift)}
                </span>
              )}
            </div>
            <div className="tv-scard-driver">
              {trip.driver}
              {trip.distance_km !== null && (
                <span className="tv-scard-km"> · ແລ່ນ {trip.distance_km} ກມ</span>
              )}
              {trip.from_base_m !== null && (
                <span className="tv-scard-km">
                  {" · ຫ່າງສາງ "}
                  {distanceLabel(trip.from_base_m)}
                </span>
              )}
            </div>
            {trip.eta_seconds !== null && trip.eta_seconds > 0 && (
              <div className="tv-scard-eta">
                ຄາດສຳເລັດ {etaClock(trip.eta_seconds - drift)}
              </div>
            )}
          </div>
        );
      })}
      {trips.length > shown.length && (
        <div className="tv-scard tv-scard-more">+{trips.length - shown.length}</div>
      )}
    </div>
  );
}

// ── ໜ້າ 2: ຖ້ຽວກຳລັງແລ່ນ ເຕັມຈໍ ──────────────────────────────────────

function Running({ trips }: { trips: RunningTrip[] }) {
  if (trips.length === 0) return <Empty text="ຍັງບໍ່ມີຖ້ຽວອອກແລ່ນ" />;
  // ຈໍບໍ່ເລື່ອນ: ແບ່ງ 2 ຖັນ ແລະ ຈຳກັດຈຳນວນທີ່ໜຶ່ງຈໍຮັບໄດ້
  const shown = trips.slice(0, 16);
  const half = Math.ceil(shown.length / 2);
  return (
    <div className="tv-two-col">
      <div className="tv-col">
        {shown.slice(0, half).map((trip) => (
          <TripRow key={trip.doc_no} trip={trip} />
        ))}
      </div>
      <div className="tv-col">
        {shown.slice(half).map((trip) => (
          <TripRow key={trip.doc_no} trip={trip} />
        ))}
      </div>
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
        {trip.out_at ? `ອອກ ${trip.out_at}` : "ບໍ່ມີເວລາອອກ"}
        {trip.out_minutes !== null && ` · ${durationLabel(trip.out_minutes)}`}
        {trip.state === "stalled" && trip.idle_minutes !== null && (
          <span className="tv-flag"> · ຄ້າງ {durationLabel(trip.idle_minutes)}</span>
        )}
        {trip.state === "done" && <span className="tv-flag-ok"> · ຄົບແລ້ວ ລໍປິດຖ້ຽວ</span>}
      </div>
    </div>
  );
}

// ── ໜ້າ 3: ຕ້ອງແກ້ດຽວນີ້ ──────────────────────────────────────────────

function Alerts({ data }: { data: TvData }) {
  return (
    <div className="tv-alerts">
      <AlertPanel
        title={`ຍັງບໍ່ອອກຈາກສາງ (${data.not_started.length})`}
        empty="ອອກຄົບທຸກຖ້ຽວແລ້ວ"
        rows={data.not_started.slice(0, 6).map((trip) => ({
          key: trip.doc_no,
          main: `${trip.car} · ${trip.driver}`,
          side: trip.status_label,
          tone: trip.approved ? ("warn" as const) : ("bad" as const),
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
          tone: trip.days_open >= 3 ? ("bad" as const) : ("warn" as const),
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

// ── ໜ້າ 4: ແຜນທີ່ສົດ ─────────────────────────────────────────────────

function Vehicles({
  vehicles,
  tripPoints,
  trails,
  active,
}: {
  vehicles: Vehicle[];
  tripPoints: TripPoint[];
  trails: Trail[];
  active: boolean;
}) {
  if (vehicles.length === 0 && tripPoints.length === 0) {
    return <Empty text="ຍັງບໍ່ມີພິກັດຈາກລົດ ຫຼື ຈາກການສົ່ງ" />;
  }
  const moving = vehicles.filter((v) => v.moving && !v.stale).length;
  const stopped = vehicles.filter((v) => !v.moving && !v.stale).length;
  const stale = vehicles.filter((v) => v.stale).length;
  return (
    <div className="tv-vehicles">
      {/* ແຖບດຽວແນວນອນ — ຕົວເລກກັບສີຢູ່ນຳກັນ ບໍ່ຕ້ອງມີ legend ແຍກ */}
      <div className="tv-vhead">
        <span className="tv-vhead-title">ແຜນທີ່ສົດ</span>
        <VStat tone="move" label="ກຳລັງແລ່ນ" value={moving} />
        <VStat tone="stop" label="ຈອດຢູ່" value={stopped} />
        <VStat tone="stale" label="ຂາດສັນຍານ" value={stale} />
        <VStat tone="bill" label="ຈຸດສົ່ງລ່າສຸດ" value={tripPoints.length} />
        <VStat tone="trail" label="ມີເສັ້ນທາງ" value={trails.length} />
      </div>
      <TvMap
        vehicles={vehicles}
        tripPoints={tripPoints}
        trails={trails}
        active={active}
      />
    </div>
  );
}

function VStat({
  tone,
  label,
  value,
}: {
  tone: "move" | "stop" | "stale" | "bill" | "trail";
  label: string;
  value: number;
}) {
  return (
    <span className="tv-vstat">
      <i className={`tv-vdot tv-vdot-${tone}`} />
      <b>{value.toLocaleString()}</b>
      {label}
    </span>
  );
}

// ── ໜ້າ 5: ອັນດັບຄົນຂັບ ───────────────────────────────────────────────

function Drivers({ rows }: { rows: DriverRow[] }) {
  if (rows.length === 0) return <Empty text="ຍັງບໍ່ມີຖ້ຽວທີ່ມີຄົນຂັບ" />;
  const shown = rows.slice(0, 12);
  const half = Math.ceil(shown.length / 2);
  const columns = [shown.slice(0, half), shown.slice(half)];
  return (
    <div className="tv-two-col">
      {columns.map((column, columnIndex) => (
        <div className="tv-col" key={columnIndex}>
          {column.map((row, index) => {
            const rank = columnIndex * half + index + 1;
            const tone =
              row.percent >= 95 ? "good" : row.percent >= 70 ? "warn" : "bad";
            return (
              <div className="tv-drv" key={`${row.name}-${row.car}-${rank}`}>
                <span className={rank <= 3 ? "tv-drv-rank tv-drv-top" : "tv-drv-rank"}>
                  {rank}
                </span>
                <span className="tv-drv-main">
                  <span className="tv-drv-name">{row.name}</span>
                  <span className="tv-drv-meta">
                    {row.car} · ຖ້ຽວ {row.trips} · ບິນ {row.bills}
                    {row.cancelled > 0 && ` · ຍົກເລີກ ${row.cancelled}`}
                  </span>
                </span>
                <span className="tv-drv-right">
                  <span className={`tv-drv-pct tv-tone-${tone}`}>{row.percent}%</span>
                  <span className="tv-drv-sub">
                    {row.delivered}/{row.bills}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * ບິນທີ່ເລີຍກຳນົດ ເປັນລາຍບິນ — ໜ້າສຳລັບຈໍທີສອງໃນຫ້ອງຈັດຖ້ຽວ.
 *
 * ໜ້າສະຫຼຸບບອກແຕ່ "31 ບິນ" ແລະ "ຊ້າ 22 ວັນ" ແຕ່ບໍ່ບອກວ່າແມ່ນບິນໃດ
 * ລູກຄ້າໃດ — ຄົນເບິ່ງຈຶ່ງຍັງຕ້ອງໄປເປີດຄອມຫາຕໍ່. ໜ້ານີ້ບອກໃຫ້ຄົບ.
 */
function LateBills({ rows, drift }: { rows: LateBill[]; drift: number }) {
  if (rows.length === 0) {
    return <Empty text="ບໍ່ມີບິນທີ່ເລີຍກຳນົດ" />;
  }
  // ຈໍບໍ່ເລື່ອນ — ແບ່ງ 2 ຖັນ ແລ້ວຈຳກັດຕາມທີ່ໜຶ່ງຈໍຮັບໄດ້
  const shown = rows.slice(0, 24);
  const half = Math.ceil(shown.length / 2);
  const columns = [shown.slice(0, half), shown.slice(half)];
  return (
    <div className="tv-late">
      <div className="tv-late-head">
        <span>ບິນທີ່ຊ້າ ແລະ ຍັງບໍ່ຈັດຖ້ຽວ</span>
        <span className="tv-late-total">{rows.length.toLocaleString()} ບິນ</span>
      </div>
      <div className="tv-late-cols">
        {columns.map((column, columnIndex) => (
          <div className="tv-late-col" key={columnIndex}>
            {column.map((row) => {
              const tone = !row.has_due
                ? "warn"
                : row.days_late >= 7
                  ? "bad"
                  : row.days_late >= 2
                    ? "warn"
                    : "soon";
              return (
                <div className={`tv-late-row tv-late-${tone}`} key={row.bill_no}>
                  <span className="tv-late-days">
                    {row.has_due
                      ? lateLabel((row.late_minutes ?? 0) + drift / 60)
                      : "ບໍ່ມີວັນ"}
                  </span>
                  <span className="tv-late-main">
                    <span className="tv-late-cust">{row.cust_name}</span>
                    <span className="tv-late-meta">
                      {row.bill_no}
                      {row.area && ` · ${row.area}`}
                    </span>
                  </span>
                  <span className="tv-late-due">{row.due_label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {rows.length > shown.length && (
        <div className="tv-late-rest">
          ແລະ ອີກ {rows.length - shown.length} ບິນ
        </div>
      )}
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

/**
 * ເວລາໂມງທີ່ຄາດວ່າຈະສົ່ງຄົບ — ບອກເປັນເວລາຈິງ (16:10) ບໍ່ແມ່ນ "ອີກ 90 ນາທີ"
 * ເພາະຄົນເບິ່ງຈໍຢາກຮູ້ວ່າຈະລໍຮອດຈັກໂມງ ບໍ່ແມ່ນຄິດເລກເອງ.
 */
function etaClock(secondsLeft: number): string {
  const at = new Date(Date.now() + Math.max(0, secondsLeft) * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** ໄລຍະຫ່າງ — ຕ່ຳກວ່າ 1 ກມ ບອກເປັນແມັດ ເພາະ "0.4 ກມ" ອ່ານຍາກກວ່າ "400 ມ". */
function distanceLabel(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)} ມ`
    : `${(metres / 1000).toFixed(1)} ກມ`;
}

/**
 * ຊ້າມາດົນປານໃດແທ້ — ນັບຈາກເສັ້ນຕາຍ ບໍ່ແມ່ນປັດເປັນວັນ.
 * ບິນທີ່ກຳນົດມື້ວານ ຮອດບ່າຍນີ້ຄື "13 ຊມ" ບໍ່ແມ່ນ "1 ວັນ".
 */
function lateLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days} ວັນ ${hours} ຊມ` : `${days} ວັນ`;
  if (hours > 0) return `${hours} ຊມ`;
  return `${total} ນທ`;
}

/** ເວລາທີ່ໃຊ້ໄປ ແບບ ຊ:ນນ:ວວ — ເດີນທຸກວິນາທີເທິງຈໍ. */
function clockLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

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

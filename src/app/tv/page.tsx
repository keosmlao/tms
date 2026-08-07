"use client";

import { useCallback, useEffect, useState } from "react";

import { podAgoLabel } from "@/lib/pod";
import "./tv.css";


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
  last_stop: string;
  place_is_live: boolean;
  last_stop_at: string;
  has_tracker: boolean;
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

type OpenCutoff = {
  cutoff: string;
  total: number;
  before: number;
  after: number;
  percent: number;
  minutes_left: number;
};

type QueueJump = {
  bill_no: string;
  cust_name: string;
  opened_display: string;
  skipped: number;
  oldest_waiting: string;
};

/** ຫຼັກຖານການສົ່ງລ່າສຸດ — ຮູບບໍ່ໄດ້ມາກັບ payload ນີ້ (ດຶງຜ່ານ /api/tv/pod-photo) */
type PodRecent = {
  bill_no: string;
  doc_no: string;
  cust_name: string;
  driver_name: string;
  closed_at: string;
  closed_seconds_ago: number;
  has_photo: boolean;
  photo_count: number;
  has_signature: boolean;
  has_gps: boolean;
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
  screen: { pages: string; secs: number };
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
  open_cutoff: OpenCutoff;
  queue_jumped: QueueJump[];
  pod_recent: PodRecent[];
};

const PAGES = ["ພາບລວມມື້ນີ້", "ຕ້ອງແກ້ດຽວນີ້", "ບິນທີ່ຊ້າ", "ບິນລັດຄິວ"];

/**
 * ລັອກໜ້າ: /tv?page=1 ສະແດງແຕ່ "ພາບລວມມື້ນີ້" ບໍ່ໝຸນ.
 * 1=ພາບລວມ 2=ຖ້ຽວກຳລັງແລ່ນ 3=ຕ້ອງແກ້ດຽວນີ້ 4=ແຜນທີ່ສົດ 5=ອັນດັບຄົນຂັບ
 * ບໍ່ໃສ່ = ໝຸນຄົບທຸກໜ້າ.
 */
/**
 * ຕັ້ງຄ່າວ່າຈໍນີ້ຈະສະແດງໜ້າໃດແດ່ — ຜ່ານ URL ຈຶ່ງແຕ່ລະຈໍຕັ້ງເອງໄດ້
 * ໂດຍບໍ່ຕ້ອງມີໜ້າຕັ້ງຄ່າ ແລະ ບໍ່ຕ້ອງ login.
 *
 *   ?pages=1,3   ສະແດງແຕ່ໜ້າ 1 ກັບ 3 ໝຸນສະຫຼັບກັນ
 *   ?page=2      ໜ້າດຽວ ບໍ່ໝຸນ (ຄືກັບ ?pages=2)
 *   ?secs=30     ປ່ຽນໜ້າທຸກ 30 ວິນາທີ (ຕັ້ງຕົ້ນ 20)
 *   ບໍ່ໃສ່        ໝຸນຄົບທຸກໜ້າ
 */
function readConfig(saved?: {
  pages: string;
  secs: number;
}): { pages: number[]; intervalMs: number } {
  const all = PAGES.map((_, index) => index);
  if (typeof window === "undefined") return { pages: all, intervalMs: PAGE_MS };
  const params = new URLSearchParams(window.location.search);

  // URL ຊະນະຄ່າທີ່ຕັ້ງໄວ້ — ຈໍໜຶ່ງໜ່ວຍຢາກເບິ່ງໜ້າອື່ນຊົ່ວຄາວກໍ່ເຮັດໄດ້
  const raw = params.get("pages") ?? params.get("page") ?? saved?.pages ?? "";
  const picked = raw
    .split(",")
    .map((part) => Number(part.trim()) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < PAGES.length);

  const secs = Number(params.get("secs") ?? saved?.secs);
  const intervalMs =
    Number.isFinite(secs) && secs >= 5 ? Math.round(secs) * 1000 : PAGE_MS;

  // ເອົາຊ້ຳອອກ ແລະ ຮັກສາລຳດັບທີ່ຜູ້ໃຊ້ພິມ
  const unique = [...new Set(picked)];
  return { pages: unique.length > 0 ? unique : all, intervalMs };
}

export default function TvPage() {
  const [data, setData] = useState<TvData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  // ໜ້າທີ່ຈໍນີ້ຕັ້ງໄວ້ໃຫ້ສະແດງ ແລະ ຄວາມໄວການໝຸນ
  const [config, setConfig] = useState<{ pages: number[]; intervalMs: number }>({
    pages: PAGES.map((_, index) => index),
    intervalMs: PAGE_MS,
  });
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
  // ອ່ານຫຼັງໄດ້ຂໍ້ມູນຮອບທຳອິດ ເພື່ອໃຫ້ໄດ້ຄ່າທີ່ຜູ້ຈັດການຕັ້ງໄວ້ນຳ
  const screen = data?.screen;
  useEffect(() => {
    if (!screen) return;
    const next = readConfig(screen);
    setConfig(next);
    setPage(next.pages[0]);
  }, [screen?.pages, screen?.secs]);

  // ໝຸນໜ້າເອງເມື່ອບໍ່ໄດ້ລັອກ — ຈໍດຽວຈຶ່ງເຫັນຂໍ້ມູນຄົບທຸກໜ້າ.
  // ກົດ Space ຢຸດ · ← → ປ່ຽນເອງ ເວລາມີຄົນຍ່າງມາເບິ່ງ.
  useEffect(() => {
    const list = config.pages;
    const step = (delta: number) =>
      setPage((current) => {
        const at = list.indexOf(current);
        const next = (at < 0 ? 0 : at + delta + list.length) % list.length;
        return list[next];
      });
    let paused = false;
    // ໜ້າດຽວກໍ່ບໍ່ຕ້ອງໝຸນ ແຕ່ຍັງໃຫ້ກົດປ່ຽນເອງໄດ້
    const timer =
      list.length > 1
        ? setInterval(() => {
            if (!paused) step(1);
          }, config.intervalMs)
        : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") paused = !paused;
      else if (event.code === "ArrowRight") step(1);
      else if (event.code === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [config]);

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
          {config.pages.map((index) => (
            <span
              key={PAGES[index]}
              className={index === page ? "tv-tab tv-tab-on" : "tv-tab"}
            >
              {PAGES[index]}
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
          <Overview totals={totals} percent={percent} data={data} drift={drift} />
        </Page>
        <Page active={page === 1}>
          <Alerts data={data} />
        </Page>
        <Page active={page === 2}>
          <LateBills rows={data.late_bills} drift={drift} />
        </Page>
        <Page active={page === 3}>
          <QueueJumped rows={data.queue_jumped} />
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
          open={data.open_cutoff}
        />

          <TodoBand rows={data.todo} jumped={data.queue_jumped.length} />
        </div>
      </div>

      <div className="tv-bottom">
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
      <PodStrip rows={data.pod_recent ?? []} drift={drift} />
      </div>
    </div>
  );
}

/**
 * ຫຼັກຖານການສົ່ງ 2 ໃບລ່າສຸດ — ຫ້ອງຈັດສົ່ງເຫັນທັນທີວ່າຄົນຂັບປິດບິນດ້ວຍຮູບແນວໃດ.
 *
 * ຮູບບໍ່ໄດ້ມາກັບ payload ຫຼັກ (ໃບໜຶ່ງ 100–400 KB, ຈໍ poll ທຸກ 15 ວິ) —
 * ດຶງເປັນ <img> ຕໍ່ບິນຈາກ /api/tv/pod-photo ແລ້ວ browser cache ໄວ້ເອງ, ຮູບຈຶ່ງ
 * ໂຫຼດເທື່ອດຽວຕໍ່ບິນ ບໍ່ແມ່ນທຸກຮອບ.
 */
function PodStrip({ rows, drift }: { rows: PodRecent[]; drift: number }) {
  // key ຢູ່ໃນ URL ຂອງຈໍ — ອ່ານຫຼັງ mount ເພື່ອບໍ່ໃຫ້ SSR ກັບ client ບໍ່ກົງກັນ
  const [tvKey, setTvKey] = useState<string | null>(null);
  useEffect(() => {
    setTvKey(new URLSearchParams(window.location.search).get("key") ?? "");
  }, []);

  return (
    <div className="tv-pod">
      <div className="tv-pod-head">
        <span>ຫຼັກຖານການສົ່ງລ່າສຸດ</span>
        <span className="tv-pod-sub">ຮູບ · ລາຍເຊັນ · GPS</span>
      </div>
      {rows.length === 0 ? (
        <Empty text="ຍັງບໍ່ມີບິນທີ່ປິດ" />
      ) : (
        rows.map((row) => (
          <div className="tv-pod-card" key={`${row.doc_no}-${row.bill_no}`}>
            <div className="tv-pod-shot">
              {row.has_photo && tvKey !== null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/tv/pod-photo?key=${encodeURIComponent(
                    tvKey
                  )}&bill=${encodeURIComponent(row.bill_no)}&doc=${encodeURIComponent(
                    row.doc_no
                  )}`}
                  alt={row.bill_no}
                />
              ) : (
                <span className="tv-pod-nophoto">ບໍ່ມີຮູບ</span>
              )}
              {row.photo_count > 1 && (
                <span className="tv-pod-count">{row.photo_count} ຮູບ</span>
              )}
            </div>
            <div className="tv-pod-body">
              <div className="tv-pod-cust">{row.cust_name}</div>
              <div className="tv-pod-meta">
                {row.driver_name} · {row.closed_at}{" "}
                <span className="tv-pod-ago">
                  ({podAgoLabel(row.closed_seconds_ago + drift)})
                </span>
              </div>
              <div className="tv-pod-flags">
                <span className={row.has_photo ? "tv-pod-ok" : "tv-pod-bad"}>
                  {row.has_photo ? "✓" : "✕"} ຮູບ
                </span>
                <span className={row.has_signature ? "tv-pod-ok" : "tv-pod-off"}>
                  {row.has_signature ? "✓" : "✕"} ລາຍເຊັນ
                </span>
                <span className={row.has_gps ? "tv-pod-ok" : "tv-pod-bad"}>
                  {row.has_gps ? "✓" : "✕"} GPS
                </span>
              </div>
            </div>
          </div>
        ))
      )}
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
  open,
}: {
  delivered: number;
  onTruck: number;
  unscheduled: number;
  onTimePercent: number;
  latePercent: number;
  onTime: number;
  late: number;
  kpiHours: number;
  open: OpenCutoff;
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

      <CutoffRow open={open} />
    </div>
  );
}

/**
 * ເປີດບິນສົ່ງທັນກຳນົດ 15:00 ບໍ.
 *
 * ຈຸດປະສົງແມ່ນໃຫ້ຫ້ອງຂາຍເຫັນວ່າຍັງເຫຼືອເວລາເທົ່າໃດ ກ່ອນບິນທີ່ເປີດຈະຈັດລົງ
 * ຖ້ຽວມື້ນັ້ນບໍ່ທັນ — ຈຶ່ງເອົາເວລາທີ່ເຫຼືອໄວ້ຂວາສຸດເປັນປ້າຍສີ.
 * ພໍເລີຍ 15:00 ແລ້ວ ໂຕນັບຖອຍຫຼັງປ່ຽນເປັນ "ໝົດເວລາແລ້ວ".
 *
 * ຢູ່ໃນກາດ "ບິນທັງໝົດມື້ນີ້" ບໍ່ແມ່ນກາດຂອງຕົນເອງ — ຈໍຫ້ອງຈັດສົ່ງບາງໜ່ວຍສູງ
 * ພຽງ 919px ແລະ ກາດເພີ່ມອີກໜຶ່ງໜ່ວຍ (ຂອບ+ຊ່ອງ ~40px) ດັນໃຫ້ບັດຖ້ຽວລົ້ນຈໍ.
 *
 * ນັບທົ່ວບໍລິສັດ ບໍ່ແຍກສາຂາ — ເບິ່ງເຫດຜົນໃນ tv-dashboard.js
 */
function CutoffRow({ open }: { open: OpenCutoff }) {
  const late = open.after > 0;
  const tone = open.percent >= 90 ? "ok" : open.percent >= 75 ? "warn" : "bad";
  const left = open.minutes_left;
  const leftLabel =
    left > 0
      ? `ຍັງເຫຼືອ ${Math.floor(left / 60)} ຊມ ${String(left % 60).padStart(2, "0")} ນທ`
      : "ໝົດເວລາແລ້ວ";
  return (
    <div className="tv-cutoff">
      <span className="tv-cutoff-head">
        ເປີດບິນສົ່ງ
        <b>{open.total.toLocaleString()}</b>
      </span>

      <span className="tv-cutoff-part">
        ກ່ອນ {open.cutoff}
        <b className={`tv-tone-${tone}`}>{open.percent}%</b>
        <em>{open.before.toLocaleString()} ບິນ</em>
      </span>

      <span className="tv-cutoff-part">
        ຫຼັງ {open.cutoff}
        <b className={late ? "tv-tone-bad" : "tv-tone-ok"}>{open.after.toLocaleString()}</b>
        <em>ບິນ</em>
      </span>

      <span className={`tv-cutoff-left${left > 0 ? "" : " tv-cutoff-left-done"}`}>
        {leftLabel}
      </span>
    </div>
  );
}

/**
 * ບິນທີ່ຕ້ອງຈັດເຂົ້າຖ້ຽວ ວາງເປັນແຜ່ນ ບໍ່ແມ່ນແຖບຍາວ.
 *
 * ແຖບຍາວກິນຄວາມກວ້າງເຄິ່ງຈໍເພື່ອບອກສິ່ງທີ່ໂຕເລກຂ້າງມັນບອກຢູ່ແລ້ວ.
 * ແຜ່ນນ້ອຍວາງໄດ້ຫຼາຍກ້ອນຕໍ່ແຖວ ຈຶ່ງເຫັນທຸກວັນພ້ອມກັນ.
 */
function TodoBand({ rows, jumped }: { rows: TodoRow[]; jumped: number }) {
  const total = rows.reduce((sum, row) => sum + row.bills, 0);
  return (
    <div className="tv-todo">
      <div className="tv-todo-head">
        <span>ຕ້ອງຈັດເຂົ້າຖ້ຽວ</span>
        {/* ຢູ່ໃນຫົວແຖບເກົ່າ ບໍ່ແມ່ນແຖວໃໝ່ — ຈໍຫ້ອງຈັດສົ່ງສູງພຽງ 919px
            ການເພີ່ມແຖວຈະດັນບັດຖ້ຽວລຸ່ມສຸດຕົກຈໍ. ວາງຄູ່ກັບ "ຕ້ອງຈັດເຂົ້າຖ້ຽວ"
            ເພາະເປັນເລື່ອງລຳດັບການຈັດຄືກັນ */}
        {jumped > 0 && (
          <span className="tv-todo-jump">ລັດຄິວ {jumped.toLocaleString()}</span>
        )}
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
            </div>
            {trip.last_stop && (
              <div className="tv-scard-where">
                📍 {trip.last_stop}
                {!trip.place_is_live && trip.last_stop_at && ` · ${trip.last_stop_at}`}
              </div>
            )}
            {trip.from_base_m !== null && (
              <div className="tv-scard-where">
                🚚 ຫ່າງສາງ {distanceLabel(trip.from_base_m)}
              </div>
            )}
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

/**
 * ບິນທີ່ເລີຍກຳນົດ ເປັນລາຍບິນ — ໜ້າສຳລັບຈໍທີສອງໃນຫ້ອງຈັດຖ້ຽວ.
 *
 * ໜ້າສະຫຼຸບບອກແຕ່ "31 ບິນ" ແລະ "ຊ້າ 22 ວັນ" ແຕ່ບໍ່ບອກວ່າແມ່ນບິນໃດ
 * ລູກຄ້າໃດ — ຄົນເບິ່ງຈຶ່ງຍັງຕ້ອງໄປເປີດຄອມຫາຕໍ່. ໜ້ານີ້ບອກໃຫ້ຄົບ.
 */
/**
 * ບິນລັດຄິວ — ເປີດຫຼັງ ແຕ່ຖືກຈັດເຂົ້າຖ້ຽວກ່ອນ ຂະນະທີ່ບິນເກົ່າກວ່າຍັງຄ້າງ.
 *
 * ທຽບສະເພາະບິນທີ່ນັດສົ່ງວັນດຽວກັນ ແລະ ສາຂາດຽວກັນ — ເບິ່ງເຫດຜົນໃນ
 * tv-dashboard.js. ສະແດງເວລາຂອງບິນເກົ່າສຸດທີ່ຖືກແຊງນຳ ເພາະ "ແຊງ 2 ໃບ"
 * ຢ່າງດຽວບໍ່ບອກວ່າຄວນໄປແກ້ບິນໃດ.
 */
function QueueJumped({ rows }: { rows: QueueJump[] }) {
  if (rows.length === 0) {
    return <Empty text="ບໍ່ມີບິນລັດຄິວ — ຈັດຕາມລຳດັບການເປີດບິນ" />;
  }
  // ຈໍບໍ່ເລື່ອນ — 2 ຖັນ × 6 ແຖວ ຄືທີ່ຈໍເຕ້ຍ (ວັດແລ້ວ 919px) ຮັບໄດ້ພໍດີ
  const shown = rows.slice(0, 12);
  const half = Math.ceil(shown.length / 2);
  const columns = [shown.slice(0, half), shown.slice(half)];
  return (
    <div className="tv-late">
      <div className="tv-late-head">
        <span>ບິນລັດຄິວ · ບິນລຸ່ມນີ້ຈັດຖ້ຽວແລ້ວ ແຕ່ບິນທີ່ເປີດກ່ອນມັນຍັງບໍ່ໄດ້ຈັດ</span>
        <span className="tv-late-total">{rows.length.toLocaleString()} ບິນ</span>
      </div>
      <div className="tv-late-cols">
        {columns.map((column, columnIndex) => (
          <div className="tv-late-col" key={columnIndex}>
            {column.map((row) => (
              <div className="tv-late-row tv-late-row-jump tv-late-warn" key={row.bill_no}>
                <span className="tv-late-days">
                  ແຊງ {row.skipped} ໃບ
                </span>
                <span className="tv-late-main">
                  <span className="tv-late-cust">{row.cust_name}</span>
                  <span className="tv-late-meta">
                    {row.bill_no} · ເປີດ {row.opened_display} · ຈັດຖ້ຽວແລ້ວ
                  </span>
                </span>
                {/* ເວລານີ້ເປັນຂອງ "ບິນອື່ນ" ບໍ່ແມ່ນບິນໃນແຖວນີ້ — ຕ້ອງຂຽນປ້າຍ
                    ໃຫ້ຊັດ ບໍ່ດັ່ງນັ້ນຄົນອ່ານຄິດວ່າເປັນເວລາຂອງບິນດຽວກັນ */}
                {row.oldest_waiting && (
                  <span className="tv-late-due tv-late-due-since">
                    <em>ບິນເກົ່າສຸດທີ່ຍັງຄອຍ</em>
                    <b>{row.oldest_waiting}</b>
                  </span>
                )}
              </div>
            ))}
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
      {/* ຕ້ອງມີກ່ອງນີ້ຫຸ້ມ: track ຖືກ translateX ທັງກ່ອງ ຖ້າບໍ່ຕັດຢູ່ນີ້
          ໜັງສືຈະແລ່ນອອກນອກກ່ອງໄປທັບປ້າຍ "ສຳເລັດລ່າສຸດ" ເບື້ອງຊ້າຍ */}
      <div className="tv-ticker-viewport">
        <div className="tv-ticker-track">
          {stream.map((row, index) => (
            <span className="tv-ticker-item" key={`${row.bill_no}-${index}`}>
              <b>{row.at ?? ""}</b> {row.cust_name}
              <em>{row.driver}</em>
            </span>
          ))}
        </div>
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

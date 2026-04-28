const { pool, query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterShipment,
} = require("./helpers");

const trackingCache = globalThis;
const REALTIME_PROVIDER_MIN_GAP_MS = Math.max(
  0,
  Number.parseInt(
    process.env.GPS_TRACKER_REALTIME_MIN_GAP_MS ??
      process.env.GPS_TRACKER_MIN_GAP_MS ??
      "1200",
    10
  ) || 1200
);
const REALTIME_DB_FRESH_MS = Math.max(
  5_000,
  Number.parseInt(
    process.env.GPS_TRACKER_REALTIME_DB_FRESH_MS ?? "55000",
    10
  ) || 55_000
);

// ==================== Tracking ====================

async function trackBill(session, search) {
  const scope = getBranchScope(session);
  const branchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM public.ic_trans_shipment __ts WHERE __ts.doc_no = a.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  const row = await queryOne(`SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date, bill_no, to_char(bill_date,'DD-MM-YYYY') as bill_date,
      a.car as car_code, c.name_1 as car, d.name_1 as driver, b2.code as driver_code,
      COALESCE(b2.employee_photo, '') as driver_photo,
      c.imei as car_imei,
      url_img, COALESCE(a.sight_img, '') as sight_img,
      a.lat, a.lng, a.lat_end, a.lng_end, a.remark,
      COALESCE(a.status, 0) as bill_status,
      (SELECT json_agg(row) FROM (
        SELECT to_char(create_date_time_now,'DD-MM-YYYY') as doc_date, to_char(create_date_time_now,'HH:MI') as doc_time, 'ຈັດຖ້ຽວແລ້ວ' as status, '' as remark FROM odg_tms_detail WHERE recipt_job IS NULL AND bill_no=a.bill_no
        UNION ALL SELECT to_char(recipt_job,'DD-MM-YYYY'), to_char(recipt_job,'HH:MI'), 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ', '' FROM odg_tms_detail WHERE recipt_job IS NOT NULL AND bill_no=a.bill_no
        UNION ALL SELECT to_char(sent_start,'DD-MM-YYYY'), to_char(sent_start,'HH:MI'), 'ເລີ່ມຈັດສົ່ງ', '' FROM odg_tms_detail WHERE sent_start IS NOT NULL AND bill_no=a.bill_no
        UNION ALL SELECT to_char(sent_end,'DD-MM-YYYY'), to_char(sent_end,'HH:MI'), case when status=2 then 'ຍົກເລີກຈັດສົ່ງ' else 'ຈັດສົ່ງສຳເລັດ' end, remark FROM odg_tms_detail WHERE sent_end IS NOT NULL AND bill_no=a.bill_no
      ) row) as list
    FROM odg_tms_detail a
    LEFT JOIN odg_tms b ON b.doc_no=a.doc_no
    LEFT JOIN odg_tms_car c ON c.code=a.car
    LEFT JOIN odg_tms_driver d ON d.code=b.driver
    LEFT JOIN biotime_employee b2 ON b2.code = b.driver
    WHERE bill_no LIKE $1 AND ${getFixedYearSqlFilter("a.doc_date")} ${branchClause}
    ORDER BY a.create_date_time_now DESC NULLS LAST
    LIMIT 1`, [search.toUpperCase()]);

  if (!row) return null;

  // Items selected for this dispatch (with delivered progress).
  const items = await query(
    `SELECT i.item_code, i.item_name,
            COALESCE(i.qty, 0)::numeric as qty,
            COALESCE(i.selected_qty, 0)::numeric as selected_qty,
            COALESCE(i.delivered_qty, 0)::numeric as delivered_qty,
            i.unit_code
     FROM public.odg_tms_detail_item i
     INNER JOIN public.odg_tms_detail d
       ON d.bill_no = i.bill_no AND d.doc_no = i.doc_no
     WHERE i.bill_no = $1 AND d.doc_no = $2
     ORDER BY i.roworder NULLS LAST, i.item_code`,
    [row.bill_no, row.doc_no]
  );

  // Latest GPS position for the car. We query odg_tms_gps_current (the live
  // sync table) by car_code first, falling back to imei. Wrap in try/catch
  // so any GPS issue never breaks the bill tracking.
  let car_position = null;
  try {
    const params = [];
    const conds = [];
    if (row.car_code) {
      params.push(String(row.car_code).trim());
      conds.push(`car_code = $${params.length}`);
    }
    if (row.car_imei) {
      params.push(String(row.car_imei).trim());
      conds.push(`imei = $${params.length}`);
    }
    if (conds.length > 0) {
      // recorded_at is stored as wall-clock Bangkok time (UTC+7) without
      // timezone info; the DB itself runs in UTC. Compare against NOW() in
      // Bangkok so the age is non-negative.
      const pos = await queryOne(
        `SELECT lat::float as lat, lng::float as lng,
                COALESCE(speed::float, 0) as speed,
                COALESCE(heading::float, 0) as heading,
                to_char(recorded_at::timestamp,'DD-MM-YYYY HH24:MI:SS') as recorded_at,
                COALESCE(address, '') as address,
                COALESCE(state_detail, '') as state_detail,
                GREATEST(0, EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'Asia/Bangkok') - recorded_at::timestamp)))::int as age_seconds
         FROM public.odg_tms_gps_current
         WHERE ${conds.join(" OR ")}
         ORDER BY recorded_at DESC NULLS LAST
         LIMIT 1`,
        params
      );
      if (pos) car_position = pos;
    }
  } catch (err) {
    console.warn("[trackBill] gps lookup failed:", err?.message ?? err);
  }

  return { ...row, items, car_position };
}

// Public tracking — strips internal fields (driver, customer details) so a
// customer-facing page can show delivery status without exposing private
// data. Looks up the most recent dispatch for the given bill_no.
async function trackBillPublic(billNo) {
  const text = String(billNo ?? "").trim().toUpperCase();
  if (!text) return null;

  const row = await queryOne(
    `SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date,
            a.bill_no, to_char(a.bill_date,'DD-MM-YYYY') as bill_date,
            a.car as car_code, c.name_1 as car, c.imei as car_imei,
            d.name_1 as driver, COALESCE(b2.employee_photo, '') as driver_photo,
            a.lat, a.lng, a.lat_end, a.lng_end,
            COALESCE(a.url_img, '') as url_img,
            COALESCE(a.sight_img, '') as sight_img,
            COALESCE(a.remark, '') as bill_remark,
            COALESCE(a.status, 0) as bill_status,
            (SELECT json_agg(row) FROM (
              SELECT to_char(create_date_time_now,'DD-MM-YYYY') as doc_date, to_char(create_date_time_now,'HH:MI') as doc_time, 'ຈັດຖ້ຽວແລ້ວ' as status, '' as remark FROM odg_tms_detail WHERE recipt_job IS NULL AND bill_no=a.bill_no
              UNION ALL SELECT to_char(recipt_job,'DD-MM-YYYY'), to_char(recipt_job,'HH:MI'), 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ', '' FROM odg_tms_detail WHERE recipt_job IS NOT NULL AND bill_no=a.bill_no
              UNION ALL SELECT to_char(sent_start,'DD-MM-YYYY'), to_char(sent_start,'HH:MI'), 'ເລີ່ມຈັດສົ່ງ', '' FROM odg_tms_detail WHERE sent_start IS NOT NULL AND bill_no=a.bill_no
              UNION ALL SELECT to_char(sent_end,'DD-MM-YYYY'), to_char(sent_end,'HH:MI'), case when status=2 then 'ຍົກເລີກຈັດສົ່ງ' else 'ຈັດສົ່ງສຳເລັດ' end, '' FROM odg_tms_detail WHERE sent_end IS NOT NULL AND bill_no=a.bill_no
            ) row) as list
     FROM odg_tms_detail a
     LEFT JOIN odg_tms_car c ON c.code = a.car
     LEFT JOIN odg_tms j ON j.doc_no = a.doc_no
     LEFT JOIN odg_tms_driver d ON d.code = j.driver
     LEFT JOIN biotime_employee b2 ON b2.code = j.driver
     WHERE bill_no = $1 AND ${getFixedYearSqlFilter("a.doc_date")}
     ORDER BY a.create_date_time_now DESC NULLS LAST
     LIMIT 1`,
    [text]
  );
  if (!row) return null;

  // Items at delivery progress (no internal codes leaked beyond what shows
  // on the customer's invoice anyway).
  const items = await query(
    `SELECT i.item_code, i.item_name,
            COALESCE(i.selected_qty, 0)::numeric as selected_qty,
            COALESCE(i.delivered_qty, 0)::numeric as delivered_qty,
            i.unit_code
     FROM public.odg_tms_detail_item i
     INNER JOIN public.odg_tms_detail d
       ON d.bill_no = i.bill_no AND d.doc_no = i.doc_no
     WHERE i.bill_no = $1 AND d.doc_no = $2
     ORDER BY i.roworder NULLS LAST, i.item_code`,
    [row.bill_no, row.doc_no]
  );

  // Current vehicle position (best-effort — never blocks tracking).
  let car_position = null;
  try {
    const params = [];
    const conds = [];
    if (row.car_code) {
      params.push(String(row.car_code).trim());
      conds.push(`car_code = $${params.length}`);
    }
    if (row.car_imei) {
      params.push(String(row.car_imei).trim());
      conds.push(`imei = $${params.length}`);
    }
    if (conds.length > 0) {
      const pos = await queryOne(
        `SELECT lat::float as lat, lng::float as lng,
                COALESCE(speed::float, 0) as speed,
                to_char(recorded_at::timestamp,'DD-MM-YYYY HH24:MI:SS') as recorded_at,
                GREATEST(0, EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'Asia/Bangkok') - recorded_at::timestamp)))::int as age_seconds
         FROM public.odg_tms_gps_current
         WHERE ${conds.join(" OR ")}
         ORDER BY recorded_at DESC NULLS LAST
         LIMIT 1`,
        params
      );
      if (pos) car_position = pos;
    }
  } catch (err) {
    console.warn("[trackBillPublic] gps lookup failed:", err?.message ?? err);
  }

  // Strip private fields (car_imei, car_code) before returning.
  const { car_imei: _imei, car_code: _code, ...safe } = row;
  void _imei;
  void _code;
  return { ...safe, items, car_position };
}

// Bills currently in active delivery — used by the tracking search to power
// an autocomplete. "Active" = on an approved job, not yet completed/cancelled
// at the bill level.
async function searchActiveDeliveryBills(session, q) {
  const scope = getBranchScope(session);
  const text = String(q ?? "").trim();
  const params = [];
  let searchClause = "";
  if (text) {
    params.push(`%${text.toUpperCase()}%`);
    searchClause = `AND (UPPER(d.bill_no) LIKE $${params.length} OR UPPER(d.cust_code) LIKE $${params.length} OR UPPER(COALESCE(cu.name_1,'')) LIKE $${params.length})`;
  }
  const branchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM public.ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  return query(
    `SELECT
       d.bill_no, d.doc_no,
       to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
       d.cust_code,
       COALESCE(NULLIF(TRIM(cu.name_1),''), d.cust_code, '-') as cust_name,
       COALESCE(NULLIF(TRIM(car.name_1),''), j.car, '-') as car,
       COALESCE(NULLIF(TRIM(drv.name_1),''), j.driver, '-') as driver,
       CASE
         WHEN d.sent_start IS NOT NULL THEN 'ກຳລັງຈັດສົ່ງ'
         WHEN d.recipt_job  IS NOT NULL THEN 'ເບີກເຄື່ອງແລ້ວ'
         ELSE 'ລໍຖ້າຈັດສົ່ງ'
       END as phase
     FROM public.odg_tms_detail d
     INNER JOIN public.odg_tms j ON j.doc_no = d.doc_no
     LEFT JOIN ar_customer cu ON cu.code = d.cust_code
     LEFT JOIN public.odg_tms_car car ON car.code = j.car
     LEFT JOIN public.odg_tms_driver drv ON drv.code = j.driver
     WHERE COALESCE(j.approve_status,0) = 1
       AND COALESCE(j.job_status,0) IN (1, 2)
       AND COALESCE(d.status,0) NOT IN (1, 2)
       AND ${getFixedYearSqlFilter("d.doc_date")}
       ${searchClause}
       ${branchClause}
     ORDER BY (d.sent_start IS NOT NULL) DESC,
              d.create_date_time_now DESC NULLS LAST,
              d.bill_no
     LIMIT 30`,
    params
  );
}

// ==================== GPS ====================

async function safeDdl(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (
      err?.code === "23505" ||
      msg.includes("pg_class_relname_nsp_index") ||
      msg.includes("pg_type_typname_nsp_index") ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw err;
  }
}

async function ensureRealtimeSchemaInternal() {
  await safeDdl(
    `ALTER TABLE public.odg_tms_car ADD COLUMN IF NOT EXISTS imei character varying`
  );
  await safeDdl(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_gps_realtime_latest (
      imei character varying PRIMARY KEY,
      car_code character varying,
      car_name character varying,
      lat numeric,
      lng numeric,
      speed numeric DEFAULT 0,
      heading numeric DEFAULT 0,
      recorded_at timestamp without time zone,
      address text,
      provider_synced_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS car_code character varying`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS car_name character varying`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS lat numeric`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS lng numeric`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS speed numeric DEFAULT 0`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS heading numeric DEFAULT 0`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS recorded_at timestamp without time zone`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS address text`
  );
  await safeDdl(
    `ALTER TABLE public.odg_tms_gps_realtime_latest ADD COLUMN IF NOT EXISTS provider_synced_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)`
  );
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_gps_realtime_latest_synced_at
    ON public.odg_tms_gps_realtime_latest (provider_synced_at DESC)
  `);
}

async function ensureRealtimeSchema() {
  if (trackingCache.__tmsGpsRealtimeSchemaReady) return;
  if (!trackingCache.__tmsGpsRealtimeSchemaPromise) {
    trackingCache.__tmsGpsRealtimeSchemaPromise = ensureRealtimeSchemaInternal()
      .then(() => {
        trackingCache.__tmsGpsRealtimeSchemaReady = true;
      })
      .catch((err) => {
        trackingCache.__tmsGpsRealtimeSchemaPromise = null;
        throw err;
      });
  }
  await trackingCache.__tmsGpsRealtimeSchemaPromise;
}

function getGpsTrackerConfig() {
  const baseUrl = process.env.GPS_TRACKER_API_URL || "https://apis.thaigpstracker.co.th";
  const user = process.env.GPS_TRACKER_USER || "";
  const pass = process.env.GPS_TRACKER_PASS || "";
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  return { baseUrl, auth };
}

function getRealtimeCacheMap() {
  if (!trackingCache.__tmsGpsRealtimeLastGood) {
    trackingCache.__tmsGpsRealtimeLastGood = new Map();
  }
  return trackingCache.__tmsGpsRealtimeLastGood;
}

function getRealtimeSyncMap() {
  if (!trackingCache.__tmsGpsRealtimeSyncByImei) {
    trackingCache.__tmsGpsRealtimeSyncByImei = new Map();
  }
  return trackingCache.__tmsGpsRealtimeSyncByImei;
}

function normalizeDbRealtimeRow(row) {
  if (!row) return null;
  return {
    imei: String(row.imei ?? "").trim(),
    lat: String(row.lat ?? "").trim(),
    lng: String(row.lng ?? "").trim(),
    speed: String(row.speed ?? "").trim(),
    heading: String(row.heading ?? "").trim(),
    recorded_at: String(row.recorded_at ?? "").trim(),
    address: String(row.address ?? "").trim(),
    car_code: String(row.car_code ?? "").trim(),
    car_name: String(row.car_name ?? "").trim(),
    provider_synced_at: String(row.provider_synced_at ?? "").trim(),
  };
}

function parseTimestampMs(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const ts = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function isRealtimeFresh(row) {
  const ts = parseTimestampMs(row?.provider_synced_at);
  return Number.isFinite(ts) && Date.now() - ts <= REALTIME_DB_FRESH_MS;
}

async function readStoredGpsRealtime(imei) {
  await ensureRealtimeSchema();
  const cleanImei = String(imei ?? "").trim();
  if (!cleanImei) return null;
  const row =
    (await queryOne(
      `SELECT
         c.imei,
         c.code AS car_code,
         c.name_1 AS car_name,
         COALESCE(r.lat::text, '') AS lat,
         COALESCE(r.lng::text, '') AS lng,
         COALESCE(r.speed::text, '') AS speed,
         COALESCE(r.heading::text, '') AS heading,
         COALESCE(to_char(r.recorded_at,'YYYY-MM-DD"T"HH24:MI:SS'), '') AS recorded_at,
         COALESCE(r.address, '') AS address,
         COALESCE(to_char(r.provider_synced_at,'YYYY-MM-DD"T"HH24:MI:SS'), '') AS provider_synced_at
       FROM public.odg_tms_car c
       LEFT JOIN public.odg_tms_gps_realtime_latest r ON r.imei = c.imei
       WHERE c.imei = $1
       LIMIT 1`,
      [cleanImei]
    )) ??
    (await queryOne(
      `SELECT
         imei,
         COALESCE(car_code, '') AS car_code,
         COALESCE(car_name, '') AS car_name,
         COALESCE(lat::text, '') AS lat,
         COALESCE(lng::text, '') AS lng,
         COALESCE(speed::text, '') AS speed,
         COALESCE(heading::text, '') AS heading,
         COALESCE(to_char(recorded_at,'YYYY-MM-DD"T"HH24:MI:SS'), '') AS recorded_at,
         COALESCE(address, '') AS address,
         COALESCE(to_char(provider_synced_at,'YYYY-MM-DD"T"HH24:MI:SS'), '') AS provider_synced_at
       FROM public.odg_tms_gps_realtime_latest
       WHERE imei = $1
       LIMIT 1`,
      [cleanImei]
    ));
  return normalizeDbRealtimeRow(row);
}

async function readStoredGpsRealtimeAll() {
  await ensureRealtimeSchema();
  const rows = await query(
    `SELECT
       c.imei,
       c.code AS car_code,
       c.name_1 AS car_name,
       COALESCE(r.lat::text, '') AS lat,
       COALESCE(r.lng::text, '') AS lng,
       COALESCE(r.speed::text, '') AS speed,
       COALESCE(r.heading::text, '') AS heading,
       COALESCE(to_char(r.recorded_at,'YYYY-MM-DD"T"HH24:MI:SS'), '') AS recorded_at,
       COALESCE(r.address, '') AS address,
       COALESCE(to_char(r.provider_synced_at,'YYYY-MM-DD"T"HH24:MI:SS'), '') AS provider_synced_at
     FROM public.odg_tms_car c
     LEFT JOIN public.odg_tms_gps_realtime_latest r ON r.imei = c.imei
     WHERE c.imei IS NOT NULL AND btrim(c.imei) <> ''
     ORDER BY c.name_1 ASC, c.code ASC`
  );
  return rows.map(normalizeDbRealtimeRow);
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function saveRealtimeToDb(row) {
  await ensureRealtimeSchema();
  const cleanImei = String(row?.imei ?? "").trim();
  if (!cleanImei) return;
  await query(
    `INSERT INTO public.odg_tms_gps_realtime_latest (
       imei, car_code, car_name, lat, lng, speed, heading,
       recorded_at, address, provider_synced_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (imei) DO UPDATE
     SET
       car_code = EXCLUDED.car_code,
       car_name = EXCLUDED.car_name,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       speed = EXCLUDED.speed,
       heading = EXCLUDED.heading,
       recorded_at = EXCLUDED.recorded_at,
       address = EXCLUDED.address,
       provider_synced_at = EXCLUDED.provider_synced_at`,
    [
      cleanImei,
      String(row?.car_code ?? "").trim(),
      String(row?.car_name ?? "").trim(),
      toNumberOrNull(row?.lat),
      toNumberOrNull(row?.lng),
      toNumberOrNull(row?.speed),
      toNumberOrNull(row?.heading),
      String(row?.recorded_at ?? "").trim() || null,
      String(row?.address ?? "").trim(),
      String(row?.provider_synced_at ?? "").trim() || null,
    ]
  );
}

async function runRealtimeProviderRequest(task) {
  const previous = trackingCache.__tmsGpsRealtimeQueue ?? Promise.resolve();
  const scheduled = previous
    .catch(() => undefined)
    .then(async () => {
      const lastAt = trackingCache.__tmsGpsRealtimeLastAt ?? 0;
      const waitMs = Math.max(
        0,
        REALTIME_PROVIDER_MIN_GAP_MS - (Date.now() - lastAt)
      );
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      const result = await task();
      trackingCache.__tmsGpsRealtimeLastAt = Date.now();
      return result;
    });
  trackingCache.__tmsGpsRealtimeQueue = scheduled.catch(() => undefined);
  return scheduled;
}

function normalizeRealtimeTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function parseRealtimeLatLng(row) {
  const latlng = String(row?.latlng ?? row?.latLng ?? row?.location ?? "").trim();
  if (latlng.includes(",")) {
    const [latStr = "", lngStr = ""] = latlng.split(",").map((value) => value.trim());
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat: String(lat), lng: String(lng) };
    }
  }
  const lat = Number(row?.lat ?? row?.latitude ?? row?.Lat ?? NaN);
  const lng = Number(row?.lng ?? row?.lon ?? row?.long ?? row?.longitude ?? NaN);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat: String(lat), lng: String(lng) };
  }
  return null;
}

async function fetchRealtimeJson(cleanImei, config) {
  const url = `${config.baseUrl}/exporter/log/getRealTime/${encodeURIComponent(cleanImei)}`;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await runRealtimeProviderRequest(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        try {
          return await fetch(url, {
            headers: { Authorization: `Basic ${config.auth}` },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      });

      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          if (attempt < MAX_ATTEMPTS) {
            const waitMs = 2000 * attempt;
            console.warn(
              `[gps-realtime] retry imei=${cleanImei} attempt=${attempt}/${MAX_ATTEMPTS} status=${res.status} wait=${waitMs}ms`
            );
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
          throw new Error(`GPS realtime HTTP ${res.status}`);
        }
        return null;
      }

      try {
        return await res.json();
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          const waitMs = 2000 * attempt;
          console.warn(
            `[gps-realtime] non-JSON imei=${cleanImei} attempt=${attempt}/${MAX_ATTEMPTS} wait=${waitMs}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        throw error;
      }
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        const waitMs = 2000 * attempt;
        console.warn(
          `[gps-realtime] retry imei=${cleanImei} attempt=${attempt}/${MAX_ATTEMPTS} error=${error?.message ?? error} wait=${waitMs}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }

  return null;
}

async function fetchGpsForImei(imei, carCode, carName, config) {
  const cleanImei = imei.trim();
  if (!cleanImei) return null;
  try {
    const json = await fetchRealtimeJson(cleanImei, config);
    // Provider shape: { data: [ { username, log_list: [ <gpsRow> ] } ], ... }
    // Be defensive: also accept top-level log_list/array variants.
    const dataItem =
      (Array.isArray(json?.data) && json.data[0]) ||
      (Array.isArray(json) && json[0]) ||
      json;
    const row =
      (Array.isArray(dataItem?.log_list) && dataItem.log_list[0]) ||
      (Array.isArray(json?.log_list) && json.log_list[0]) ||
      (dataItem && typeof dataItem === "object" && "imei" in dataItem ? dataItem : null);
    if (!row) {
      return getRealtimeCacheMap().get(cleanImei) ?? null;
    }

    // One-time debug: log the first row's full shape so we can adjust field mapping
    if (!trackingCache.__tmsRealtimeShapeLogged) {
      trackingCache.__tmsRealtimeShapeLogged = true;
      console.log(
        `[gps-realtime] sample provider row imei=${cleanImei} keys=${Object.keys(row).join(",")} full=${JSON.stringify(row).slice(0, 800)}`
      );
    }

    const coords = parseRealtimeLatLng(row);
    const providerSyncedAt = new Date().toISOString();
    const speedRaw =
      row.speed ??
      row.velocity ??
      row.spd ??
      row.Speed ??
      row.SPD ??
      row.gpsSpeed ??
      row.speedKmh ??
      "";
    const headingRaw =
      row.heading ??
      row.direction ??
      row.course ??
      row.Course ??
      row.head ??
      row.Heading ??
      row.bearing ??
      "";
    const recordedRaw =
      row.gpsDateTime ??
      row.dateTime ??
      row.datetime ??
      row.date_time_log ??
      row.date_time_recv ??
      row.time ??
      row.gpsTime ??
      row.dtServer ??
      row.logDateTime ??
      row.deviceTime ??
      "";
    const engineStateRaw =
      row.engine_state ?? row.engineState ?? row.engine ?? row.ignition ?? "";
    const stateDetailRaw =
      row.state_detail ?? row.stateDetail ?? row.status ?? row.statusText ?? "";
    const mileageRaw = row.mileage ?? row.odometer ?? row.totalDistance ?? "";
    const satRaw = row.sat ?? row.satellites ?? row.gpsSat ?? "";
    const gsmRaw = row.gsm ?? row.gsmSignal ?? row.signal ?? "";
    const hdopRaw = row.hdop ?? row.HDOP ?? "";
    const oilRaw = row.oil ?? row.fuel ?? row.fuelLevel ?? "";
    // Keep ad_data/input_state as JSON strings for storage; UI parses back
    const adData = row.ad_data ?? row.adData ?? row.analog ?? null;
    const inputState = row.input_state ?? row.inputState ?? row.inputs ?? null;
    const current = {
      imei: cleanImei,
      lat: coords?.lat ?? "",
      lng: coords?.lng ?? "",
      speed: String(speedRaw),
      heading: String(headingRaw),
      recorded_at: normalizeRealtimeTimestamp(recordedRaw),
      address: String(row.address ?? row.poi ?? row.addr ?? ""),
      engine_state: engineStateRaw === "" || engineStateRaw == null ? "" : String(engineStateRaw),
      state_detail: String(stateDetailRaw ?? ""),
      mileage: mileageRaw === "" || mileageRaw == null ? "" : String(mileageRaw),
      sat: satRaw === "" || satRaw == null ? "" : String(satRaw),
      gsm: gsmRaw === "" || gsmRaw == null ? "" : String(gsmRaw),
      hdop: hdopRaw === "" || hdopRaw == null ? "" : String(hdopRaw),
      oil: oilRaw === "" || oilRaw == null ? "" : String(oilRaw),
      ad_data: adData ? JSON.stringify(adData) : "",
      input_state: inputState ? JSON.stringify(inputState) : "",
      car_code: carCode,
      car_name: carName,
      provider_synced_at: providerSyncedAt,
    };
    if (current.lat && current.lng) {
      getRealtimeCacheMap().set(cleanImei, current);
      return current;
    }
    return current;
  } catch (error) {
    console.error(`GPS fetch failed for imei=${cleanImei}`, error);
    return getRealtimeCacheMap().get(cleanImei) ?? null;
  }
}

async function getGpsRealtime(imei) {
  const cleanImei = imei.trim();
  if (!cleanImei) return null;
  const car = await queryOne(
    "SELECT code, name_1 FROM public.odg_tms_car WHERE imei=$1 LIMIT 1",
    [cleanImei]
  );
  return fetchGpsForImei(cleanImei, car?.code ?? "", car?.name_1 ?? "", getGpsTrackerConfig());
}

async function getGpsRealtimeAll() {
  const cars = await query(
    `SELECT code, name_1, imei FROM public.odg_tms_car
     WHERE imei IS NOT NULL AND btrim(imei) <> ''
     ORDER BY name_1 ASC, code ASC`
  );
  console.log(`[gps-realtime] getGpsRealtimeAll cars=${cars.length} env_user=${process.env.GPS_TRACKER_USER ? "set" : "MISSING"} env_pass=${process.env.GPS_TRACKER_PASS ? "set" : "MISSING"}`);
  if (cars.length === 0) return [];
  const config = getGpsTrackerConfig();
  const started = Date.now();
  const result = await Promise.all(
    cars.map(async (car) => {
      const gps = await fetchGpsForImei(car.imei, car.code, car.name_1, config);
      return gps ?? {
        imei: car.imei,
        lat: "",
        lng: "",
        speed: "",
        heading: "",
        recorded_at: "",
        address: "",
        car_code: car.code,
        car_name: car.name_1,
      };
    })
  );
  const withCoords = result.filter((r) => r.lat && r.lng).length;
  const elapsed = Date.now() - started;
  console.log(`[gps-realtime] getGpsRealtimeAll done cars=${cars.length} with_coords=${withCoords} elapsed=${elapsed}ms`);
  return result;
}

// ==================== Locations ====================

async function getLocations(session, search) {
  const scope = getBranchScope(session);
  const branchClause = branchFilterShipment(scope, "a");
  if (search) {
    return query(`SELECT doc_no, to_char(doc_date,'DD-MM-YYYY') as doc_date, transport_name, destination, b.name_1 as log_name, latitude, longitude FROM ic_trans_shipment a LEFT JOIN public.transport_type b ON b.code=a.transport_code WHERE a.transport_code != '02-0004' AND ${getFixedYearSqlFilter("a.doc_date")} ${branchClause} AND (doc_no LIKE $1 OR transport_name LIKE $1) ORDER BY a.doc_date DESC LIMIT 20`, [`%${search}%`]);
  }
  return query(`SELECT doc_no, to_char(doc_date,'DD-MM-YYYY') as doc_date, transport_name, destination, b.name_1 as log_name, latitude, longitude FROM ic_trans_shipment a LEFT JOIN public.transport_type b ON b.code=a.transport_code WHERE a.transport_code != '02-0004' AND ${getFixedYearSqlFilter("a.doc_date")} ${branchClause} ORDER BY a.doc_date DESC LIMIT 20`);
}

module.exports = {
  trackBill,
  trackBillPublic,
  searchActiveDeliveryBills,
  getGpsRealtime,
  getGpsRealtimeAll,
  getLocations,
};

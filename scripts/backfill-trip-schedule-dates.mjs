// ໄລ່ເກັບ "ວັນນັດ" ຂອງບິນທີ່ຄ້າງຢູ່ວັນເກົ່າ ໃຫ້ຕາມວັນຈັດສົ່ງຂອງຖ້ຽວທີ່ບິນນັ້ນຂຶ້ນຈິງ.
//
//   node scripts/backfill-trip-schedule-dates.mjs           # ລອງເບິ່ງຢ່າງດຽວ
//   node scripts/backfill-trip-schedule-dates.mjs --apply   # ຂຽນຈິງ
//   node scripts/backfill-trip-schedule-dates.mjs --apply --force  # ລວມບິນທີ່ຄົນແກ້ຫຼັງຈັດຖ້ຽວ
//
// ເປັນຫຍັງຕ້ອງມີ: createJob ເຄີຍຂຽນ scheduled_date ແບບ COALESCE(ຂອງເກົ່າ, ວັນຖ້ຽວ)
// ຈຶ່ງປະວັນນັດຄ້າງຢູ່ຄ່າເກົ່າເມື່ອຜູ້ຈັດຖ້ຽວຈັດຖ້ຽວລ່ວງໜ້າ/ເລື່ອນຖ້ຽວ. ຜົນຄື ບິນ
// ອ່ານເປັນ "ເລີຍນັດ" ຕັ້ງແຕ່ວັນຮຸ່ງຂຶ້ນທັງທີ່ຍັງບໍ່ຮອດວັນອອກລົດ ແລະ ຊັ້ນເວລານຳສົ່ງ
// "ວັນນັດ >48h" ນັບເປັນສົ່ງຊ້າແບບບໍ່ຈິງ. ດຽວນີ້ syncBillScheduleToTrip (jobs.js)
// ຍ້າຍວັນນັດໄປໜ້າໃຫ້ແລ້ວ — script ນີ້ໄວ້ໄລ່ເກັບບິນທີ່ຈັດຖ້ຽວກ່ອນການປ່ຽນນັ້ນ.
//
// ກົດ: ວັນນັດ ຍ້າຍໄປໜ້າໄດ້ຢ່າງດຽວ ບໍ່ຖອຍຫຼັງ — ຄືກັນກັບ GREATEST ໃນໂຄ້ດຈິງ.
// ໃຊ້ວັນຂອງ "ຖ້ຽວທີ່ວັນຈັດສົ່ງໄກສຸດ" ຂອງບິນນັ້ນ ເພາະນັ້ນຄືຜົນສຸດທ້າຍທີ່ກົດໃໝ່
// ຈະໃຫ້ ຖ້າມັນມີມາແຕ່ຕົ້ນ.
//
// ຂ້າມໂດຍປົກກະຕິ: ບິນທີ່ມີຄົນໄປແກ້ວັນນັດເອງ "ຫຼັງ" ຖ້ຽວຖືກສ້າງ (ເຫັນຈາກ
// odg_tms_pending_bill_history) — ການຕັດສິນໃຈຂອງຄົນຕ້ອງຊະນະການໄລ່ເກັບ.
// ໃສ່ --force ຈຶ່ງຈະທັບ.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { getFixedYearSqlFilter, FIXED_YEAR } = require(path.join(root, "src/lib/fixed-year.js"));

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

const client = new Client({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD ?? "",
  ssl:
    process.env.PG_SSL && process.env.PG_SSL !== "false"
      ? { rejectUnauthorized: false }
      : undefined,
});
await client.connect();

// ຖ້ຽວທີ່ວັນຈັດສົ່ງໄກສຸດຂອງແຕ່ລະບິນ + ເວລາທີ່ຖ້ຽວນັ້ນຖືກສ້າງ (ໄວ້ທຽບກັບປະຫວັດ
// ການແກ້ຂອງຄົນ). ບິນໜຶ່ງອາດຂຶ້ນຫຼາຍຖ້ຽວ (ສົ່ງບໍ່ສຳເລັດແລ້ວຈັດໃໝ່).
const LAST_TRIP = `
  SELECT DISTINCT ON (d.bill_no)
         d.bill_no,
         j.doc_no AS trip_doc,
         j.date_logistic::date AS trip_day,
         COALESCE(j.create_date_time_now, j.doc_date::timestamp) AS attached_at
    FROM public.odg_tms_detail d
    JOIN public.odg_tms j ON j.doc_no = d.doc_no
   WHERE ${getFixedYearSqlFilter("d.doc_date")}
     AND j.date_logistic IS NOT NULL
   ORDER BY d.bill_no, j.date_logistic DESC, j.create_date_time_now DESC NULLS LAST`;

// ບິນທີ່ວັນນັດຢູ່ກ່ອນວັນຖ້ຽວ = ຄ້າງເກົ່າ. human_edited = ມີແຖວປະຫວັດເກີດຫຼັງ
// ຖ້ຽວຖືກສ້າງ (ເຜື່ອ 1 ນາທີ ເພາະ createJob ເອງກໍຂຽນ updated_at ຕອນນັ້ນ).
const CANDIDATES = `
  WITH last_trip AS (${LAST_TRIP})
  SELECT pb.bill_no,
         pb.scheduled_date::date AS old_date,
         lt.trip_day AS new_date,
         lt.trip_doc,
         (lt.trip_day - pb.scheduled_date::date)::int AS gap_days,
         EXISTS (
           SELECT 1 FROM public.odg_tms_pending_bill_history h
            WHERE h.bill_no = pb.bill_no
              AND h.changed_at > lt.attached_at + INTERVAL '1 minute'
         ) AS human_edited
    FROM public.odg_tms_pending_bill pb
    JOIN last_trip lt ON lt.bill_no = pb.bill_no
   WHERE pb.scheduled_date IS NOT NULL
     AND pb.scheduled_date::date < lt.trip_day`;

const all = (await client.query(`${CANDIDATES} ORDER BY gap_days DESC, bill_no`)).rows;
const skipped = force ? [] : all.filter((r) => r.human_edited);
const target = force ? all : all.filter((r) => !r.human_edited);

console.log(`ປີທີ່ຕຶງ: ${FIXED_YEAR}`);
console.log(`ພົບບິນທີ່ວັນນັດຄ້າງເກົ່າ: ${all.length} ບິນ`);
console.log(`  ຈະຍ້າຍ : ${target.length}`);
console.log(`  ຂ້າມ   : ${skipped.length}${skipped.length ? " (ຄົນແກ້ວັນນັດເອງຫຼັງຈັດຖ້ຽວ — ໃສ່ --force ຈຶ່ງທັບ)" : ""}`);

if (target.length > 0) {
  console.log("\nຕົວຢ່າງ (ຫ່າງຫຼາຍສຸດ 10 ລາຍ):");
  for (const r of target.slice(0, 10)) {
    console.log(
      `  ${r.bill_no.padEnd(16)} ${String(r.old_date.toISOString().slice(0, 10))} → ${String(
        r.new_date.toISOString().slice(0, 10)
      )}  (+${r.gap_days} ມື້, ຖ້ຽວ ${r.trip_doc})`
    );
  }
}

// ຜົນຕໍ່ຊັ້ນເວລານຳສົ່ງ "ວັນນັດ >48h" ຂອງບິນທີ່ຈະຍ້າຍ — ວັດກ່ອນຂຽນ ຈຶ່ງເຫັນວ່າ
// ການໄລ່ເກັບນີ້ແກ້ຕົວເລກຫຍັງແທ້.
if (target.length > 0) {
  const impact = await client.query(
    `WITH t AS (
       SELECT unnest($1::varchar[]) AS bill_no, unnest($2::date[]) AS new_date
     ),
     done AS (
       SELECT t.bill_no, t.new_date, pb.scheduled_date::date AS old_date,
              MAX(d.sent_end) AS delivered_at
         FROM t
         JOIN public.odg_tms_pending_bill pb ON pb.bill_no = t.bill_no
         JOIN public.odg_tms_detail d ON d.bill_no = t.bill_no AND COALESCE(d.status, 0) = 1
        WHERE ${getFixedYearSqlFilter("d.doc_date")}
        GROUP BY t.bill_no, t.new_date, pb.scheduled_date
     )
     SELECT COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::int AS delivered,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (delivered_at - old_date::timestamp))/3600.0 > 48)::int AS gt48_before,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (delivered_at - new_date::timestamp))/3600.0 > 48)::int AS gt48_after
       FROM done`,
    [target.map((r) => r.bill_no), target.map((r) => r.new_date)]
  );
  const i = impact.rows[0];
  console.log(
    `\nຊັ້ນ "ວັນນັດ >48h" ຂອງບິນຊຸດນີ້ (ສົ່ງແລ້ວ ${i.delivered} ບິນ): ${i.gt48_before} → ${i.gt48_after}`
  );
}

if (!apply) {
  console.log("\n(ລອງເບິ່ງຢ່າງດຽວ — ໃສ່ --apply ຈຶ່ງຂຽນຈິງ)");
  await client.end();
  process.exit(0);
}

if (target.length === 0) {
  console.log("\nບໍ່ມີຫຍັງໃຫ້ຂຽນ.");
  await client.end();
  process.exit(0);
}

// ຂຽນ + ບັນທຶກປະຫວັດ ໃນ transaction ດຽວ ຈຶ່ງບໍ່ມີສະພາບ "ຍ້າຍແລ້ວແຕ່ບໍ່ມີຮ່ອງຮອຍ"
try {
  await client.query("BEGIN");
  const billNos = target.map((r) => r.bill_no);
  const newDates = target.map((r) => r.new_date);
  const updated = await client.query(
    `UPDATE public.odg_tms_pending_bill pb
        SET scheduled_date = t.new_date,
            updated_at = LOCALTIMESTAMP(0)
       FROM (SELECT unnest($1::varchar[]) AS bill_no, unnest($2::date[]) AS new_date) t
      WHERE pb.bill_no = t.bill_no
        AND pb.scheduled_date::date < t.new_date
      RETURNING pb.bill_no`,
    [billNos, newDates]
  );
  // ປະຫວັດ: ນັບເປັນ "ການເລື່ອນນັດ" ຄືກັນກັບທີ່ syncBillScheduleToTrip ຂຽນ
  await client.query(
    `INSERT INTO public.odg_tms_pending_bill_history
       (bill_no, scheduled_date, remark, action_status, delivery_route_code, delivery_round_code, transport_code, planned_lat, planned_lng, changed_by)
     SELECT bill_no, scheduled_date, remark, action_status, delivery_route_code, delivery_round_code, transport_code, planned_lat, planned_lng, 'backfill-trip-schedule'
       FROM public.odg_tms_pending_bill
      WHERE bill_no = ANY($1::varchar[])`,
    [updated.rows.map((r) => r.bill_no)]
  );
  await client.query("COMMIT");
  console.log(`\n✅ ຂຽນແລ້ວ ${updated.rowCount} ບິນ (ບັນທຶກປະຫວັດຄົບ)`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("❌ ລົ້ມເຫຼວ ຄືນຄ່າເດີມທັງໝົດ:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

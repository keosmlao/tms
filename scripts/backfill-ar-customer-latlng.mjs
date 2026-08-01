// ຕື່ມພິກັດຮ້ານລູກຄ້າລົງທະບຽນ public.ar_customer_detail (latitude/longitude)
// ຈາກຈຸດສົ່ງຈິງທີ່ຄົນຂັບກົດ "ສຳເລັດ" ໜ້າຮ້ານ.
//
//   node scripts/backfill-ar-customer-latlng.mjs               # ລອງເບິ່ງຢ່າງດຽວ
//   node scripts/backfill-ar-customer-latlng.mjs --apply       # ຕື່ມສະເພາະທີ່ວ່າງ
//   node scripts/backfill-ar-customer-latlng.mjs --apply --overwrite  # ທັບທຸກລາຍ
//
// ເປັນຫຍັງຕ້ອງມີ: ກ່ອນໜ້ານີ້ໂຄ້ດຂຽນພິກັດລົງທະບຽນລູກຄ້າສະເພາະຕອນ check-in ແລະ
// ຂຽນຄັ້ງທຳອິດເທົ່ານັ້ນ — ວັດຈາກຖານຂໍ້ມູນຈິງ (2026-08-01) ໄດ້ພຽງ 250/20,845
// ລາຍ ທັງໆທີ່ TMS ຈື່ຈຸດສົ່ງຈິງໄວ້ໃນ odg_tms_customer_point ແລ້ວ 1,841 ລາຍ.
// ດຽວນີ້ complete_bill ອັບເດດໃຫ້ທຸກຄັ້ງທີ່ປິດບິນແລ້ວ — script ນີ້ໄວ້ໄລ່ເກັບ
// ບິນທີ່ປິດໄປກ່ອນການປ່ຽນນັ້ນ.
//
// --overwrite ທັບພິກັດເກົ່າທຸກລາຍ ໃຫ້ກົງກັບກົດຂອງ complete_bill (ຈຸດປິດບິນ
// ຫຼ້າສຸດຊະນະ); ບໍ່ໃສ່ = ຕື່ມສະເພາະທີ່ວ່າງ (NULL/0). ບໍ່ INSERT ແຖວໃໝ່: ຖ້າ
// ລູກຄ້າຍັງບໍ່ມີໃນທະບຽນ ໃຫ້ຂ້າມໄປ ເພາະການສ້າງແຖວທະບຽນລູກຄ້າເປົ່າແມ່ນໜ້າວຽກ
// ຂອງລະບົບບັນຊີ ບໍ່ແມ່ນ TMS.
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

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");

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

// ແຖວທະບຽນທີ່ມີຈຸດສົ່ງຈິງໃຫ້ຂຽນ. ໃສ່ໃນ CTE ດຽວກັບ UPDATE ຂ້າງລຸ່ມ ຈຶ່ງບໍ່ມີ
// ຊ່ອງທີ່ "ນັບແລ້ວ" ກັບ "ຂຽນແລ້ວ" ຕ່າງກັນ. ບໍ່ຂຽນຖ້າຄ່າບໍ່ປ່ຽນ ຈຶ່ງບໍ່ດັນ
// last_update ຂອງແຖວທີ່ກົງຢູ່ແລ້ວ.
const emptyOnly = overwrite
  ? ""
  : "AND (COALESCE(d.latitude, 0) = 0 OR COALESCE(d.longitude, 0) = 0)";
const TARGET = `
  SELECT p.cust_code, p.lat::numeric AS lat, p.lng::numeric AS lng
    FROM public.odg_tms_customer_point p
    JOIN public.ar_customer_detail d ON d.ar_code = p.cust_code
   WHERE p.lat ~ '^-?[0-9]+(\\.[0-9]+)?$'
     AND p.lng ~ '^-?[0-9]+(\\.[0-9]+)?$'
     AND p.lat::numeric <> 0
     AND p.lng::numeric <> 0
     AND (COALESCE(d.latitude, 0), COALESCE(d.longitude, 0))
         IS DISTINCT FROM (p.lat::numeric, p.lng::numeric)
     ${emptyOnly}`;

const before = await client.query(`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE COALESCE(latitude, 0) <> 0
                            AND COALESCE(longitude, 0) <> 0)::int AS with_point
    FROM public.ar_customer_detail`);
console.log(
  `ກ່ອນ: ທະບຽນລູກຄ້າ ${before.rows[0].total} ລາຍ — ມີພິກັດແລ້ວ ${before.rows[0].with_point} ລາຍ`
);

console.log(`ໂໝດ: ${overwrite ? "ທັບພິກັດເກົ່າທຸກລາຍ (--overwrite)" : "ຕື່ມສະເພາະທີ່ວ່າງ"}`);

const preview = await client.query(`${TARGET} ORDER BY p.cust_code LIMIT 10`);
const count = await client.query(`SELECT count(*)::int AS n FROM (${TARGET}) t`);
console.log(`ຈະຂຽນ: ${count.rows[0].n} ລາຍ`);
console.table(preview.rows);

if (!apply) {
  console.log("\n(ລອງເບິ່ງຢ່າງດຽວ — ຕື່ມ --apply ເພື່ອຂຽນລົງຈິງ)");
  await client.end();
  process.exit(0);
}

await client.query("BEGIN");
try {
  const res = await client.query(`
    WITH target AS (${TARGET})
    UPDATE public.ar_customer_detail d
       SET latitude = t.lat, longitude = t.lng
      FROM target t
     WHERE d.ar_code = t.cust_code`);
  await client.query("COMMIT");
  console.log(`✓ ຂຽນພິກັດແລ້ວ ${res.rowCount} ລາຍ`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("✗ ລົ້ມເຫຼວ ຄືນຄ່າເດີມທັງໝົດ:", err.message);
  await client.end();
  process.exit(1);
}

const after = await client.query(`
  SELECT count(*) FILTER (WHERE COALESCE(latitude, 0) <> 0
                            AND COALESCE(longitude, 0) <> 0)::int AS with_point
    FROM public.ar_customer_detail`);
console.log(`ຫຼັງ: ມີພິກັດແລ້ວ ${after.rows[0].with_point} ລາຍ`);
await client.end();

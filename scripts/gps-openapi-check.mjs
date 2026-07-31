// ກວດວ່າ Lao GPS Open API ໃຊ້ໄດ້ບໍ ຫຼັງຕັ້ງ GPS_OPENAPI_USER/PASS ໃນ .env
//
//   node scripts/gps-openapi-check.mjs
//
// ກວດ 4 ຢ່າງ: login ໄດ້ບໍ · ເຫັນລົດຈັກຄັນ · ຕຳແໜ່ງລ່າສຸດມາຄົບບໍ ·
// IMEI ຈາກ provider ກົງກັບຕາຕະລາງລົດໃນລະບົບຈັກຄັນ (ອັນທີ່ບໍ່ກົງຈະບອກອອກມາ).
// ອ່ານຢ່າງດຽວ — ບໍ່ຂຽນຫຍັງລົງ DB ຫຼື ສົ່ງຫຍັງກັບໄປ provider.
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
const gps = require(path.join(root, "src/queries/gps-openapi.js"));

if (!gps.isOpenApiConfigured()) {
  console.error("✗ ຍັງບໍ່ໄດ້ຕັ້ງ GPS_OPENAPI_USER / GPS_OPENAPI_PASS ໃນ .env");
  process.exit(1);
}

try {
  await gps.getToken();
  console.log("✓ login ສຳເລັດ");

  const vehicles = await gps.fetchVehicles();
  console.log(`✓ ເຫັນລົດ ${vehicles.length} ຄັນໃນບັນຊີ GPS`);

  const positions = await gps.fetchAllPositions();
  const withFix = [...positions.values()].filter((p) => p.lat && p.lng).length;
  console.log(`✓ ຕຳແໜ່ງລ່າສຸດ ${positions.size} ຄັນ (ມີພິກັດ ${withFix})`);

  const pg = require(path.join(root, "node_modules/pg/lib/index.js"));
  const client = new pg.Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  await client.connect();
  const { rows } = await client.query(
    `SELECT code, name_1, btrim(imei) AS imei FROM public.odg_tms_car
      WHERE imei IS NOT NULL AND btrim(imei) <> '' ORDER BY name_1`
  );
  await client.end();

  const missing = rows.filter((r) => !positions.has(r.imei));
  console.log(
    `✓ ລົດໃນລະບົບ ${rows.length} ຄັນ · ຈັບຄູ່ກັບ GPS ໄດ້ ${rows.length - missing.length} ຄັນ`
  );
  if (missing.length > 0) {
    console.log("  ⚠ ຈັບຄູ່ບໍ່ໄດ້ (IMEI ບໍ່ຢູ່ໃນບັນຊີ GPS):");
    for (const r of missing) console.log(`    ${r.code} ${r.name_1} imei=${r.imei}`);
  }
} catch (error) {
  console.error(`✗ ລົ້ມເຫຼວ: ${error?.code ?? ""} ${error?.message ?? error}`);
  process.exit(1);
}

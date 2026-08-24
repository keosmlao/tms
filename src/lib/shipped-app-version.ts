// ເວີຊັນຂອງ APK ທີ່ **ຖືກສົ່ງອອກຢູ່ຈິງ** ທີ່ `/tms.apk`.
//
// ອ່ານຈາກ `public/tms.apk.version` ເຊິ່ງຂຽນພ້ອມກັບຕອນ copy APK ໃໝ່ເຂົ້າ
// `public/`. ເຫດຜົນທີ່ບໍ່ອ່ານຈາກຕົວ APK ໂດຍກົງ: AndroidManifest ຢູ່ໃນ APK
// ເປັນ binary XML ຕ້ອງມີ aapt ຈຶ່ງອ່ານໄດ້ — ບໍ່ຄຸ້ມທີ່ຈະຜູກ runtime ຂອງເວັບ
// ໄວ້ກັບເຄື່ອງມືຂອງ Android SDK.
//
// ນີ້ຄືສິ່ງທີ່ເຮັດໃຫ້ໂໝດ "ອັດຕະໂນມັດ" ຂອງການບັງຄັບອັບເດດເປັນອັດຕະໂນມັດແທ້:
// ອອກ APK ໃໝ່ → ໄຟລ໌ນີ້ປ່ຽນ → ເວີຊັນຕ່ຳສຸດຂະຫຍັບຕາມເອງ ໂດຍບໍ່ຕ້ອງມີໃຜເຂົ້າ
// ໄປພິມເລກໃນໜ້າຕັ້ງຄ່າ (ເຊິ່ງເປັນຂັ້ນຕອນທີ່ລືມງ່າຍທີ່ສຸດ).
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const VERSION_FILE = join(process.cwd(), "public", "tms.apk.version");

let cached = "";
let cachedMtimeMs = -1;
let checkedAtMs = 0;

// ອ່ານດິສຢ່າງຫຼາຍ 1 ຄັ້ງ/10 ວິນາທີ. gate ນີ້ແລ່ນທຸກ request ຂອງມືຖື.
const RECHECK_MS = 10_000;

/**
 * ເວີຊັນ (ເຊັ່ນ `"1.3.4"`) ຂອງ APK ທີ່ວາງຢູ່ `public/tms.apk`.
 * ຄືນ `""` ເມື່ອບໍ່ມີໄຟລ໌ — ຜູ້ເອີ້ນຕ້ອງຖືວ່າ "ບໍ່ຮູ້" ແລະ **ບໍ່ບັງຄັບ**
 * ອັບເດດ ດີກວ່າຈະລັອກຄົນຂັບອອກຈາກລະບົບເພາະໄຟລ໌ຫາຍ.
 */
export async function shippedAppVersion(now = Date.now()): Promise<string> {
  if (cachedMtimeMs >= 0 && now - checkedAtMs < RECHECK_MS) return cached;
  checkedAtMs = now;
  try {
    const info = await stat(VERSION_FILE);
    if (info.mtimeMs === cachedMtimeMs) return cached;
    const raw = await readFile(VERSION_FILE, "utf8");
    // ໄຟລ໌ຂຽນເປັນ "1.3.4+15" — ເອົາສະເພາະສ່ວນເວີຊັນ, ຖິ້ມ build number.
    cached = raw.trim().split("+")[0].trim();
    cachedMtimeMs = info.mtimeMs;
  } catch {
    cached = "";
    cachedMtimeMs = -1;
  }
  return cached;
}

/** ລ້າງ cache — ໃຊ້ໃນເທສ. */
export function resetShippedAppVersionCache(): void {
  cached = "";
  cachedMtimeMs = -1;
  checkedAtMs = 0;
}

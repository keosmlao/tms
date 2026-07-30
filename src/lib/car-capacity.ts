// ສູດແປງຂະໜາດຕູ້ບັນທຸກ (cm) ເປັນປະລິມານ (m³) — ໃຊ້ຮ່ວມກັນລະຫວ່າງໜ້າ
// "ປະເພດລົດ" ແລະ "ຂໍ້ມູນລົດ" ເພື່ອໃຫ້ຕົວເລກທີ່ຄົນເຫັນຕົງກັບທີ່ DB ຄິດ
// (ເບິ່ງ capacityM3Sql ໃນ src/queries/car-type.js).

/** ຄ່າວ່າງ / ບໍ່ແມ່ນເລກ → null. ບໍ່ແປງເປັນ 0 ເພາະ 0 ໝາຍວ່າ "ບັນທຸກບໍ່ໄດ້ເລີຍ"
 *  ແຕ່ວ່າງໝາຍວ່າ "ຍັງບໍ່ໄດ້ກຳນົດ" — ສອງອັນນີ້ຕ່າງກັນ. */
export function toCapacityNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** ຕູ້ ກວ້າງ×ຍາວ×ສູງ (cm) → m³. ດ້ານໃດວ່າງ ຫຼື 0 → null (ຄິດບໍ່ໄດ້). */
export function cargoBoxM3(
  widthCm: unknown,
  lengthCm: unknown,
  heightCm: unknown
): number | null {
  const w = toCapacityNumber(widthCm);
  const l = toCapacityNumber(lengthCm);
  const h = toCapacityNumber(heightCm);
  if (!w || !l || !h || w < 0 || l < 0 || h < 0) return null;
  return (w * l * h) / 1_000_000;
}

/** ປະລິມານທີ່ບັນທຸກໄດ້ຈິງ = ຈຸທັງໝົດ × % ໃຊ້ໄດ້ (ຫັກຊ່ອງຫວ່າງລະຫວ່າງກ່ອງ). */
export function usableM3(
  capacityM3: number | null,
  stowagePct: unknown,
  fallbackPct = 80
): number | null {
  if (capacityM3 === null) return null;
  const pct = toCapacityNumber(stowagePct) ?? fallbackPct;
  if (pct <= 0 || pct > 100) return null;
  return (capacityM3 * pct) / 100;
}

/** ຄວາມຈຸທີ່ຕົກລົງໃຊ້ຈິງຂອງລົດຄັນໜຶ່ງ: ຄ່າສະເພາະຄັນມາກ່ອນ, ບໍ່ມີຈຶ່ງໃຊ້ຂອງປະເພດ.
 *  ຕົກລົງເປັນ "ຊຸດ" — ຖ້າຄັນນີ້ວັດຕູ້ໄວ້ ກໍໃຊ້ຕູ້ຄັນນີ້ທັງກ້ອນ ບໍ່ປະສົມກັບປະເພດ. */
export function resolveCargoM3(
  car: { width?: unknown; length?: unknown; height?: unknown },
  type?: { width?: unknown; length?: unknown; height?: unknown } | null
): { m3: number | null; source: "car" | "type" | "none" } {
  const own = cargoBoxM3(car.width, car.length, car.height);
  if (own !== null) return { m3: own, source: "car" };
  const inherited = type ? cargoBoxM3(type.width, type.length, type.height) : null;
  if (inherited !== null) return { m3: inherited, source: "type" };
  return { m3: null, source: "none" };
}

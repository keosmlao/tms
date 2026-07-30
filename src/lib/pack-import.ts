// ອ່ານຕາຕະລາງສະເປັກຈາກໂຮງງານ (ເຊັ່ນ SCG) ທີ່ວາງມາເປັນຂໍ້ຄວາມ.
//
// ຈຸດປະສົງ: ຂໍ້ມູນຂະໜາດຫີບຂອງ SCG ມີຢູ່ແລ້ວຝັ່ງໂຮງງານ — ບໍ່ຄວນໃຫ້ຄັງໄປວັດຄືນ
// ແລະ ບໍ່ຄວນໃຫ້ລະບົບເດົາ. ໃຫ້ວາງຕາຕະລາງມາໂລດ ແລ້ວແປງເປັນແຖວ pack_dim.
//
// ຮັບໄດ້ທັງ tab (ວາງຈາກ Excel) ແລະ ຈຸດ ຫຼື comma. ຫົວຕາຕະລາງບໍ່ບັງຄັບ —
// ຖ້າມີຈະໃຊ້ຈັບຄູ່ຄໍລັມ, ຖ້າບໍ່ມີຈະຖືວ່າລຽງຕາມລຳດັບມາດຕະຖານ.

import { parseNominalSize, stripClassTokens } from "./nominal-size";

export interface PackImportRow {
  family: string;
  sizeKey: string | null;
  sizeLabel: string | null;
  packUnit: string | null;
  packQty: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  weightKg: number | null;
}

export interface PackImportResult {
  rows: PackImportRow[];
  errors: Array<{ line: number; text: string; reason: string }>;
}

/** ຊື່ຄໍລັມທີ່ຮັບຮູ້ — ລາວ, ໄທ ແລະ ອັງກິດ */
const COLUMN_ALIASES: Record<keyof PackImportRow | "size", string[]> = {
  family: ["ຕະກຸນ", "ສິນຄ້າ", "ຊື່", "รายการ", "family", "product", "name", "item"],
  size: ["ຂະໜາດ", "ขนาด", "size"],
  sizeKey: [],
  sizeLabel: [],
  packUnit: ["ຫົວໜ່ວຍ", "ຫໍ່", "หน่วย", "pack", "unit", "packunit"],
  packQty: ["ຈຳນວນ", "ຕໍ່ຫີບ", "จำนวน", "qty", "packqty", "pcs", "pcsperbox"],
  widthCm: ["ກວ້າງ", "กว้าง", "width", "w"],
  lengthCm: ["ຍາວ", "ยาว", "length", "l"],
  heightCm: ["ສູງ", "สูง", "height", "h"],
  weightKg: ["ນ້ຳໜັກ", "น้ำหนัก", "weight", "kg"],
};

/** ລຳດັບເລີ່ມຕົ້ນເມື່ອບໍ່ມີແຖວຫົວ */
const DEFAULT_ORDER = [
  "family",
  "size",
  "packUnit",
  "packQty",
  "widthCm",
  "lengthCm",
  "heightCm",
  "weightKg",
] as const;

function splitCells(line: string): string[] {
  // tab ມາກ່ອນ (ວາງຈາກ Excel), ບໍ່ດັ່ງນັ້ນ comma, ບໍ່ດັ່ງນັ້ນ 2 ຍະຫວ່າງຂຶ້ນໄປ
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (line.includes(",")) return line.split(",").map((c) => c.trim());
  return line.split(/\s{2,}/).map((c) => c.trim());
}

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/[\s_()./-]/g, "");
}

/** ຫາວ່າແຕ່ລະຄໍລັມແມ່ນຫຍັງ ຈາກແຖວຫົວ — null ຖ້າແຖວນີ້ບໍ່ແມ່ນຫົວ */
function detectHeader(cells: string[]): string[] | null {
  const mapped = cells.map((cell) => {
    const norm = normalizeHeader(cell);
    if (!norm) return null;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some((a) => norm.includes(normalizeHeader(a)))) return field;
    }
    return null;
  });
  // ຖືວ່າເປັນແຖວຫົວ ເມື່ອຈັບໄດ້ຢ່າງໜ້ອຍ 3 ຄໍລັມ ແລະ ບໍ່ມີເລກລ້ວນ
  const hits = mapped.filter(Boolean).length;
  const hasBareNumber = cells.some((c) => c !== "" && /^-?[\d.,]+$/.test(c));
  return hits >= 3 && !hasBareNumber ? (mapped as string[]) : null;
}

function toNumber(cell: string | undefined): number | null {
  if (!cell) return null;
  const cleaned = cell.replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * ແປງຂໍ້ຄວາມທີ່ວາງມາ ເປັນແຖວ pack_dim.
 *
 * ບໍ່ຮັບແຖວທີ່ຂາດຂະໜາດ ຫຼື ຈຳນວນຕໍ່ຫີບ — ຄືນເປັນ error ພ້ອມເລກແຖວ
 * ເພື່ອໃຫ້ຄົນແກ້ໄດ້ ແທນທີ່ຈະນຳເຂົ້າຂໍ້ມູນເຄິ່ງໆກາງໆ.
 */
export function parsePackImport(text: string): PackImportResult {
  const rows: PackImportRow[] = [];
  const errors: PackImportResult["errors"] = [];
  const lines = String(text ?? "").split(/\r?\n/);

  let order: string[] = [...DEFAULT_ORDER];
  let headerSeen = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const cells = splitCells(line);
    if (!headerSeen) {
      const header = detectHeader(cells);
      if (header) {
        order = header;
        headerSeen = true;
        return;
      }
      headerSeen = true; // ບໍ່ມີຫົວ — ໃຊ້ລຳດັບເລີ່ມຕົ້ນຕໍ່ໄປ
    }

    const get = (field: string): string | undefined => {
      const at = order.indexOf(field);
      return at >= 0 ? cells[at] : undefined;
    };

    const family = (get("family") ?? "").trim();
    if (!family) {
      errors.push({ line: index + 1, text: line, reason: "ບໍ່ມີຊື່ຕະກຸນ" });
      return;
    }

    const width = toNumber(get("widthCm"));
    const length = toNumber(get("lengthCm"));
    const height = toNumber(get("heightCm"));
    if (!width || !length || !height || width <= 0 || length <= 0 || height <= 0) {
      errors.push({ line: index + 1, text: line, reason: "ຂະໜາດຫີບບໍ່ຄົບ (ກວ້າງ/ຍາວ/ສູງ)" });
      return;
    }

    const packQty = toNumber(get("packQty"));
    if (!packQty || packQty <= 0) {
      errors.push({ line: index + 1, text: line, reason: "ຈຳນວນຕໍ່ຫີບບໍ່ຖືກ" });
      return;
    }

    const sizeText = (get("size") ?? "").trim();
    const size = sizeText ? parseNominalSize(stripClassTokens(sizeText)) : null;
    if (sizeText && !size) {
      errors.push({ line: index + 1, text: line, reason: `ອ່ານຂະໜາດ "${sizeText}" ບໍ່ໄດ້` });
      return;
    }

    rows.push({
      family,
      sizeKey: size?.sizeKey ?? null,
      sizeLabel: size?.label ?? null,
      packUnit: (get("packUnit") ?? "").trim() || null,
      packQty,
      widthCm: width,
      lengthCm: length,
      heightCm: height,
      weightKg: toNumber(get("weightKg")),
    });
  });

  return { rows, errors };
}

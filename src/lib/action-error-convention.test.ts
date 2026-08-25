import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ກັນບໍ່ໃຫ້ຮູບແບບເກົ່າກັບຄືນມາ. ເບິ່ງ AGENTS.md → "Error messages the user
// must see": ຢູ່ production Next ລົບ message ຂອງ Error ທີ່ອອກຈາກ Server
// Action ຖິ້ມ ຈຶ່ງຕ້ອງໃຊ້ userError()/userErrorMessage() ບໍ່ແມ່ນ new Error()
// ກັບ error.message ດິບໆ.

const SRC = join(process.cwd(), "src");

function walk(dir: string, keep: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, keep));
    else if (keep(path)) found.push(path);
  }
  return found;
}

const rel = (path: string) => path.slice(SRC.length + 1);
const read = (path: string) => readFileSync(path, "utf8");

/** ບັນທັດທີ່ຂຶ້ນຕົ້ນ statement — ໃຊ້ຫາເລກແຖວໃຫ້ຂໍ້ຄວາມ error ອ່ານງ່າຍ */
function offending(path: string, pattern: RegExp): string[] {
  return read(path)
    .split("\n")
    .map((line, i) => (pattern.test(line) ? `${rel(path)}:${i + 1}  ${line.trim()}` : ""))
    .filter(Boolean);
}

describe("ຂໍ້ຄວາມຜິດພາດຕ້ອງລອດຜ່ານ production build", () => {
  it("src/queries + src/actions ບໍ່ໂຍນ new Error() ທີ່ມີຂໍ້ຄວາມພາສາລາວ/ໄທ", () => {
    // ຂໍ້ຄວາມພາສາລາວ ຫຼື ໄທ = ຕັ້ງໃຈໃຫ້ຜູ້ໃຊ້ອ່ານ → ຕ້ອງເປັນ userError()
    const pattern = /throw new Error\([^)]*[฀-໿]/;
    const files = [
      ...walk(join(SRC, "queries"), (p) => p.endsWith(".js")),
      ...walk(join(SRC, "actions"), (p) => p.endsWith(".ts")),
    ];
    expect(files.flatMap((f) => offending(f, pattern))).toEqual([]);
  });

  it("ໜ້າຈໍບໍ່ອ່ານ error.message ດິບໆ (ຢູ່ prod ຈະໄດ້ປະໂຫຍກອັງກິດຂອງ Next)", () => {
    const pattern = /instanceof Error \? \w+\.message|as Error\)\?\.message/;
    const files = walk(SRC, (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"));
    // route handler ຢູ່ src/app/api/** ບໍ່ຖືກລົບຂໍ້ຄວາມ ຈຶ່ງບໍ່ນັບ
    const screens = files.filter((p) => !rel(p).startsWith(join("app", "api")));
    expect(screens.flatMap((f) => offending(f, pattern))).toEqual([]);
  });
});

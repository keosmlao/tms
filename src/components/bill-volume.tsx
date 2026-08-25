"use client";

import { useEffect, useState } from "react";
import { FaSpinner, FaTimes } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { userErrorMessage } from "@/lib/action-error";

export interface BillVolume {
  m3: number;
  lines: number;
  linesUnknown: number;
  coveragePct: number;
}

export interface BillItemVolume {
  itemCode: string;
  itemName: string;
  unitCode: string;
  qty: number;
  unitM3: number | null;
  totalM3: number | null;
  source: string | null;
  label: string | null;
}

/** ຊື່ອ່ານງ່າຍຂອງແຫຼ່ງທີ່ມາຂອງຂະໜາດ — ໃຫ້ຄົນຮູ້ວ່າເລກນີ້ໜ້າເຊື່ອຖືປານໃດ */
export const VOLUME_SOURCE_LABEL: Record<string, string> = {
  master: "ວັດຈິງ",
  pipe_formula: "ສູດທໍ່",
  pack_measured: "ຫີບທີ່ວັດ",
  pack_estimated: "ຄາດຈາກຕະກຸນ",
  fitting_derived: "ຄາດຈາກຮູບຊົງ",
};

/** ດຶງ m³ ຂອງຫຼາຍບິນພ້ອມກັນ — ຕໍ່ຊຸດທີ່ເຫັນ ບໍ່ແມ່ນຕໍ່ແຖວ */
export function useBillVolumes(billNos: string[]) {
  const [volumes, setVolumes] = useState<Record<string, BillVolume>>({});
  const key = billNos.join(",");

  useEffect(() => {
    const need = billNos.filter((b) => b && !(b in volumes));
    if (need.length === 0) return;
    let cancelled = false;
    void Actions.getPendingBillVolumes(need)
      .then((data) => {
        if (!cancelled) setVolumes((prev) => ({ ...prev, ...(data as Record<string, BillVolume>) }));
      })
      .catch((e) => console.error("getPendingBillVolumes", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return volumes;
}

/**
 * ປ້າຍ m³ ຂອງບິນ.
 *
 * `freeM3` = ທີ່ວ່າງຂອງຖ້ຽວທີ່ກຳລັງຈັດ (ຖ້າມີ) — ໃຫຍ່ກວ່ານັ້ນຈະເປັນສີແດງ
 * ເພື່ອບອກລ່ວງໜ້າວ່າໃສ່ແລ້ວລົ້ນ. `+` ຫຼັງເລກ = ຍັງມີລາຍການທີ່ບໍ່ຮູ້ຂະໜາດ
 * ສະນັ້ນຄ່າຈິງຫຼາຍກວ່າທີ່ເຫັນ.
 */
export function BillVolumeTag({
  v,
  freeM3 = null,
  onClick,
}: {
  v?: BillVolume;
  freeM3?: number | null;
  onClick?: () => void;
}) {
  if (!v) return null;

  const base = "shrink-0 rounded px-1 text-[9px] font-bold";
  const clickable = onClick ? " cursor-pointer hover:ring-1 hover:ring-current" : "";

  if (v.m3 <= 0) {
    return (
      <span
        onClick={onClick}
        className={`${base} bg-slate-500/10 text-slate-400${clickable}`}
        title="ຍັງບໍ່ຮູ້ຂະໜາດສິນຄ້າໃນບິນນີ້ — ກົດເບິ່ງລາຍລະອຽດ"
      >
        ? m³
      </span>
    );
  }

  const tooBig = freeM3 !== null && v.m3 > freeM3;
  return (
    <span
      onClick={onClick}
      className={`${base}${clickable} ${
        tooBig
          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "bg-teal-500/10 text-teal-700 dark:text-teal-400"
      }`}
      title={
        (tooBig ? `ໃຫຍ່ກວ່າທີ່ວ່າງຂອງຖ້ຽວທີ່ເລືອກ (${freeM3?.toFixed(1)} m³)\n` : "") +
        (v.linesUnknown > 0
          ? `ຮູ້ຂະໜາດ ${v.coveragePct.toFixed(0)}% ຂອງລາຍການ — ຄ່າຈິງຫຼາຍກວ່ານີ້`
          : "ຮູ້ຂະໜາດຄົບທຸກລາຍການ")
      }
    >
      {v.m3.toFixed(v.m3 < 10 ? 2 : 1)} m³
      {v.linesUnknown > 0 && "+"}
      {tooBig && " ⚠"}
    </span>
  );
}

/** Modal ລາຍລະອຽດສິນຄ້າໃນບິນ ພ້ອມ m³ ຕໍ່ແຖວ ແລະ ແຫຼ່ງທີ່ມາຂອງຂະໜາດ */
export function BillItemsModal({
  billNo,
  custName,
  onClose,
}: {
  billNo: string;
  custName?: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<BillItemVolume[]>([]);
  const [totalM3, setTotalM3] = useState(0);
  const [linesUnknown, setLinesUnknown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Actions.getBillItemVolumes(billNo)
      .then((data) => {
        if (!alive) return;
        const d = data as { items: BillItemVolume[]; totalM3: number; linesUnknown: number };
        setItems(d.items ?? []);
        setTotalM3(d.totalM3 ?? 0);
        setLinesUnknown(d.linesUnknown ?? 0);
      })
      .catch((e) => alive && setError(userErrorMessage(e, String(e))))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [billNo]);

  const maxM3 = Math.max(...items.map((i) => i.totalM3 ?? 0), 0.0001);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="glass max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-800 dark:text-white">
              {billNo}
              {custName ? ` · ${custName}` : ""}
            </h3>
            <p className="text-[11px] text-slate-500">
              {items.length} ລາຍການທີ່ຍັງເຫຼືອ ·{" "}
              <span className="font-bold text-teal-700 dark:text-teal-400">
                ລວມ {totalM3.toFixed(3)} m³
              </span>
              {linesUnknown > 0 && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  · {linesUnknown} ລາຍການຍັງບໍ່ຮູ້ຂະໜາດ (ຄ່າຈິງຫຼາຍກວ່ານີ້)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-sm text-slate-400">
              <FaSpinner className="mr-2 animate-spin" /> ກຳລັງໂຫຼດ...
            </div>
          ) : error ? (
            <p className="px-5 py-8 text-center text-xs text-rose-500">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400">ບໍ່ມີລາຍການທີ່ຍັງເຫຼືອ</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/80 backdrop-blur dark:bg-slate-900/80">
                <tr className="border-b border-slate-200/40 text-[10px] text-slate-500 dark:border-white/5">
                  <th className="px-4 py-2 text-left font-semibold">ສິນຄ້າ</th>
                  <th className="px-2 py-2 text-right font-semibold">ຈຳນວນ</th>
                  <th className="px-2 py-2 text-right font-semibold">m³/ໜ່ວຍ</th>
                  <th className="px-2 py-2 text-right font-semibold">ລວມ m³</th>
                  <th className="px-4 py-2 text-left font-semibold">ທີ່ມາ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr
                    key={i.itemCode}
                    className="border-b border-slate-200/20 dark:border-white/5"
                  >
                    <td className="px-4 py-2">
                      <span className="block truncate text-slate-700 dark:text-slate-200">
                        {i.itemName || i.itemCode}
                      </span>
                      <span className="font-mono text-[9px] text-slate-400">{i.itemCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {i.qty.toLocaleString()}{" "}
                      <span className="text-[10px] text-slate-400">{i.unitCode}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                      {i.unitM3 !== null ? i.unitM3.toFixed(5) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {i.totalM3 === null ? (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          ບໍ່ຮູ້
                        </span>
                      ) : (
                        <div className="min-w-[70px]">
                          <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                            {i.totalM3.toFixed(3)}
                          </span>
                          <div className="mt-0.5 h-1 w-full rounded-full bg-slate-500/10">
                            <div
                              className="h-full rounded-full bg-teal-500/70"
                              style={{ width: `${(i.totalM3 / maxM3) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {i.source ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                            i.source === "master" ||
                            i.source === "pipe_formula" ||
                            i.source === "pack_measured"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          }`}
                          title={i.label ?? undefined}
                        >
                          {VOLUME_SOURCE_LABEL[i.source] ?? i.source}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400">ຍັງບໍ່ໄດ້ວັດ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="border-t border-slate-200/30 px-5 py-2 text-[10px] leading-relaxed text-slate-400 dark:border-white/5">
          ສີຂຽວ = ວັດຈິງ ຫຼື ສູດມາດຕະຖານ · ສີເຫຼືອງ = ຄ່າຄາດຄະເນ (ອາດຜິດ ±40%) ·
          ລາຍການທີ່ &quot;ຍັງບໍ່ໄດ້ວັດ&quot; ບໍ່ໄດ້ນັບເຂົ້າຍອດລວມ
        </p>
      </div>
    </div>
  );
}

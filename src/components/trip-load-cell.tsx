"use client";

import { useEffect, useState } from "react";
import { Actions } from "@/lib/api";

export interface TripVolume {
  m3: number;
  usableM3: number | null;
  utilizationPct: number | null;
  freeM3: number | null;
  coveragePct: number;
  linesUnknown: number;
  dataSufficient: boolean;
  car: string;
}

/**
 * ດຶງ % ພື້ນທີ່ຂອງຫຼາຍຖ້ຽວພ້ອມກັນ — ຕໍ່ໜ້າ ບໍ່ແມ່ນຕໍ່ແຖວ.
 *
 * ສົ່ງແຕ່ doc_no ຂອງແຖວທີ່ເຫັນຢູ່ໜ້ານັ້ນເຂົ້າມາ. ອັນທີ່ດຶງແລ້ວຈະ cache ໄວ້
 * ຈຶ່ງປ່ຽນໜ້າໄປມາບໍ່ດຶງຊ້ຳ.
 */
export function useTripVolumes(docNos: string[]) {
  const [volumes, setVolumes] = useState<Record<string, TripVolume>>({});
  const [failed, setFailed] = useState(false);
  const key = docNos.join(",");

  useEffect(() => {
    const need = docNos.filter((d) => d && !(d in volumes));
    if (need.length === 0) return;
    let cancelled = false;
    void Actions.getTripVolumesBulk(need)
      .then((data) => {
        if (cancelled) return;
        setFailed(false);
        setVolumes((prev) => ({ ...prev, ...(data as Record<string, TripVolume>) }));
      })
      .catch((e) => {
        console.error("getTripVolumesBulk", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { volumes, failed };
}

/**
 * ຊ່ອງ "% ທີ່ຂົນ" — ໃຊ້ຮ່ວມກັນທຸກຕາຕະລາງຖ້ຽວ ເພື່ອໃຫ້ອ່ານຄືກັນໝົດ.
 *
 * ສະແດງ m³ ສະເໝີ ແຕ່ສະແດງ % ສະເພາະເມື່ອຮູ້ຂະໜາດພຽງພໍ — ບອກ "ຂໍ້ມູນບໍ່ພໍ"
 * ດີກວ່າໃຫ້ຄົນເຫັນລົດຫວ່າງແລ້ວບັນທຸກເພີ່ມຍ້ອນລາຍການທີ່ບໍ່ຮູ້ຂະໜາດ.
 */
export function TripLoadCell({ v, failed }: { v?: TripVolume; failed?: boolean }) {
  if (failed && !v) {
    return (
      <span className="text-[10px] text-rose-500" title="ໂຫຼດຂໍ້ມູນພື້ນທີ່ບໍ່ສຳເລັດ">
        ໂຫຼດບໍ່ໄດ້
      </span>
    );
  }
  if (!v) return <span className="text-[10px] text-slate-300">…</span>;

  if (v.utilizationPct === null) {
    return (
      <span
        className="text-[10px] text-slate-400"
        title={
          v.usableM3 === null
            ? "ລົດຄັນນີ້ຍັງບໍ່ໄດ້ວັດຕູ້ — ໄປໃສ່ທີ່ ຈັດການ → ຂໍ້ມູນລົດ"
            : `ຮູ້ຂະໜາດພຽງ ${v.coveragePct.toFixed(0)}% ຂອງລາຍການ`
        }
      >
        {v.usableM3 === null ? "ບໍ່ມີຄວາມຈຸ" : "ຂໍ້ມູນບໍ່ພໍ"}
        <span className="block tabular-nums text-slate-400">{v.m3.toFixed(1)} m³</span>
      </span>
    );
  }

  const pct = v.utilizationPct;
  const tone =
    pct > 100
      ? "text-rose-600 dark:text-rose-400"
      : pct > 85
        ? "text-amber-600 dark:text-amber-400"
        : pct < 25
          ? "text-sky-600 dark:text-sky-400"
          : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="min-w-[74px]">
      <div className="flex items-baseline gap-1">
        <span className={`text-xs font-bold tabular-nums ${tone}`}>{pct.toFixed(0)}%</span>
        {pct > 100 && (
          <span title="ເກີນ 100% — ຄວນກວດຂໍ້ມູນຖ້ຽວ" className="text-[10px] text-rose-500">
            ⚠
          </span>
        )}
      </div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-500/10">
        <div
          className={`h-full rounded-full ${
            pct > 100 ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[9px] tabular-nums text-slate-400">
        {v.m3.toFixed(1)}/{v.usableM3?.toFixed(1)} m³
        {v.linesUnknown > 0 && (
          <span
            className="ml-0.5 text-amber-600 dark:text-amber-400"
            title={`${v.linesUnknown} ລາຍການບໍ່ຮູ້ຂະໜາດ — % ນີ້ຕໍ່າກວ່າຄວາມຈິງ`}
          >
            −{v.linesUnknown}
          </span>
        )}
      </span>
    </div>
  );
}

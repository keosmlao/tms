"use client";

import { useState } from "react";
import {
  FaBook,
  FaBox,
  FaCheckCircle,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaGasPump,
  FaMapMarkedAlt,
  FaRoute,
  FaTruck,
  FaUserTie,
} from "react-icons/fa";
import { StatusPageHeader } from "@/components/status-page-shell";

type TabKey = "manual" | "workflow" | "sop" | "wi";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "manual", label: "ຄູ່ມືການໃຊ້ງານ", icon: <FaBook /> },
  { key: "workflow", label: "Workflow", icon: <FaRoute /> },
  { key: "sop", label: "SOP", icon: <FaClipboardCheck /> },
  { key: "wi", label: "WI", icon: <FaTruck /> },
];

// ------- ວົງຈອນຊີວິດຂອງບິນ 11 ຂັ້ນ -------
const PIPELINE: { n: number; label: string; owner: string; tone: string }[] = [
  { n: 1, label: "ລໍຖ້າຈັດຖ້ຽວ", owner: "office", tone: "bg-slate-400" },
  { n: 2, label: "ລໍຕາມເສັ້ນທາງ", owner: "office", tone: "bg-indigo-500" },
  { n: 3, label: "ໃບງານ", owner: "office", tone: "bg-indigo-500" },
  { n: 4, label: "ອະນຸມັດ", owner: "ຫົວໜ້າ", tone: "bg-amber-500" },
  { n: 5, label: "ລໍຮັບຖ້ຽວ", owner: "ຄົນຂັບ", tone: "bg-sky-500" },
  { n: 6, label: "ເບີກເຄື່ອງ", owner: "ຄົນຂັບ", tone: "bg-sky-500" },
  { n: 7, label: "ລໍຈັດສົ່ງ", owner: "ຄົນຂັບ", tone: "bg-sky-500" },
  { n: 8, label: "ກຳລັງສົ່ງ", owner: "ຄົນຂັບ", tone: "bg-sky-600" },
  { n: 9, label: "ສຳເລັດ", owner: "ຄົນຂັບ", tone: "bg-emerald-500" },
  { n: 10, label: "ປິດງານ", owner: "ຄົນຂັບ", tone: "bg-emerald-600" },
  { n: 11, label: "ປິດສຳເລັດ", owner: "office", tone: "bg-emerald-700" },
];

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200/70 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/65 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-slate-800 dark:text-white">
      {children}
    </h2>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-slate-50 px-3 py-2 text-left text-[11px] font-bold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-t border-slate-100 px-3 py-2 align-top text-slate-600 dark:border-slate-800 dark:text-slate-300">
      {children}
    </td>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "amber" | "emerald" | "rose" | "sky";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* =========================================================
   ຄູ່ມືການໃຊ້ງານ
========================================================= */
function ManualTab() {
  return (
    <div className="space-y-5">
      {/* pipeline */}
      <Card>
        <SectionTitle>ວົງຈອນຊີວິດຂອງບິນ (Bill Lifecycle)</SectionTitle>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          ບິນໄຫຼຈາກຊ້າຍ → ຂວາ ຜ່ານ 11 ສະຖານະ. ສີບອກຜູ້ຮັບຜິດຊອບ.
        </p>
        <div className="mt-4 flex gap-1 overflow-x-auto pb-2">
          {PIPELINE.map((s, i) => (
            <div
              key={s.n}
              className="relative flex min-w-[92px] flex-1 flex-col items-center px-1 text-center"
            >
              {i < PIPELINE.length - 1 && (
                <span className="absolute top-4 left-1/2 h-0.5 w-full bg-slate-200 dark:bg-slate-700" />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-4 ring-white dark:ring-slate-900 ${s.tone}`}
              >
                {s.n}
              </span>
              <span className="mt-2 text-[11px] leading-tight text-slate-700 dark:text-slate-300">
                {s.label}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                {s.owner}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ໝວດຂົນສົ່ງ */}
      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <SectionTitle>ໝວດ “ຂົນສົ່ງ” — ຫົວໃຈຂອງລະບົບ</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr>
                <Th>ເມນູ</Th>
                <Th>ໝາຍເຖິງ</Th>
                <Th>ເຮັດຫຍັງ</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>
                  <Pill tone="amber">ລໍຖ້າຈັດຖ້ຽວ</Pill>
                </Td>
                <Td>ບິນຮັບເຂົ້າ ຍັງບໍ່ຈັດ</Td>
                <Td>ກຳນົດວັນ/ຮອບ/ເສັ້ນທາງ → ຈັດເຂົ້າໃບງານ</Td>
              </tr>
              <tr>
                <Td>ບິນລໍຕາມເສັ້ນທາງ</Td>
                <Td>ຈັດເສັ້ນທາງແລ້ວ</Td>
                <Td>ຈັດກຸ່ມຕາມເສັ້ນທາງ</Td>
              </tr>
              <tr>
                <Td>ໃບງານ/ລໍຖ້າອະນຸມັດ</Td>
                <Td>ໃບງານລໍອະນຸມັດ</Td>
                <Td>ກວດຄວາມຖືກຕ້ອງກ່ອນສົ່ງ</Td>
              </tr>
              <tr>
                <Td>ລໍຖ້າຮັບຖ້ຽວ / ເບີກເຄື່ອງ / ຈັດສົ່ງ</Td>
                <Td>ຄົນຂັບຮັບ ແລະ ກຽມ</Td>
                <Td>ຕິດຕາມການຮັບຖ້ຽວ, ປະສານສາງ</Td>
              </tr>
              <tr>
                <Td>ກຳລັງຈັດສົ່ງ</Td>
                <Td>ລົດອອກແລ່ນ</Td>
                <Td>ຕິດຕາມ realtime ຜ່ານ GPS</Td>
              </tr>
              <tr>
                <Td>
                  <Pill tone="emerald">ຈັດສົ່ງສຳເລັດ</Pill>
                </Td>
                <Td>ສົ່ງຄົບແລ້ວ</Td>
                <Td>ກວດຮູບຫຼັກຖານການສົ່ງ</Td>
              </tr>
              <tr>
                <Td>
                  <Pill tone="rose">ບິນສົ່ງບໍ່ຄົບ</Pill>
                </Td>
                <Td>ສົ່ງບາງສ່ວນ/ຄືນ</Td>
                <Td>ຕິດຕາມສາເຫດ, ຈັດຮອບຕໍ່ໄປ</Td>
              </tr>
              <tr>
                <Td>ຄົນຂັບປິດງານ → ປິດສຳເລັດແລ້ວ</Td>
                <Td>ຈົບຂະບວນການ</Td>
                <Td>office ກວດຮັບ → ປິດ → ເຂົ້າລາຍງານ</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ໝວດອື່ນ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            icon: <FaMapMarkedAlt className="text-sky-600" />,
            title: "ຕິດຕາມ",
            body: "ຄົ້ນຫາບິນ, ແຜນທີ່ລົດ (GPS ຮາດແວ/ມືຖື), ເສັ້ນທາງຄົນຂັບ, ສະຫຼຸບ GPS/ວັນ",
          },
          {
            icon: <FaClipboardCheck className="text-amber-600" />,
            title: "ອະນຸມັດ",
            body: "ລໍອະນຸມັດ / ອະນຸມັດແລ້ວ ພ້ອມລາຍງານ",
          },
          {
            icon: <FaUserTie className="text-emerald-600" />,
            title: "ລາຍງານ",
            body: "ປະຈຳວັນ, ຕາມຄົນຂັບ/ລົດ/ບິນ, ປະຈຳເດືອນ, Leaderboard — export Excel ໄດ້",
          },
          {
            icon: <FaGasPump className="text-orange-600" />,
            title: "ນ້ຳມັນ",
            body: "ບັນທຶກ/ກວດ ການເຕີມນ້ຳມັນ (ຄົນຂັບບັນທຶກຈາກແອັບ)",
          },
          {
            icon: <FaBox className="text-teal-600" />,
            title: "ທັນໃຈ Express",
            body: "ຂົນສົ່ງດ່ວນ ThunJai: ຈັດການ, ສ້າງ Order, ພາບລວມ",
          },
          {
            icon: <FaTruck className="text-slate-600" />,
            title: "ການຈັດການ",
            body: "ຂໍ້ມູນລົດ, ປະເພດລົດ, ພະນັກງານ, ເສັ້ນທາງ, ຮອບຈັດສົ່ງ, ຕັ້ງຄ່າ, Audit Log",
          },
        ].map((m) => (
          <Card key={m.title} className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-base">
              {m.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {m.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {m.body}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-sky-200/70 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/30">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <b className="text-slate-800 dark:text-white">ຕິດຕາມສາທາລະນະ:</b>{" "}
          ລູກຄ້າເປີດ <code className="rounded bg-slate-500/10 px-1">/track</code>{" "}
          ໃສ່ເລກບິນ (ບໍ່ຕ້ອງ login) ແລະ ໃຫ້ຄະແນນທີ່{" "}
          <code className="rounded bg-slate-500/10 px-1">/rate</code>.
        </p>
      </Card>
    </div>
  );
}

/* =========================================================
   Workflow
========================================================= */
function WorkflowTab() {
  const rows = [
    ["1–3", "ຈັດຖ້ຽວ → ເສັ້ນທາງ → ໃບງານ", "office / dispatch", "Web", "ໃບງານພ້ອມສົ່ງອະນຸມັດ"],
    ["4", "ອະນຸມັດ", "ຫົວໜ້າ / ຜູ້ຄຸມ", "Web", "ໃບງານຖືກອະນຸມັດ"],
    ["5–7", "ຮັບຖ້ຽວ → ເບີກເຄື່ອງ → ພ້ອມສົ່ງ", "ຄົນຂັບ + ສາງ", "ແອັບ", "ເບີກສິນຄ້າຄົບ"],
    ["8", "ກຳລັງຈັດສົ່ງ", "ຄົນຂັບ", "ແອັບ + GPS", "ຕິດຕາມ realtime"],
    ["9", "ສຳເລັດ / ບໍ່ຄົບ", "ຄົນຂັບ", "ແອັບ", "ຮູບຫຼັກຖານການສົ່ງ"],
    ["10–11", "ປິດງານ → ປິດສຳເລັດ", "ຄົນຂັບ → office", "ແອັບ → Web", "ເຂົ້າລາຍງານ"],
  ];
  const decisions = [
    {
      tone: "border-l-amber-500",
      title: "ຈຸດຕັດສິນ · ອະນຸມັດ (ຂັ້ນ 4)",
      body: "ກວດ ລົດ/ຄົນຂັບ/ນ້ຳໜັກ/ເສັ້ນທາງ. ຜ່ານ → ລໍຮັບຖ້ຽວ · ບໍ່ຜ່ານ → ຕີກັບພ້ອມເຫດຜົນ.",
    },
    {
      tone: "border-l-rose-500",
      title: "ຈຸດຕັດສິນ · ສົ່ງ (ຂັ້ນ 9)",
      body: "ຄົບ → complete + ຮູບ · ບໍ່ຄົບ → return + ເຫດຜົນ · ຍົກເລີກ → ຕ້ອງໄດ້ອະນຸຍາດ.",
    },
    {
      tone: "border-l-emerald-500",
      title: "ຈຸດຕັດສິນ · ກວດຮັບ (ຂັ້ນ 11)",
      body: "office ກວດຮູບ + ຈຳນວນ. ຂາດ/ຜິດ → ຕີກັບໃຫ້ຄົນຂັບ (revert/edit) ກ່ອນປິດ.",
    },
    {
      tone: "border-l-sky-500",
      title: "ຂະບວນການເສີມ · GPS",
      body: "ຂະນະສົ່ງ ແອັບສົ່ງພິກັດອັດຕະໂນມັດ. ສົ່ງບໍ່ໄດ້ → ລາຍງານເຫດຜົນ (GPS ປິດ / ບໍ່ອະນຸຍາດ / token ໝົດ).",
    },
  ];
  return (
    <div className="space-y-5">
      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <SectionTitle>ຂັ້ນຕອນການເຮັດວຽກ (Swimlane)</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr>
                <Th>ຂັ້ນ</Th>
                <Th>ສະຖານະ</Th>
                <Th>ຜູ້ຮັບຜິດຊອບ</Th>
                <Th>ເຄື່ອງມື</Th>
                <Th>ຜົນທີ່ໄດ້</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => (
                    <Td key={i}>{c}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {decisions.map((d) => (
          <div
            key={d.title}
            className={`rounded-lg border border-slate-200/70 border-l-4 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/65 ${d.tone}`}
          >
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              {d.title}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {d.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   SOP
========================================================= */
function SopTab() {
  const roles = [
    {
      color: "border-t-indigo-500",
      title: "Office / Dispatch",
      tag: "SOP-1 · ຈັດຖ້ຽວ & ໃບງານ",
      steps: [
        "ຕົ້ນວັນ: ກວດ ລໍຖ້າຈັດຖ້ຽວ ທັງໝົດ",
        "ຈັດ ວັນ/ຮອບ/ເສັ້ນທາງ, ຈັດບິນທາງດຽວກັນເຂົ້າໃບງານດຽວ",
        "ຈັບຄູ່ ລົດ + ຄົນຂັບ ໃຫ້ພໍກັບນ້ຳໜັກ",
        "ກວດ → ສົ່ງອະນຸມັດ",
        "ຕິດຕາມບິນຄ້າງ + GPS ຕະຫຼອດວັນ",
        "ກວດຮັບ → ປິດງານ; ທ້າຍວັນອອກລາຍງານ",
      ],
      rule: "ຕ້ອງ: ບໍ່ເກີນຄວາມສາມາດລົດ · ຍົກເລີກຕ້ອງມີເຫດຜົນ+ອະນຸຍາດ",
    },
    {
      color: "border-t-amber-500",
      title: "ຫົວໜ້າ / ຜູ້ຄຸມ",
      tag: "SOP-2 · ອະນຸມັດ & KPI",
      steps: [
        "ອະນຸມັດໃບງານພາຍໃນ SLA",
        "ຕິດຕາມ realtime ຜ່ານແຜນທີ່",
        "ຕິດຕາມ KPI ຈາກລາຍງານ",
        "ຈັດການເຫດ: ຄ້າງນານ / ບໍ່ຄົບ / ຫຼຸດເສັ້ນທາງ",
        "ພິຈາລະນາຄຳຂໍ ຍົກເລີກ/ແກ້ໄຂ",
      ],
      rule: "ຕ້ອງ: ບໍ່ອະນຸມັດຂໍ້ມູນບໍ່ຄົບ · ຕີກັບຕ້ອງມີເຫດຜົນ",
    },
    {
      color: "border-t-sky-500",
      title: "ຄົນຂັບລົດ",
      tag: "SOP-3 · ຮັບ–ສົ່ງ ຕໍ່ຖ້ຽວ",
      steps: [
        "ກ່ອນອອກ: login, ເປີດ GPS+Notification, ກວດ battery",
        "ຮັບຖ້ຽວ → ເບີກເຄື່ອງ (ກວດຈຳນວນ)",
        "ເລີ່ມສົ່ງ → ເຊັກອິນ → ຖ່າຍຮູບ → ສົ່ງສຳເລັດ",
        "ບໍ່ຄົບ → ສົ່ງຄືນ+ເຫດຜົນ",
        "ບັນທຶກນ້ຳມັນ → ປິດງານ",
      ],
      rule: "ຕ້ອງ: ບໍ່ສົ່ງສຳເລັດໂດຍບໍ່ມີຮູບ · ຫ້າມປິດ GPS · ຮູບ < 8MB",
    },
    {
      color: "border-t-emerald-500",
      title: "ຝ່າຍຂາຍ",
      tag: "SOP-4 · ຕິດຕາມລູກຄ້າ",
      steps: [
        "ຕິດຕາມ ບິນສົ່ງບໍ່ສຳເລັດ ຂອງລູກຄ້າຕົນ",
        "ກຳນົດວັນຈັດສົ່ງຮ່ວມ office",
        "ຢືນຢັນ ບິນສົ່ງສຳເລັດ + ຕິດຕາມຄຳຕິຊົມ",
      ],
      rule: "ໝາຍເຫດ: ບັນຊີຝ່າຍຂາຍຖືກຈຳກັດຂອບເຂດການເຫັນຂໍ້ມູນ",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {roles.map((r) => (
        <div
          key={r.title}
          className={`rounded-lg border border-slate-200/70 border-t-4 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/65 ${r.color}`}
        >
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            {r.title}
          </p>
          <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {r.tag}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate-600 dark:text-slate-300">
            {r.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-[12px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {r.rule}
          </p>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   WI
========================================================= */
function WiTab() {
  const cards = [
    {
      code: "WI-A1",
      title: "ຈັດຖ້ຽວບິນ",
      steps: ["ເມນູ ຂົນສົ່ງ › ລໍຖ້າຈັດຖ້ຽວ", "ໝາຍເລືອກບິນ (ໄດ້ຫຼາຍໃບ)", "ກຳນົດ ວັນ · ຮອບ · ເສັ້ນທາງ", "ບັນທຶກ → ໄປ ບິນລໍຕາມເສັ້ນທາງ"],
    },
    {
      code: "WI-A2",
      title: "ສ້າງໃບງານ",
      steps: ["ເມນູ ບິນລໍຕາມເສັ້ນທາງ", "ເລືອກກຸ່ມ → ສ້າງໃບງານ", "ເລືອກ ລົດ + ຄົນຂັບ (ກວດນ້ຳໜັກ)", "ສົ່ງອະນຸມັດ"],
    },
    {
      code: "WI-A3",
      title: "ກວດຮັບ & ປິດງານ",
      steps: ["ເມນູ ຄົນຂັບປິດງານ", "ກວດຮູບ + ຈຳນວນ ຕໍ່ບິນ", "ຄົບ → ປິດສຳເລັດ", "ຂາດ → ຕີກັບພ້ອມໝາຍເຫດ"],
    },
    {
      code: "WI-B1",
      title: "ອະນຸມັດ / ຕີກັບ",
      steps: ["ເມນູ ອະນຸມັດ › ລໍອະນຸມັດ", "ກວດ ລົດ/ຄົນຂັບ/ນ້ຳໜັກ/ເສັ້ນທາງ", "ຖືກ → ອະນຸມັດ", "ບໍ່ຖືກ → ຕີກັບ+ເຫດຜົນ"],
    },
    {
      code: "WI-C1–3",
      title: "ຄົນຂັບ: ຮັບ → ສົ່ງ",
      steps: ["ຮັບຖ້ຽວ → ເບີກເຄື່ອງ (ກວດຈຳນວນ)", "ເລີ່ມຈັດສົ່ງ (GPS ຫ້າມປິດ)", "ຮອດຈຸດ → ເຊັກອິນ", "ມອບ → ຖ່າຍຮູບ → ສົ່ງບິນສຳເລັດ"],
    },
    {
      code: "WI-C4–6",
      title: "ຄົນຂັບ: ບໍ່ຄົບ & ນ້ຳມັນ",
      steps: ["ບໍ່ຄົບ → ສົ່ງຄືນ + ເຫດຜົນ (+ຮູບ)", "ຍົກເລີກ → ເຫດຜົນ (ຕ້ອງອະນຸຍາດ)", "ນ້ຳມັນ → ໃສ່ຈຳນວນ + ຮູບໃບບິນ", "ຈົບ → ປິດງານ"],
    },
    {
      code: "WI-D1",
      title: "ຝ່າຍຂາຍ: ຕິດຕາມບິນ",
      steps: ["ເມນູ ຝ່າຍຂາຍ › ບິນສົ່ງບໍ່ສຳເລັດ", "ຄົ້ນຫາຕາມລູກຄ້າ/ເລກບິນ", "ກຳນົດວັນຈັດສົ່ງ (ປະສານ office)"],
    },
    {
      code: "WI-E1",
      title: "ລູກຄ້າ: ຕິດຕາມ",
      steps: ["ເປີດ /track", "ໃສ່ເລກບິນ → ເບິ່ງສະຖານະ", "ໃຫ້ຄະແນນທີ່ /rate"],
    },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.code}>
            <span className="rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-teal-600 dark:text-teal-400">
              {c.code}
            </span>
            <p className="mt-2 mb-2 text-sm font-bold text-slate-800 dark:text-white">
              {c.title}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate-600 dark:text-slate-300">
              {c.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-rose-200/70 border-l-4 border-l-rose-500 bg-rose-50/60 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
        <FaExclamationTriangle className="mt-0.5 shrink-0 text-rose-500" />
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            ຄົນຂັບກົດສົ່ງບໍ່ໄດ້?
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            ກວດເນັດ · token ໝົດອາຍຸ (ຫຼຸດ 8 ຊມ) → login ໃໝ່ · ຮູບໃຫຍ່ເກີນ → ຫຼຸດ &lt; 8MB.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  const [tab, setTab] = useState<TabKey>("manual");
  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຄູ່ມືການໃຊ້ງານລະບົບ"
        subtitle="ຄູ່ມືການໃຊ້ງານ · Workflow · SOP · WI — ຄົບທັງລະບົບ ODG TMS"
        tone="teal"
        icon={<FaBook />}
      />

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-white/70 text-slate-600 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span className="text-[13px]">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "manual" && <ManualTab />}
      {tab === "workflow" && <WorkflowTab />}
      {tab === "sop" && <SopTab />}
      {tab === "wi" && <WiTab />}

      <p className="flex items-center gap-2 pt-2 text-[11px] text-slate-400">
        <FaCheckCircle className="text-emerald-500" />
        ຄູ່ມືຮຸ່ນ 1.0 · ອັບເດດ 2026-07-22 · ຕົ້ນສະບັບ Markdown ຢູ່ docs/guide/
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  FaArrowRight,
  FaChartLine,
  FaCog,
  FaLine,
  FaMapMarkedAlt,
  FaQrcode,
  FaUserTie,
  FaWhatsapp,
} from "react-icons/fa";
import { StatusPageHeader } from "@/components/status-page-shell";
import { SETTING_TOPICS } from "./_settings";

const ICONS: Record<string, React.ReactNode> = {
  qr: <FaQrcode className="text-teal-600" />,
  cog: <FaCog className="text-sky-600" />,
  chart: <FaChartLine className="text-teal-600" />,
  user: <FaUserTie className="text-emerald-600" />,
  line: <FaLine className="text-emerald-500" />,
  whatsapp: <FaWhatsapp className="text-emerald-500" />,
  map: <FaMapMarkedAlt className="text-sky-600" />,
};

export default function SettingsMenuPage() {
  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຕັ້ງຄ່າ"
        subtitle="ເລືອກຫົວຂໍ້ທີ່ຕ້ອງການຕັ້ງຄ່າ"
        icon={<FaCog />}
        tone="slate"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SETTING_TOPICS.map((topic) => (
          <Link
            key={topic.key}
            href={`/manage/settings/${topic.key}`}
            className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/65"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-base">
              {ICONS[topic.icon] ?? <FaCog />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                {topic.title}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                {topic.subtitle}
              </p>
            </div>
            <FaArrowRight
              className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-teal-700 dark:group-hover:text-teal-300"
              size={11}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

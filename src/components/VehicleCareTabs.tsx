"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaClipboardCheck, FaTools } from "react-icons/fa";

const TABS = [
  { href: "/inspection", label: "ກວດເຊັກສະພາບລົດ", icon: <FaClipboardCheck size={13} /> },
  { href: "/maint-log", label: "ປະຫວັດການສ້ອມແປງ", icon: <FaTools size={13} /> },
];

export function VehicleCareTabs() {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
              active
                ? "bg-white text-teal-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-teal-300 dark:ring-slate-600"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className={active ? "text-teal-500" : "text-slate-400"}>{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

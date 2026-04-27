"use client";

import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="gradient-mesh-bg relative flex min-h-screen">
      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto p-4 md:p-5 lg:p-6">{children}</main>
        <footer className="border-t border-slate-200/70 py-3 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500 print:hidden">
          Copyright &copy; ODG {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

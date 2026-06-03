"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="gradient-mesh-bg relative flex min-h-screen print:block print:min-h-0">
      <Sidebar
        onCollapsedChange={setSidebarCollapsed}
      />
      <div
        className={`relative flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out print:block ${
          sidebarCollapsed ? "md:ml-[84px]" : "md:ml-[288px]"
        }`}
      >
        <Topbar />
        <main className="flex-1 overflow-auto p-4 md:p-5 lg:p-6 print:overflow-visible print:p-0">
          {children}
        </main>
        <footer className="border-t border-slate-200/70 py-3 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500 print:hidden">
          Copyright &copy; ODG {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import ChatWidget from "./ChatWidget";
import { useSession } from "@/providers/session-provider";
import { isSalesLogin } from "@/lib/sales-role";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { session } = useSession();
  const isSaleLogin = isSalesLogin(session);

  useEffect(() => {
    // Sales staff are confined to their own undelivered-bill tracking page,
    // plus the shared delivery calendar (everyone may view it).
    const allowed =
      pathname.startsWith("/tracking/sales") ||
      pathname.startsWith("/calendar");
    if (isSaleLogin && !allowed) {
      router.replace("/tracking/sales");
    }
  }, [isSaleLogin, pathname, router]);

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
      <ChatWidget />
    </div>
  );
}

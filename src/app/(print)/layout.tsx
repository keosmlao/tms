"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/providers/session-provider";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-white text-slate-900">{children}</div>
    </RequireAuth>
  );
}

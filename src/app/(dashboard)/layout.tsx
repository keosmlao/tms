"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/providers/session-provider";
import DashboardLayout from "@/components/DashboardLayout";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <DashboardLayout>{children}</DashboardLayout>
    </RequireAuth>
  );
}

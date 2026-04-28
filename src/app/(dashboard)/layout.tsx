"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/providers/session-provider";
import DashboardLayout from "@/components/DashboardLayout";
import { ConfirmProvider } from "@/components/confirm-dialog";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <ConfirmProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </ConfirmProvider>
    </RequireAuth>
  );
}

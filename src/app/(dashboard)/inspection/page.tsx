"use client";

import { FaClipboardCheck } from "react-icons/fa";
import { InspectionShell } from "@/components/InspectionShell";
import { StatusPageHeader } from "@/components/status-page-shell";
export default function InspectionPage() {
  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ກວດເຊັກສະພາບລົດ"
        subtitle="ບັນທຶກ Vehicle Pre-operation Checklist ກ່ອນອອກທຳງານ"
        icon={<FaClipboardCheck />}
        tone="teal"
      />

      <InspectionShell />
    </div>
  );
}

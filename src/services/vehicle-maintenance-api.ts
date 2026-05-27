import type {
  ApprovalStatus,
  DailyChecklist,
  DailyChecklistInput,
  EmployeeOption,
  Inspection,
  InspectionDetailItem,
  InspectionInput,
  InspectionOptionType,
  InspectionSummary,
  InspectItem,
  InspectStatus,
  VehicleOption,
} from "@/types";

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "Request failed";
    throw new Error(message);
  }
  return body as T;
}

export async function submitChecklist(
  payload: DailyChecklistInput
): Promise<DailyChecklist> {
  return requestJson<DailyChecklist>("/api/daily-checklists", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getChecklistHistory(params?: {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<DailyChecklist[]> {
  const qs = new URLSearchParams();
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();
  return requestJson<DailyChecklist[]>(
    `/api/daily-checklists${query ? `?${query}` : ""}`,
    { method: "GET" }
  );
}

export async function searchInspectionOptions(
  type: InspectionOptionType,
  query: string
): Promise<Array<VehicleOption | EmployeeOption>> {
  const params = new URLSearchParams({
    type,
    q: query,
    limit: "25",
  });
  return requestJson<Array<VehicleOption | EmployeeOption>>(
    `/api/inspection-options?${params.toString()}`,
    { method: "GET" }
  );
}

export async function getInspectMeta(): Promise<{
  items: InspectItem[];
  statuses: InspectStatus[];
}> {
  return requestJson("/api/inspect-meta", { method: "GET" });
}

export async function createInspection(payload: InspectionInput): Promise<Inspection> {
  return requestJson<Inspection>("/api/inspections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInspections(params?: {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<Inspection[]> {
  const qs = new URLSearchParams();
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  if (params?.search) qs.set("search", params.search);
  const q = qs.toString();
  return requestJson<Inspection[]>(`/api/inspections${q ? `?${q}` : ""}`, {
    method: "GET",
  });
}

export async function getInspectionDetails(code: string): Promise<InspectionDetailItem[]> {
  return requestJson<InspectionDetailItem[]>(
    `/api/inspections/${encodeURIComponent(code)}/details`,
    { method: "GET" }
  );
}

export async function getInspectionSummary(): Promise<InspectionSummary> {
  return requestJson<InspectionSummary>("/api/inspections/summary", { method: "GET" });
}

export async function approveInspection(
  code: string,
  action: ApprovalStatus & ("approved" | "rejected"),
  note?: string
): Promise<{ success: boolean; approval_status: string }> {
  return requestJson(`/api/inspections/${encodeURIComponent(code)}/approve`, {
    method: "PATCH",
    body: JSON.stringify({ action, note }),
  });
}


import { query } from "@/lib/db.js";
import type { EmployeeOption, InspectItem, InspectStatus, VehicleOption } from "@/types";

export async function getVehicleOptions(): Promise<VehicleOption[]> {
  const rows = await query(
    `SELECT
       code AS id,
       code,
       COALESCE(name_1, '') AS name
     FROM public.odg_tms_car
     ORDER BY name_1 ASC, code ASC`
  );

  return rows.map((row: { id: string; code: string; name: string }) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));
}

export async function searchVehicleOptions(
  search: string,
  limit = 25
): Promise<VehicleOption[]> {
  const term = search.trim();
  const pattern = `${term.toLowerCase()}%`;
  const rows = term
    ? await query(
        `SELECT
           code AS id,
           code,
           COALESCE(name_1, '') AS name
         FROM public.odg_tms_car
         WHERE LOWER(code) LIKE $1 OR LOWER(COALESCE(name_1, '')) LIKE $1
         ORDER BY code ASC
         LIMIT $2`,
        [pattern, limit]
      )
    : await query(
        `SELECT
           code AS id,
           code,
           COALESCE(name_1, '') AS name
         FROM public.odg_tms_car
         ORDER BY code ASC
         LIMIT $1`,
        [limit]
      );

  return rows.map((row: { id: string; code: string; name: string }) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));
}

export async function getEmployeeOptions(): Promise<EmployeeOption[]> {
  const rows = await query(
    `SELECT
       e.employee_code AS code,
       COALESCE(
         NULLIF(TRIM(e.fullname_lo), ''),
         NULLIF(TRIM(e.nickname), ''),
         e.employee_code
       ) AS name
     FROM public.odg_employee e
     WHERE e.employment_status = 'ACTIVE'
     ORDER BY name ASC, e.employee_code ASC`
  );

  return rows.map((row: { code: string; name: string }) => ({
    code: row.code,
    name: row.name,
  }));
}

export async function searchEmployeeOptions(
  search: string,
  limit = 25
): Promise<EmployeeOption[]> {
  const term = search.trim();
  const pattern = `${term.toLowerCase()}%`;
  const rows = term
    ? await query(
        `SELECT
           e.employee_code AS code,
           COALESCE(
             NULLIF(TRIM(e.fullname_lo), ''),
             NULLIF(TRIM(e.nickname), ''),
             e.employee_code
           ) AS name
         FROM public.odg_employee e
         WHERE e.employment_status = 'ACTIVE'
           AND (
             LOWER(e.employee_code) LIKE $1
             OR LOWER(COALESCE(e.fullname_lo, '')) LIKE $1
             OR LOWER(COALESCE(e.nickname, '')) LIKE $1
           )
         ORDER BY e.employee_code ASC
         LIMIT $2`,
        [pattern, limit]
      )
    : await query(
        `SELECT
           e.employee_code AS code,
           COALESCE(
             NULLIF(TRIM(e.fullname_lo), ''),
             NULLIF(TRIM(e.nickname), ''),
             e.employee_code
           ) AS name
         FROM public.odg_employee e
         WHERE e.employment_status = 'ACTIVE'
         ORDER BY e.employee_code ASC
         LIMIT $1`,
        [limit]
      );

  return rows.map((row: { code: string; name: string }) => ({
    code: row.code,
    name: row.name,
  }));
}

export async function searchDriverOptions(
  search: string,
  limit = 25
): Promise<EmployeeOption[]> {
  const term = search.trim();
  const pattern = `${term.toLowerCase()}%`;
  const rows = term
    ? await query(
        `SELECT
           code,
           COALESCE(name_1, '') AS name
         FROM public.odg_tms_driver
         WHERE LOWER(code) LIKE $1 OR LOWER(COALESCE(name_1, '')) LIKE $1
         ORDER BY code ASC
         LIMIT $2`,
        [pattern, limit]
      )
    : await query(
        `SELECT
           code,
           COALESCE(name_1, '') AS name
         FROM public.odg_tms_driver
         ORDER BY code ASC
         LIMIT $1`,
        [limit]
      );

  return rows.map((row: { code: string; name: string }) => ({
    code: row.code,
    name: row.name,
  }));
}

export async function getInspectItems(): Promise<InspectItem[]> {
  const rows = await query(
    `SELECT item_code, item_name, sort_order
     FROM public.odg_tms_inspect_item
     WHERE active = true
     ORDER BY sort_order ASC, item_code ASC`
  );
  return rows.map((row: { item_code: string; item_name: string; sort_order: number }) => ({
    item_code: row.item_code,
    item_name: row.item_name,
    sort_order: row.sort_order,
  }));
}

export async function getInspectStatuses(): Promise<InspectStatus[]> {
  const rows = await query(
    `SELECT status_code, status_name
     FROM public.odg_tms_inspect_status
     ORDER BY status_code ASC`
  );
  return rows.map((row: { status_code: number; status_name: string }) => ({
    status_code: row.status_code,
    status_name: row.status_name,
  }));
}

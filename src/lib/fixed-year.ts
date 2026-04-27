export const FIXED_YEAR = 2026;
export const FIXED_YEAR_START = `${FIXED_YEAR}-01-01`;
export const FIXED_YEAR_END = `${FIXED_YEAR}-12-31`;
export const FIXED_YEAR_NEXT_START = `${FIXED_YEAR + 1}-01-01`;
export const FIXED_MONTH_MIN = `${FIXED_YEAR}-01`;
export const FIXED_MONTH_MAX = `${FIXED_YEAR}-12`;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function getFixedTodayDate(now = new Date()) {
  const month = Math.min(Math.max(now.getMonth() + 1, 1), 12);
  const day = Math.min(
    Math.max(now.getDate(), 1),
    getDaysInMonth(FIXED_YEAR, month)
  );

  return `${FIXED_YEAR}-${pad(month)}-${pad(day)}`;
}

export function getFixedTodayMonth(now = new Date()) {
  return getFixedTodayDate(now).slice(0, 7);
}

export function coerceDateToFixedYear(
  value?: string | null,
  fallback = FIXED_YEAR_START
) {
  if (!value) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  const month = Math.min(Math.max(Number.parseInt(match[2], 10), 1), 12);
  const day = Math.min(
    Math.max(Number.parseInt(match[3], 10), 1),
    getDaysInMonth(FIXED_YEAR, month)
  );
  return `${FIXED_YEAR}-${pad(month)}-${pad(day)}`;
}

export function getFixedYearDateRange(from?: string | null, to?: string | null) {
  const fromDate = coerceDateToFixedYear(from, FIXED_YEAR_START);
  const toDate = coerceDateToFixedYear(to, FIXED_YEAR_END);
  if (fromDate <= toDate) return { fromDate, toDate };
  return { fromDate: toDate, toDate: fromDate };
}

export function coerceMonthToFixedYear(
  value?: string | null,
  fallback = getFixedTodayMonth()
) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return fallback;
  const month = Math.min(Math.max(Number.parseInt(match[2], 10), 1), 12);
  return `${FIXED_YEAR}-${pad(month)}`;
}

export function getFixedYearSqlFilter(column: string) {
  return `${column} >= DATE '${FIXED_YEAR_START}' AND ${column} < DATE '${FIXED_YEAR_NEXT_START}'`;
}

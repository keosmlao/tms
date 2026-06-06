// Pure, DB-free helpers for the chatter system — message-type normalization,
// @mention serialization/matching, the sales-vs-admin rule, and notification
// recipient/visibility logic. Shared by the query layer (chatter.js,
// notifications.js) and unit-tested in chatter-helpers.test.ts so the tricky
// rules have one canonical, verified source.

export type ChatterMsgType = "note" | "comment" | "system";

export function normalizeMsgType(type?: string | null): ChatterMsgType {
  if (type === "note") return "note";
  if (type === "system") return "system";
  return "comment";
}

/** Array or CSV of mention codes -> trimmed CSV string (or null when empty). */
export function serializeMentions(mentions?: string[] | string | null): string | null {
  const list = Array.isArray(mentions) ? mentions : String(mentions ?? "").split(",");
  const csv = list
    .map((m) => String(m).trim())
    .filter(Boolean)
    .join(",");
  return csv || null;
}

/** Mirrors the SQL `(',' || mentions || ',') LIKE '%,code,%'` membership test. */
export function mentionsInclude(csv: string | null | undefined, code: string): boolean {
  const c = String(code ?? "").trim();
  if (!c || !csv) return false;
  return `,${csv},`.includes(`,${c},`);
}

const ADMIN_EXEMPT_TITLES = ["top management", "superuser"];

/** A salesperson login: department 2xx and not a top-management/superuser title. */
export function isSalesUser(
  input?: { emp_department_code?: string | null; title?: string | null } | null,
): boolean {
  const dept = String(input?.emp_department_code ?? "").trim();
  const title = String(input?.title ?? "").trim().toLowerCase();
  return /^2\d{2}$/.test(dept) && !ADMIN_EXEMPT_TITLES.includes(title);
}

/** Everyone who is not a sales login (dispatch / management) is treated as admin. */
export function isChatterAdmin(
  input?: { emp_department_code?: string | null; title?: string | null } | null,
): boolean {
  return !isSalesUser(input);
}

/**
 * Whether `userCode` should see a chatter message on a bill in their bell.
 * Mirrors the notifications.js SQL UNION so the rule is unit-testable.
 */
export function shouldNotifyChatter(p: {
  userCode: string;
  isAdmin: boolean;
  authorCode?: string | null;
  mentionsCsv?: string | null;
  isFollower?: boolean;
  billSaleCode?: string | null;
}): boolean {
  const u = String(p.userCode ?? "").trim();
  if (!u) return false;
  if (String(p.authorCode ?? "").trim() === u) return false; // never notify yourself
  return (
    mentionsInclude(p.mentionsCsv, u) ||
    Boolean(p.isFollower) ||
    String(p.billSaleCode ?? "").trim() === u ||
    Boolean(p.isAdmin)
  );
}

/** Distinct push recipients for a posted message (author always excluded). */
/** Parse a base64 data URL into its mime type + base64 payload (null if invalid). */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(String(dataUrl ?? ""));
  if (!m || !m[2]) return null;
  return { mime: m[1], base64: m[2] };
}

export function collectChatterRecipients(p: {
  mentions?: string[] | string | null;
  followers?: string[];
  saleCode?: string | null;
  authorCode?: string | null;
}): string[] {
  const set = new Set<string>();
  const addAll = (arr: string[]) =>
    arr
      .map((c) => String(c).trim())
      .filter(Boolean)
      .forEach((c) => set.add(c));
  addAll(Array.isArray(p.mentions) ? p.mentions : String(p.mentions ?? "").split(","));
  addAll(p.followers ?? []);
  const sale = String(p.saleCode ?? "").trim();
  if (sale) set.add(sale);
  const author = String(p.authorCode ?? "").trim();
  if (author) set.delete(author);
  return [...set];
}

import { z, type ZodType } from "zod";

// Throwing this from a route hands the standard error shape — message + 400
// — back to mobileErrorResponse / login's catch block without each route
// reimplementing the validation translation.
export class ValidationError extends Error {
  status = 400;
  constructor(public issues: z.ZodIssue[]) {
    super(formatIssues(issues));
    this.name = "ValidationError";
  }
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => {
      const path = i.path.length ? i.path.join(".") + ": " : "";
      return path + i.message;
    })
    .join("; ");
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  const raw = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  return parsed.data;
}

export function parseSearchParams<T>(
  params: URLSearchParams,
  schema: ZodType<T>
): T {
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  return parsed.data;
}

// Common building blocks. Mobile callers send everything as strings; we coerce
// + trim + bound at the edge so query/action code can trust the shapes.
export const NonEmptyString = z.string().trim().min(1);
// Mobile clients (Dart/Swift) JSON-encode missing values as `null`, not by
// omitting the key. Use .nullish() everywhere a field is optional so the
// schema accepts both null and undefined uniformly.
export const OptionalString = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && v.length ? v : undefined));
export const DateLike = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .nullish()
  .transform((v) => (v ? v : undefined));
export const LatLng = z
  .string()
  .trim()
  .regex(/^(-?\d+(\.\d+)?)?$/, "must be a number")
  .nullish()
  .transform((v) => (v ? v : undefined));
// Data URI cap at 8MB base64 (~6MB binary) — anything larger is a misuse.
export const DataUri = z
  .string()
  .max(8 * 1024 * 1024, "image too large")
  .refine((s) => s.startsWith("data:image/"), "must be a data:image/* URI")
  .nullish()
  .transform((v) => (v ? v : undefined));

// Pure dotted-version helpers, kept free of any DB/runtime imports so they can
// be unit-tested in isolation. app-version.ts re-exports these.

export function parseVersion(value: string): number[] {
  return String(value ?? "")
    .trim()
    .split(/[.+-]/)
    .map((part) => parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Compare two dotted version strings (e.g. "1.2.3"). Build/pre-release suffixes
 * like "1.2.3+45" or "1.2.3-beta" are tolerated — only the numeric segments are
 * compared. Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

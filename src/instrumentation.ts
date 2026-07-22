/**
 * Next.js instrumentation hook.
 *
 * The project does not use a telemetry provider yet, but Next/Turbopack will
 * load this file when instrumentation is enabled or cached from a previous dev
 * run. Keeping a tiny valid hook prevents "file not found" startup errors.
 */
export function register() {
  // Intentionally empty.
}

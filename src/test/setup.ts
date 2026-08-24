/**
 * Vitest setup.
 *
 * Supplies the build-time globals that `vite.config.ts` injects via `define`.
 * Modules under `services/duckdb` and `services/engine` read them at import
 * time, so anything that pulls in a driver needs them present before the
 * module graph is evaluated. The declarations themselves live in
 * `src/vite-env.d.ts`.
 */

const globals = globalThis as Record<string, unknown>;

globals.__DUCK_UI_VERSION__ ??= "0.0.0-test";
globals.__DUCK_UI_RELEASE_DATE__ ??= "1970-01-01";
globals.__DUCK_UI_BUILD_DUCKDB_CDN_ONLY__ ??= false;

export {};

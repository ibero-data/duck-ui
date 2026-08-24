import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The engine drivers read Vite's build-time globals at import time, so
    // they must exist before any module in the graph is evaluated.
    setupFiles: ["./src/test/setup.ts"],
  },
  define: {
    __DUCK_UI_VERSION__: JSON.stringify("0.0.0-test"),
    __DUCK_UI_RELEASE_DATE__: JSON.stringify("1970-01-01"),
    __DUCK_UI_BUILD_DUCKDB_CDN_ONLY__: JSON.stringify(false),
  },
});

const fs = require("fs");
const path = require("path");

// Writes runtime environment variables into env.js (loaded by index.html as a
// classic script). Writing a separate file instead of injecting an inline
// <script> keeps the Content-Security-Policy free of 'unsafe-inline'.
const envVars = {
  DUCK_UI_EXTERNAL_CONNECTION_NAME: process.env.DUCK_UI_EXTERNAL_CONNECTION_NAME || "",
  DUCK_UI_EXTERNAL_HOST: process.env.DUCK_UI_EXTERNAL_HOST || "",
  DUCK_UI_EXTERNAL_PORT: process.env.DUCK_UI_EXTERNAL_PORT || null,
  DUCK_UI_EXTERNAL_USER: process.env.DUCK_UI_EXTERNAL_USER || "",
  DUCK_UI_EXTERNAL_PASS: process.env.DUCK_UI_EXTERNAL_PASS || "",
  DUCK_UI_EXTERNAL_API_KEY: process.env.DUCK_UI_EXTERNAL_API_KEY || "",
  DUCK_UI_EXTERNAL_DATABASE_NAME: process.env.DUCK_UI_EXTERNAL_DATABASE_NAME || "",
  DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: process.env.DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS === "true" || false,
  DUCK_UI_DUCKDB_WASM_USE_CDN: process.env.DUCK_UI_DUCKDB_WASM_USE_CDN === "true" || false,
  DUCK_UI_DUCKDB_WASM_BASE_URL: process.env.DUCK_UI_DUCKDB_WASM_BASE_URL || "",
};

const envJsPath = path.join(__dirname, "env.js");
fs.writeFileSync(envJsPath, `window.env = ${JSON.stringify(envVars)};\n`);

// A custom WASM CDN origin must be allowed by the CSP's script-src, or the
// blob worker's importScripts is blocked and DuckDB never initializes.
// jsDelivr (the default CDN) is already in the baked-in policy.
const wasmBaseUrl = envVars.DUCK_UI_DUCKDB_WASM_BASE_URL;
if (/^https?:\/\//i.test(wasmBaseUrl)) {
  try {
    const origin = new URL(wasmBaseUrl).origin;
    const servePath = path.join(__dirname, "serve.json");
    const serveConfig = JSON.parse(fs.readFileSync(servePath, "utf8"));
    for (const rule of serveConfig.headers ?? []) {
      for (const header of rule.headers ?? []) {
        if (header.key === "Content-Security-Policy" && !header.value.includes(origin)) {
          header.value = header.value.replace("script-src ", `script-src ${origin} `);
        }
      }
    }
    fs.writeFileSync(servePath, JSON.stringify(serveConfig, null, 2));
    console.log(`CSP widened for WASM CDN origin ${origin}`);
  } catch (error) {
    console.warn("Could not widen CSP for the WASM CDN origin:", error.message);
  }
}

console.log("Environment variables injected successfully");

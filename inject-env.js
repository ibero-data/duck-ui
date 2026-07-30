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

console.log("Environment variables injected successfully");

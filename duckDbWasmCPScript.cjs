const fs = require("fs");
const path = require("path");

// Source directory (node_modules)
const sourceDir = path.join(
  __dirname,
  "./node_modules/@duckdb/duckdb-wasm/dist"
);

// Destination directory (public)
const destDir = path.join(__dirname, "./public");

// Files to copy
const files = [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
];

// Create destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy files
files.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const destPath = path.join(destDir, file);

  fs.copyFile(sourcePath, destPath, (err) => {
    if (err) {
      console.error(`Error copying ${file}: ${err}`);
    } else {
      console.log(`Successfully copied ${file}`);
    }
  });
});

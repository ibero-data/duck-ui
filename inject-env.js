const fs = require("fs");
const path = require("path");

const indexHtmlPath = path.join(__dirname, "index.html");
let indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");

// Inject the environment variables
const envVars = {
  DUCK_UI_EXTERNAL_CONNECTION_NAME:
    process.env.DUCK_UI_EXTERNAL_CONNECTION_NAME || "",
  DUCK_UI_EXTERNAL_HOST: process.env.DUCK_UI_EXTERNAL_HOST || "",
  DUCK_UI_EXTERNAL_PORT: process.env.DUCK_UI_EXTERNAL_PORT || null,
  DUCK_UI_EXTERNAL_USER: process.env.DUCK_UI_EXTERNAL_USER || "",
  DUCK_UI_EXTERNAL_PASS: process.env.DUCK_UI_EXTERNAL_PASS || "",
  DUCK_UI_EXTERNAL_DATABASE_NAME:
    process.env.DUCK_UI_EXTERNAL_DATABASE_NAME || "",
  // Add new configuration for DuckDB settings
  DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS:
    process.env.DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS === "true" || false
};

const scriptContent = `
<script>
  window.env = ${JSON.stringify(envVars)};
</script>
`;

// Insert the script just before the closing </head> tag
indexHtmlContent = indexHtmlContent.replace(
  "</head>",
  `${scriptContent}</head>`
);

fs.writeFileSync(indexHtmlPath, indexHtmlContent);

console.log("Environment variables injected successfully");

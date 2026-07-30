# <img src="./public/logo.png" alt="Duck-UI Logo" title="Duck-UI Logo" width="50"> Duck-UI

Duck-UI is a web-based interface for interacting with DuckDB, a high-performance analytical database system. This project leverages DuckDB's WebAssembly (WASM) capabilities to provide a seamless and efficient user experience directly in the browser.

# [Official Docs](https://duckui.com?utm_source=github&utm_medium=readme) 🚀
#  [Demo](https://demo.duckui.com?utm_source=github&utm_medium=readme) 💻


## Features

- **SQL Editor**: Write and execute SQL queries with syntax highlighting and auto-completion.
- **Data Import**: Import data from CSV, JSON, Parquet, and Arrow files.
- **Data Explorer**: Browse and manage databases and tables.
- **Query History**: View and manage your recent SQL queries.

## Getting Started


### Docker (Recommended)

```bash
docker run -p 5522:5522 ghcr.io/caioricciuti/duck-ui:latest
```

Open your browser and navigate to `http://localhost:5522`.

### Environment Variables

You can customize Duck-UI behavior using environment variables:

```bash
# For external DuckDB connections (API key auth)
docker run -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="https://duckdb-server/duckdb" \
  -e DUCK_UI_EXTERNAL_PORT="443" \
  -e DUCK_UI_EXTERNAL_API_KEY="your-api-key" \
  ghcr.io/caioricciuti/duck-ui:latest

# For external DuckDB connections (username/password auth)
docker run -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="http://duckdb-server" \
  -e DUCK_UI_EXTERNAL_PORT="8000" \
  -e DUCK_UI_EXTERNAL_USER="username" \
  -e DUCK_UI_EXTERNAL_PASS="password" \
  -e DUCK_UI_EXTERNAL_DATABASE_NAME="my_database" \
  -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true" \
  ghcr.io/caioricciuti/duck-ui:latest
```

| Runtime Variable | Description | Default |
|----------|-------------|---------|
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Name for the external connection | "" |
| `DUCK_UI_EXTERNAL_HOST` | Host URL for external DuckDB (may include path, e.g. `https://host/duckdb`) | "" |
| `DUCK_UI_EXTERNAL_PORT` | Port for external DuckDB | null |
| `DUCK_UI_EXTERNAL_API_KEY` | API key sent as `X-API-Key` header (takes priority over user/password) | "" |
| `DUCK_UI_EXTERNAL_USER` | Username for Basic auth (used when no API key is set) | "" |
| `DUCK_UI_EXTERNAL_PASS` | Password for Basic auth | "" |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name for external connection | "" |
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow unsigned extensions in DuckDB | false |
| `DUCK_UI_DUCKDB_WASM_USE_CDN` | Load DuckDB WASM from CDN (ignored when build-time `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true`) | false |
| `DUCK_UI_DUCKDB_WASM_BASE_URL` | Custom CDN base URL (used when `DUCK_UI_DUCKDB_WASM_USE_CDN=true`) | auto jsDelivr |

| Build-time Variable | Description | Default |
|----------|-------------|---------|
| `DUCK_UI_DUCKDB_WASM_CDN_ONLY` | Build a CDN-only artifact (local DuckDB WASM assets are not bundled). | false |

When `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true`, runtime `DUCK_UI_DUCKDB_WASM_USE_CDN=false` cannot switch back to local WASM.



### Prerequisites

- Node.js >= 20.x
- npm >= 10.x

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/caioricciuti/duck-ui.git
   cd duck-ui
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

### Running the Application

1. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

2. Open your browser and navigate to `http://localhost:5173`.

### Building for Production

To create a production build, run:

```bash
npm run build
# or
yarn build
```

The output will be in the `dist` directory.

### Running with Docker

1. Build the Docker image:

   ```bash
   docker build -t duck-ui .
   ```

2. Run the Docker container:

   ```bash
   docker run -p 5522:5522 duck-ui
   ```

3. Open your browser and navigate to `http://localhost:5522`.

### Embedding databases at build time

Duck-UI can ship with pre-loaded DuckDB databases. List them in
`public/databases/manifest.json` and they are attached automatically on startup
— great for demo data, self-contained dashboards, and publishing a public
dataset. Two kinds of source are supported:

- **Bundled files** — drop a `.db` file into `public/databases/` and reference it
  by filename. It's fetched and loaded into the WASM engine.
- **Remote sources** — point at a connection string and DuckDB attaches it in
  place (nothing is downloaded into the engine). This includes **DuckLake**
  catalogs, `.db` files over HTTP, S3, and MotherDuck.

```json
{
  "databases": [
    { "name": "My Database", "file": "my-database.db", "autoLoad": true },
    { "name": "Anchorage Property", "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake" }
  ]
}
```

### Kiosk mode — publish a locked-down, read-only explorer

Add a `ui` block to the same manifest to hide the panels that let visitors add
connections, import data, or change settings. This turns Duck-UI into a fixed
data explorer you can host on GitHub Pages, where people only browse and query
your embedded databases.

```json
{
  "ui": { "kiosk": true },
  "databases": [
    { "name": "Anchorage Property", "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake" }
  ]
}
```

`kiosk: true` enables `hideConnections`, `hideSettings`, `hideImport`,
`hideBrain`, and `readOnly` — each overridable individually (e.g. keep the AI
assistant with `"hideBrain": false`). Kiosk mode locks down the UI, not the SQL
engine: the editor stays fully usable for querying, and attaching your catalog
read-only keeps your source data safe.

Rebuild (or rebuild the Docker image) and the databases appear in the Data
Explorer on boot. See `public/databases/README.md` for the full manifest format,
every field, and GitHub Pages deploy steps.

## Usage

### SQL Editor

- Write your SQL queries in the editor.
- Use `Cmd/Ctrl + Enter` to execute the query.
- View the results in the results pane.

### Data Import

- Click on the "Import Files" button to upload CSV, JSON, Parquet, or Arrow files.
- Configure the table name and import settings.
- For CSV files, you can customize import options:
  - Header row detection
  - Auto-detection of column types
  - Delimiter specification
  - Error handling (ignore errors, null padding for missing columns)
- View the imported data in the Data Explorer.

### Data Explorer

- Browse through the databases and tables.
- Preview table data and view table schemas.
- Delete tables if needed.

### Query History

- Access your recent queries from the Query History section.
- Copy queries to the clipboard or re-execute them.

### Theme Toggle

- Switch between light and dark themes using the theme toggle button.

### Keyboard Shortcuts

- `Cmd/Ctrl + B`: Expand/Shrink Sidebar
- `Cmd/Ctrl + K`: Open Search Bar
- `Cmd/Ctrl + Enter`: Run Query
- `Cmd/Ctrl + Shift + Enter`: Run highlighted query

## Deploying behind a reverse proxy

When serving Duck-UI behind a two-layer nginx proxy (inner proxy + outer TLS/HTTP2 terminator such as [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy)), you **must** suppress `Accept-Encoding` on the upstream connection to the Duck-UI container.

`bun serve` natively compresses responses when it sees `Accept-Encoding: gzip`. That chunked-gzip stream causes `ERR_HTTP2_PROTOCOL_ERROR` when the outer proxy converts it to HTTP/2 DATA frames, making the page appear to hang after loading the first few assets.

**Required inner-nginx config:**

```nginx
# Assets: no auth, raw bytes — outer proxy handles compression over HTTP/2
location /ui/assets/ {
    proxy_set_header Accept-Encoding "";
    proxy_pass http://duck-ui:5522/assets/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Main app: basic auth gates index.html (which carries the pre-configured API key)
location /ui/ {
    auth_basic "Duck UI";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_set_header Accept-Encoding "";
    proxy_redirect http://duck-ui:5522 /ui/;
    proxy_pass http://duck-ui:5522/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Key points:
- Do **not** add `gzip on` or `proxy_buffering on` to the Duck-UI locations in the inner proxy — the outer TLS terminator handles that
- Split `/ui/assets/` (no auth) from `/ui/` (auth) so Web Workers can load WASM and JS without hitting an auth challenge
- When building the image for a sub-path, pass `DUCK_UI_BASEPATH=/ui/` as a Docker build argument

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.md) file for details.

## Acknowledgements

- [DuckDB](https://duckdb.org/)
- [React](https://reactjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Lucide Icons](https://lucide.dev/)

## Contact

For any inquiries or support, please contact [Caio Ricciuti](https://github.com/caioricciuti).

## Sponsors

This project is sponsored by:

### [qxip](https://qxip.net/?utm_source=duck-ui&utm_medium=sponsorship) 

<img src="https://qxip.net/images/qxip.png" alt="qxip" title="qxip Logo" width="150">



<br/>

Want to be a sponsor? [Contact us](mailto:caio.ricciuti+sponsorship@outlook.com).

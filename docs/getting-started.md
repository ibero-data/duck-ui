# Getting Started

Welcome to Duck-UI! This guide will help you get up and running quickly with our modern web interface for DuckDB.

## Quick Start ⚡

Choose your preferred installation method:

## Docker (Recommended)

### Simple Docker Setup

```bash
docker run --name duck-ui -p 5522:5522 ghcr.io/ibero-data/duck-ui:latest
```

Access at: `http://localhost:5522`

### Docker with Environment Variables

Connect to an external DuckDB server:

```bash
docker run --name duck-ui -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="http://duckdb-server:8000" \
  -e DUCK_UI_EXTERNAL_USER="username" \
  -e DUCK_UI_EXTERNAL_PASS="password" \
  ghcr.io/ibero-data/duck-ui:latest
```

## Docker Compose

### Basic Docker Compose

For a simple setup:

```yaml
services:
  duck-ui:
    image: ghcr.io/ibero-data/duck-ui:latest
    restart: unless-stopped
    ports:
      - "5522:5522"
    environment:
      # External Connection (optional)
      DUCK_UI_EXTERNAL_CONNECTION_NAME: "${DUCK_UI_EXTERNAL_CONNECTION_NAME}"
      DUCK_UI_EXTERNAL_HOST: "${DUCK_UI_EXTERNAL_HOST}"
      DUCK_UI_EXTERNAL_PORT: "${DUCK_UI_EXTERNAL_PORT}"
      DUCK_UI_EXTERNAL_USER: "${DUCK_UI_EXTERNAL_USER}"
      DUCK_UI_EXTERNAL_PASS: "${DUCK_UI_EXTERNAL_PASS}"
      DUCK_UI_EXTERNAL_DATABASE_NAME: "${DUCK_UI_EXTERNAL_DATABASE_NAME}"

      # Extensions (optional)
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: "${DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS:-false}"
```

Start the service:

```bash
docker-compose up -d
```

## Build from Source

### Clone Repository

```bash
git clone https://github.com/ibero-data/duck-ui.git
cd duck-ui
```

### Install Dependencies

```bash
bun install
```

### Build Project

```bash
bun run build
```

### Start Server

For production:

```bash
bun run preview
```

For development:

```bash
bun run dev
```

## System Requirements 🖥️

### Prerequisites

- **For Docker**: Docker Engine 20.10.0 or newer
- **For building from source**:
  - Node.js >= 20.x or Bun >= 1.0
  - Modern web browser (Chrome 88+, Firefox 79+, Safari 14+)

::: info No Database Server Required!
Duck-UI runs DuckDB entirely in your browser using WebAssembly (WASM). You don't need to install or run a separate database server for local analysis.
:::

## Configuration Options ⚙️

### Environment Variables

Duck-UI supports various environment variables for customization:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| **External Connection** |
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Display name for external connection | No | `""` |
| `DUCK_UI_EXTERNAL_HOST` | External DuckDB HTTP server URL | No | `""` |
| `DUCK_UI_EXTERNAL_PORT` | External DuckDB server port | No | `null` |
| `DUCK_UI_EXTERNAL_USER` | Username for external connection | No | `""` |
| `DUCK_UI_EXTERNAL_PASS` | Password for external connection | No | `""` |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name | No | `""` |
| **Extensions** |
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow unsigned DuckDB extensions | No | `false` |

For detailed environment variable documentation, see our [Environment Variables Reference](/environment-variables).

## Features Overview 🚀

### WASM Mode (Default)
- **Browser-based**: DuckDB runs entirely in your browser
- **No server required**: All processing happens client-side
- **Privacy**: Your data never leaves your machine
- **Fast**: Leverages WebAssembly for near-native performance

### OPFS Storage
- **Persistent databases**: Store databases in Origin Private File System
- **Cross-session**: Data persists across browser sessions
- **Automatic**: No configuration needed for supported browsers

### External Connections
- **Remote DuckDB**: Connect to DuckDB servers via HTTP API
- **Shared access**: Multiple users can access the same database
- **Configuration**: Use environment variables to set up connections

### Data Import
- **Multiple formats**: Import CSV, JSON, Parquet, and Arrow files
- **URL support**: Import directly from HTTP/HTTPS URLs
- **Query import**: Create tables from SQL query results
- **Preview mode**: Preview data before importing

### Persistent Folder Access
- **Mount folders**: Add folders from your computer directly in Duck-UI
- **Persists across sessions**: Folder selections are remembered via IndexedDB
- **Tree view browser**: Navigate your files with an intuitive interface
- **One-click import**: Right-click any file to import as a DuckDB table
- **Chrome/Edge only**: Requires File System Access API (Chrome/Edge 86+)

::: tip Browser Support for Folder Access
Folder access requires Chrome or Edge 86+. Firefox and Safari users can still use the standard file import feature.
:::

See [Folder Access Documentation](/folder-access) for complete details.

### Duck Brain AI
- **Natural language to SQL**: Ask questions in plain English
- **Local AI**: Runs in your browser via WebGPU (Chrome/Edge 113+)
- **Cloud AI**: Connect to OpenAI, Anthropic, or Gemini
- **Schema-aware**: Understands your tables and columns
- **Privacy-first**: Local AI keeps all data in your browser

::: tip WebGPU for Local AI
Local AI requires WebGPU, available in Chrome/Edge 113+. Cloud AI works in any browser.
:::

See [Duck Brain Documentation](/duck-brain) for complete details.

## Development Environment 🛠️

### Running Locally

Clone and run Duck-UI in development mode:

```bash
# Clone repository
git clone https://github.com/ibero-data/duck-ui.git
cd duck-ui

# Install dependencies
bun install

# Start development server
bun run dev
```

Access at: `http://localhost:5173`

::: tip Hot Module Replacement
Development mode includes HMR for instant updates as you make changes.
:::

## Browser Compatibility 📱

Duck-UI requires a modern browser with WebAssembly support:

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 88+ | ✅ Full support including OPFS |
| Edge | 88+ | ✅ Full support including OPFS |
| Firefox | 79+ | ✅ WASM support, OPFS in progress |
| Safari | 14+ | ✅ WASM support, limited OPFS |

## Usage Examples 💡

### Import CSV from URL

```sql
CREATE TABLE my_data AS
SELECT * FROM read_csv('https://example.com/data.csv');
```

### Query Parquet Files

```sql
SELECT * FROM read_parquet('https://example.com/data.parquet')
WHERE date > '2024-01-01'
LIMIT 100;
```

### Use OPFS Database

```sql
-- Create persistent database
ATTACH 'my_database.db' AS mydb;

-- Use it
CREATE TABLE mydb.users (id INT, name VARCHAR);
INSERT INTO mydb.users VALUES (1, 'Alice'), (2, 'Bob');
```

## Next Steps

- [Environment Variables](/environment-variables) - Configure Duck-UI
- [Troubleshooting](/troubleshooting) - Common issues and solutions
- [GitHub Discussions](https://github.com/ibero-data/duck-ui/discussions) - Ask questions
- [Changelog](https://github.com/ibero-data/duck-ui/releases) - Latest updates

---

### Support the Project ❤️

If you find Duck-UI helpful, consider:

<div style="text-align: center; margin: 2rem 0;">
  <a href="https://buymeacoffee.com/caioricciuti" target="_blank">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=caioricciuti&button_colour=D99B43&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00" alt="Buy Me A Coffee" />
  </a>
</div>

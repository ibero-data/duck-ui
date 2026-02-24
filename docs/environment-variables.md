# Environment Variables

Duck-UI can be configured using environment variables to customize its behavior, especially for connecting to external DuckDB instances and managing extensions.

## Core Configuration Variables

### External Connection Settings

These variables allow you to configure Duck-UI to connect to an external DuckDB server (via HTTP API) instead of using the local WASM instance.

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Display name for the external connection in the UI | No | `""` | `"Production DuckDB"` |
| `DUCK_UI_EXTERNAL_HOST` | Base URL of the external DuckDB HTTP server | No | `""` | `"http://duckdb-server"` |
| `DUCK_UI_EXTERNAL_PORT` | Port number for the external DuckDB server | No | `null` | `8000` |
| `DUCK_UI_EXTERNAL_USER` | Username for authentication | No | `""` | `"admin"` |
| `DUCK_UI_EXTERNAL_PASS` | Password for authentication | No | `""` | `"your-password"` |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name to connect to | No | `""` | `"analytics"` |

### Runtime Settings

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow loading unsigned DuckDB extensions | No | `false` | `"true"` |
| `DUCK_UI_DUCKDB_WASM_USE_CDN` | Enable loading DuckDB WASM and worker files from CDN (ignored when `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true` at build time) | No | `false` | `"true"` |
| `DUCK_UI_DUCKDB_WASM_BASE_URL` | Custom CDN base URL (when `DUCK_UI_DUCKDB_WASM_USE_CDN=true`) | No | Auto (`duckdb.getJsDelivrBundles()`) | `"https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev19.0/dist"` |

### Build-time Settings

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `DUCK_UI_DUCKDB_WASM_CDN_ONLY` | Build a CDN-only artifact (local DuckDB WASM files are not bundled). Suitable for edge platforms with strict asset size limits. | No | `false` | `"true"` |

When `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true`, runtime `DUCK_UI_DUCKDB_WASM_USE_CDN=false` cannot switch back to local WASM because local assets are not included in the build.

::: warning Security Note
Enabling unsigned extensions may pose security risks. Only enable this in trusted environments.
:::

## Usage Examples

### Docker - Basic Setup

Run Duck-UI without any external connections (uses local WASM DuckDB):

```bash
docker run -p 5522:5522 ghcr.io/ibero-data/duck-ui:latest
```

Access at: `http://localhost:5522`

### Docker - External DuckDB Connection

Connect Duck-UI to an external DuckDB server:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="http://duckdb-server" \
  -e DUCK_UI_EXTERNAL_PORT="8000" \
  -e DUCK_UI_EXTERNAL_USER="username" \
  -e DUCK_UI_EXTERNAL_PASS="password" \
  -e DUCK_UI_EXTERNAL_DATABASE_NAME="my_database" \
  ghcr.io/ibero-data/duck-ui:latest
```

### Docker - With Unsigned Extensions

Enable unsigned extensions for development/testing:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true" \
  ghcr.io/ibero-data/duck-ui:latest
```

### Docker - CDN Loading

Load DuckDB WASM assets from CDN instead of the bundled files:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_DUCKDB_WASM_USE_CDN="true" \
  ghcr.io/ibero-data/duck-ui:latest
```

Optionally specify a custom CDN base URL:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_DUCKDB_WASM_USE_CDN="true" \
  -e DUCK_UI_DUCKDB_WASM_BASE_URL="https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev19.0/dist" \
  ghcr.io/ibero-data/duck-ui:latest
```

### Docker Compose Example

Create a `docker-compose.yml` file:

```yaml
services:
  duck-ui:
    image: ghcr.io/ibero-data/duck-ui:latest
    restart: unless-stopped
    ports:
      - "5522:5522"
    environment:
      # External Connection (optional)
      DUCK_UI_EXTERNAL_CONNECTION_NAME: "Production DB"
      DUCK_UI_EXTERNAL_HOST: "http://duckdb-server"
      DUCK_UI_EXTERNAL_PORT: "8000"
      DUCK_UI_EXTERNAL_USER: "viewer"
      DUCK_UI_EXTERNAL_PASS: "secure-password"
      DUCK_UI_EXTERNAL_DATABASE_NAME: "analytics"

      # Extensions (optional)
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: "false"

      # CDN Loading (optional)
      # DUCK_UI_DUCKDB_WASM_USE_CDN: "true"
      # DUCK_UI_DUCKDB_WASM_BASE_URL: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev19.0/dist"
```

Start the service:

```bash
docker-compose up -d
```

## Connection Types

Duck-UI supports three connection types:

### 1. **WASM (Local)**
- **Default mode** - DuckDB runs entirely in your browser
- **No server required** - All data processing happens client-side
- **Use case**: Local data analysis, CSV/Parquet file exploration
- **Storage**: Origin Private File System (OPFS) for persisted databases

### 2. **OPFS (Persistent)**
- Store databases in the browser's Origin Private File System
- Data persists across browser sessions
- **Use case**: Frequently accessed local databases
- **No configuration needed** - Available by default in supported browsers

### 3. **External (HTTP)**
- Connect to a remote DuckDB server via HTTP API
- Requires DuckDB server with HTTP endpoint
- **Use case**: Shared databases, production workloads
- **Configuration**: Use `DUCK_UI_EXTERNAL_*` environment variables

## How Environment Variables Work

### Docker Runtime

Environment variables are processed when the Docker container starts:

1. Variables are read from the Docker environment
2. A configuration file is generated at `/app/dist/env-config.js`
3. The web application loads this configuration on startup
4. External connections appear in the Connections page if configured

### Build from Source

For local development or custom builds:

1. Create a `.env` file in the project root
2. Add your environment variables:
   ```bash
   DUCK_UI_EXTERNAL_HOST=http://localhost:8000
   DUCK_UI_EXTERNAL_CONNECTION_NAME=Local Dev
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Troubleshooting

### External Connection Not Appearing

**Problem**: External connection doesn't show up in Connections page

**Solutions**:
- Verify all `DUCK_UI_EXTERNAL_*` variables are set correctly
- Check Docker logs: `docker logs <container-name>`
- Ensure `DUCK_UI_EXTERNAL_HOST` includes the protocol (`http://` or `https://`)
- Confirm the external DuckDB server is accessible from the container

### Extension Loading Fails

**Problem**: Extensions fail to load

**Solutions**:
- Set `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS=true` for unsigned extensions
- Check browser console for error messages
- Verify the extension is compatible with DuckDB WASM
- Ensure sufficient browser storage/memory

### Connection Timeout

**Problem**: External connection times out

**Solutions**:
- Check network connectivity between container and DuckDB server
- Verify `DUCK_UI_EXTERNAL_HOST` and `DUCK_UI_EXTERNAL_PORT` are correct
- Ensure firewall rules allow the connection
- Check DuckDB server logs for authentication failures

## Next Steps

- [Getting Started](/getting-started) - Complete installation guide
- [Troubleshooting](/troubleshooting) - Common issues and solutions
- [GitHub Issues](https://github.com/ibero-data/duck-ui/issues) - Report bugs or request features

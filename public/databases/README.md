# Embedded Databases & Kiosk Mode

This directory is Duck-UI's build-time config surface. A single file,
`manifest.json`, controls two things:

1. **Which databases are attached automatically on startup** — local `.db`
   files you bundle here, or remote sources (DuckLake catalogs, `.db` over
   HTTP, S3, …) that DuckDB attaches directly.
2. **An optional `ui` block ("kiosk mode")** that hides the panels for adding
   connections, importing data, and changing settings — so you can publish a
   fixed dataset (e.g. on GitHub Pages) where visitors only browse and query.

Nothing here needs a server. `bun run build` produces a static `dist/` you can
push straight to GitHub Pages, Netlify, S3, or any static host.

## Manifest shape

```jsonc
{
  "ui": {
    "kiosk": true
  },
  "databases": [
    {
      "name": "Anchorage Property",
      "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake",
      "readOnly": true,
      "autoLoad": true
    }
  ]
}
```

## `databases` entries

| Field         | Required | Default                        | Description                                                                 |
| ------------- | -------- | ------------------------------ | --------------------------------------------------------------------------- |
| `name`        | yes      | —                              | Display name; also used to derive the attach alias when `alias` is absent.  |
| `file`        | yes      | —                              | A bundled file (`sales.db`) **or** a connection string (see below).         |
| `alias`       | no       | derived from `name`            | Explicit SQL alias the database is attached as.                             |
| `description` | no       | —                              | Free text.                                                                  |
| `autoLoad`    | no       | `true`                         | Attach on startup. Set `false` to leave it out.                             |
| `readOnly`    | no       | `true` remote / `false` local  | Attach read-only.                                                           |
| `dataPath`    | no       | —                              | DuckLake data path, emitted as `DATA_PATH '<value>'` in the ATTACH options. |

### Bundled local file

Drop a `.db` file next to this README and reference it by filename. Duck-UI
fetches it, loads it into the WASM engine, and attaches it.

```json
{ "name": "Sales Demo", "file": "sales-demo.db", "autoLoad": true }
```

### Remote / connection-string source

If `file` is a connection string, Duck-UI attaches it directly — nothing is
downloaded into the engine, DuckDB reads the source in place. A `file` is
treated as a connection string when it contains `://` or starts with one of:
`ducklake:`, `s3:`, `gcs:`, `azure:`, `az:`, `r2:`, `md:`, `motherduck:`,
`http:`, `https:`.

```jsonc
// DuckLake catalog (read-only by default)
{ "name": "Anchorage Property", "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake" }

// DuckLake with an explicit data path
{ "name": "Trips", "file": "ducklake:https://host/catalog.ducklake", "dataPath": "https://host/data/" }

// A .db file served over HTTP
{ "name": "Reference", "file": "https://example.com/reference.db" }
```

The DuckLake extension is installed and loaded on startup, so DuckLake catalogs
work out of the box.

## `ui` block (kiosk mode)

`kiosk: true` is a master switch — it turns on every flag below. Set any flag
explicitly to override.

| Field             | Default (when `kiosk` on) | Hides                                                          |
| ----------------- | ------------------------- | ------------------------------------------------------------- |
| `kiosk`           | `false`                   | Master switch for all of the below.                           |
| `hideConnections` | `true`                    | Connections tab and the add/manage-connection affordances.    |
| `hideSettings`    | `true`                    | Settings tab and its entry points.                            |
| `hideImport`      | `true`                    | Data import: import menu, drag-and-drop, folder/cloud sources. |
| `hideBrain`       | `true`                    | Duck Brain (AI) tab, panel, and its command-palette entries.  |
| `readOnly`        | `true`                    | Destructive affordances such as "Delete Table".               |

Example — a locked-down deploy that still lets people use the AI assistant:

```json
{
  "ui": { "kiosk": true, "hideBrain": false },
  "databases": [
    { "name": "Anchorage Property", "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake" }
  ]
}
```

### What kiosk mode does and does not do

Kiosk mode locks down the **UI**. It hides the panels that let a visitor add
sources, import files, or change settings, and (with `readOnly`) the destructive
menu items. Restored or deep-linked tabs of a hidden type won't render either.

It does **not** sandbox the SQL engine. The SQL editor stays fully functional on
purpose — that's how people explore your data. A visitor can still type `ATTACH`,
`COPY`, or DDL by hand, but that only affects their own in-browser DuckDB
session; it can't touch your source data (attach your catalog read-only) or
anyone else's. If you need to forbid schema changes via SQL as well, that's a
separate concern beyond UI gating.

## Deploy to GitHub Pages

```bash
echo '{
  "ui": { "kiosk": true },
  "databases": [
    { "name": "Anchorage Property", "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake" }
  ]
}' > public/databases/manifest.json

bun run build          # → dist/, ready to publish
```

For a subpath deploy (e.g. `https://user.github.io/repo/`), set the base path so
asset and manifest URLs resolve correctly:

```bash
DUCK_UI_BASEPATH=/repo/ bun run build
```

## Notes

- Bundled `.db` files are loaded into memory; keep an eye on file size and
  initial load time. Remote sources stream on demand and don't inflate the boot.
- Remote sources require the host to send permissive CORS headers so the browser
  can fetch them.

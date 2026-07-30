# Hosting data for Duck-UI (CORS setup)

Duck-UI runs DuckDB inside the browser, so when a query reads a remote file — `read_parquet('https://...')`, an attached `.duckdb`, a DuckLake catalog, or an [Open in Duck-UI link](../README.md#open-in-duck-ui-links) — the *browser* fetches it. Browsers only allow that when the host sends CORS headers. No CORS, no data: the query fails with a network error even though the same URL works in `curl`.

This guide sets up free hosting that works, end to end.

## The requirement

The data host must respond with:

```
Access-Control-Allow-Origin: *
```

(or your Duck-UI origin instead of `*`). For range reads on Parquet files, `GET` and `HEAD` must both be allowed.

## Option 1: Cloudflare R2 (recommended)

Free tier: 10 GB storage and **no egress fees**, which matters when a popular link means thousands of browsers reading your Parquet file.

1. Create an R2 bucket (Cloudflare dashboard → R2 → Create bucket).
2. Upload your files (`wrangler r2 object put` or the dashboard).
3. Enable public access: bucket → Settings → Public access → Allow. You get a `https://pub-xxxx.r2.dev` URL.
4. Add a CORS policy: bucket → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

That's it. Test with:

```sql
SELECT * FROM read_parquet('https://pub-xxxx.r2.dev/yourfile.parquet') LIMIT 10;
```

## Option 2: GitHub Pages

GitHub Pages sends `Access-Control-Allow-Origin: *` on everything by default — zero configuration. Good for files up to ~100 MB (the repo file limit). Commit the file, enable Pages, use the `https://user.github.io/repo/file.parquet` URL.

GitHub **raw** URLs (`raw.githubusercontent.com`) also send CORS headers and work for quick tests, but are rate-limited and not meant for traffic.

## Option 3: Hugging Face datasets

Dataset files under `https://huggingface.co/datasets/.../resolve/main/...` are served with CORS enabled and handle large files well. Good when your dataset already lives there.

## What doesn't work

- **S3 buckets without a CORS policy** (the default). Add one — same JSON shape as R2's, in the bucket's Permissions → CORS section.
- **Google Drive / Dropbox share links.** They redirect to HTML pages and send no CORS headers.
- **Presigned URLs with short expiry.** The link dies when the signature does.

## Publishing a whole database

For more than one table, publish a `.duckdb` file or a DuckLake catalog instead of loose files:

```sql
-- Link format for a read-only database:
https://your-app/?load=https://pub-xxxx.r2.dev/analytics.duckdb

-- Or a DuckLake catalog (Parquet data + catalog file, still no server):
https://your-app/?load=ducklake:https://pub-xxxx.r2.dev/catalog.ducklake
```

Both attach read-only in the visitor's browser. For a permanent, branded setup, deploy Duck-UI itself to GitHub Pages with your data pinned in kiosk mode — see [`public/databases/README.md`](../public/databases/README.md).

## Generating the link and badge

Open your query in Duck-UI → Share → Badge tab. It builds the `?load=` link and a Markdown badge you can paste into a README:

```markdown
[![Open in Duck-UI](https://demo.duckui.com/badge.svg)](https://demo.duckui.com/?load=https://pub-xxxx.r2.dev/yourfile.parquet)
```

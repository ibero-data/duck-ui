# Deploying Duck-UI behind a reverse proxy

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
- Duck-UI requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` response headers (the bundled server sets them; make sure your proxy does not strip them). DuckDB WASM needs SharedArrayBuffer, which browsers only enable on cross-origin-isolated pages.
- Serve over HTTPS (or localhost). Web Crypto and other secure-context APIs that Duck-UI relies on are unavailable on plain HTTP hosts.

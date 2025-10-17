# Troubleshooting

This guide helps you resolve common issues when using Duck-UI. If you encounter problems not covered here, please check our [GitHub Issues](https://github.com/ibero-data/duck-ui/issues).

## Common Issues

### WASM Loading

#### Problem: "Failed to load DuckDB WASM module"

**Symptoms**:
- Application loads but database doesn't initialize
- Console shows WASM loading errors
- Blank screen or infinite loading

**Solutions**:

1. **Check browser compatibility**:
   ```
   Chrome/Edge: Version 88+
   Firefox: Version 79+
   Safari: Version 14+
   ```

2. **Clear browser cache**:
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
   - Select "Cached images and files"
   - Clear cache and reload

3. **Disable browser extensions**:
   - Ad blockers or security extensions may block WASM
   - Try in incognito/private mode
   - Disable extensions temporarily

4. **Check network/CORS**:
   - Ensure WASM files can be downloaded
   - Check browser console for network errors
   - If self-hosting, verify MIME types are configured

#### Problem: "WebAssembly compilation failed"

**Solutions**:
- Update your browser to the latest version
- Check if your browser has WebAssembly disabled
- Try a different browser

### OPFS Storage

#### Problem: "OPFS not available in this browser"

**Symptoms**:
- Can't create persistent databases
- OPFS option missing in connection dialog
- Error when trying to attach databases

**Solutions**:

1. **Browser support**:
   - Chrome/Edge 86+: Full support
   - Firefox: Experimental support (enable via flags)
   - Safari 15.2+: Limited support

2. **Enable Firefox OPFS** (if needed):
   ```
   1. Open about:config
   2. Search for: dom.fs.enabled
   3. Set to: true
   4. Restart browser
   ```

3. **Check storage quota**:
   - OPFS requires available storage
   - Check browser storage settings
   - Clear old data if needed

4. **Use WASM mode instead**:
   - WASM mode works without OPFS
   - Data doesn't persist across sessions
   - Good for temporary analysis

#### Problem: "Quota exceeded" when saving to OPFS

**Solutions**:
- Clear browser storage: Settings → Privacy → Clear browsing data
- Delete unused databases from OPFS
- Use external connection for large databases
- Export data before clearing

### File Import

#### Problem: "Failed to import CSV file"

**Symptoms**:
- Import button doesn't work
- Error message after selecting file
- Preview doesn't load

**Solutions**:

1. **Check file format**:
   ```sql
   -- Test with simple query first
   SELECT * FROM read_csv('your_file.csv')
   LIMIT 10;
   ```

2. **Adjust CSV options**:
   - Enable "Ignore errors" for malformed data
   - Check delimiter (comma, semicolon, tab)
   - Verify "Has header row" setting
   - Try auto-detect types

3. **File size limits**:
   - Browser memory limits apply
   - Try sampling large files first
   - Use external DuckDB for huge datasets

4. **Encoding issues**:
   - Ensure file is UTF-8 encoded
   - Check for special characters
   - Try re-saving file with UTF-8 encoding

#### Problem: "URL import fails with CORS error"

**Symptoms**:
- Can't import from URLs
- Console shows CORS policy error
- Works locally but fails from URL

**Solutions**:

1. **CORS restrictions**:
   - Server must allow cross-origin requests
   - Contact server admin to enable CORS
   - Use proxy service if needed

2. **Alternative approaches**:
   - Download file and import locally
   - Use curl/wget to fetch, then import
   - Host file on CORS-enabled server

3. **Test with public datasets**:
   ```sql
   -- Known working URL
   SELECT * FROM read_csv('https://raw.githubusercontent.com/...');
   ```

### External Connections

#### Problem: "Cannot connect to external DuckDB server"

**Symptoms**:
- Connection times out
- Authentication fails
- Server not accessible

**Solutions**:

1. **Verify environment variables**:
   ```bash
   DUCK_UI_EXTERNAL_HOST=http://your-server:8000
   DUCK_UI_EXTERNAL_PORT=8000
   DUCK_UI_EXTERNAL_USER=username
   DUCK_UI_EXTERNAL_PASS=password
   ```

2. **Check network connectivity**:
   ```bash
   # Test from Docker host
   curl http://your-server:8000/health
   ```

3. **Firewall/security**:
   - Verify firewall rules allow connection
   - Check if VPN is required
   - Ensure ports are open

4. **Docker networking**:
   - Use host IP/FQDN, not `localhost`
   - For Docker Compose, use service names
   - Check Docker network configuration

#### Problem: "External connection appears but can't query"

**Solutions**:
- Check DuckDB HTTP API is enabled on server
- Verify authentication credentials
- Test with DuckDB CLI first
- Review server logs for errors

### Extensions

#### Problem: "Extension loading failed"

**Symptoms**:
- `INSTALL extension` fails
- Extension not found
- Unsigned extension error

**Solutions**:

1. **Enable unsigned extensions**:
   ```bash
   docker run -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true" ...
   ```

2. **Check extension compatibility**:
   - Not all extensions work with WASM
   - Verify extension is WASM-compatible
   - Check DuckDB version compatibility

3. **Common working extensions**:
   ```sql
   -- These typically work in WASM
   INSTALL httpfs;
   LOAD httpfs;

   INSTALL json;
   LOAD json;
   ```

4. **Extensions that don't work in WASM**:
   - Extensions requiring native libraries
   - Platform-specific extensions
   - Some database connectors

### Performance

#### Problem: "Queries are slow in browser"

**Solutions**:

1. **Optimize queries**:
   ```sql
   -- Use LIMIT for exploration
   SELECT * FROM large_table LIMIT 1000;

   -- Filter early
   SELECT * FROM table
   WHERE date > '2024-01-01'  -- Filter first
   LIMIT 1000;
   ```

2. **Memory management**:
   - Close unused query tabs
   - Clear query history periodically
   - Restart browser if memory is high

3. **Use external connection for large datasets**:
   - WASM mode has memory limits
   - External DuckDB for production workloads
   - Better performance for large datasets

4. **Browser selection**:
   - Chrome/Edge generally fastest
   - Use desktop, not mobile
   - Close other browser tabs

### Docker Issues

#### Problem: "Docker container won't start"

**Solutions**:

1. **Check Docker logs**:
   ```bash
   docker logs duck-ui
   ```

2. **Port conflicts**:
   ```bash
   # Check if port is in use
   lsof -i :5522

   # Use different port
   docker run -p 5523:5522 ...
   ```

3. **Environment variable syntax**:
   ```bash
   # Correct
   -e DUCK_UI_EXTERNAL_HOST="http://server"

   # Incorrect (no quotes may cause issues)
   -e DUCK_UI_EXTERNAL_HOST=http://server
   ```

4. **Image issues**:
   ```bash
   # Pull latest image
   docker pull ghcr.io/ibero-data/duck-ui:latest

   # Remove old containers
   docker rm duck-ui
   ```

#### Problem: "Changes to environment variables not taking effect"

**Solutions**:
```bash
# Stop and remove container
docker stop duck-ui && docker rm duck-ui

# Recreate with new variables
docker run --name duck-ui -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_HOST="new-value" \
  ghcr.io/ibero-data/duck-ui:latest
```

## Browser-Specific Issues

### Chrome/Edge

**Problem**: High memory usage

**Solutions**:
- Use Task Manager (Shift+Esc) to monitor tabs
- Enable "Memory Saver" in chrome://settings
- Close unused tabs and extensions

### Firefox

**Problem**: OPFS features unavailable

**Solutions**:
- Enable `dom.fs.enabled` in about:config
- Update to Firefox 111+ for better support
- Use WASM mode if OPFS unavailable

### Safari

**Problem**: Limited OPFS support

**Solutions**:
- Update to Safari 15.2+
- Use WASM mode for reliability
- Consider Chrome/Edge for full features

## Getting Help

If you're still experiencing issues:

1. **Check GitHub Issues**: [github.com/ibero-data/duck-ui/issues](https://github.com/ibero-data/duck-ui/issues)
2. **Start a Discussion**: [github.com/ibero-data/duck-ui/discussions](https://github.com/ibero-data/duck-ui/discussions)
3. **Provide Details**:
   - Browser version
   - Operating system
   - Error messages (console logs)
   - Steps to reproduce
   - Duck-UI version (from Docker tag or git commit)

## Useful Debugging

### Check DuckDB Version

```sql
SELECT version();
```

### Check Available Extensions

```sql
SELECT * FROM duckdb_extensions();
```

### Check Browser Storage

```javascript
// In browser console
navigator.storage.estimate().then(estimate => {
  console.log(`Used: ${estimate.usage} bytes`);
  console.log(`Quota: ${estimate.quota} bytes`);
});
```

### Enable Verbose Logging

Open browser DevTools (F12) and check:
- Console tab for JavaScript errors
- Network tab for failed requests
- Application tab for storage inspection

## Next Steps

- [Environment Variables](/environment-variables) - Configuration guide
- [Getting Started](/getting-started) - Installation guide
- [GitHub Issues](https://github.com/ibero-data/duck-ui/issues) - Report bugs

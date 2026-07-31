# Security Policy

## Supported versions

The latest release is the only supported version. Duck-UI runs entirely in your browser with no backend, so upgrading is a page reload (or pulling the latest Docker image).

## Reporting a vulnerability

Please report vulnerabilities privately via [GitHub private vulnerability reporting](https://github.com/caioricciuti/duck-ui/security/advisories/new).

Please don't open public issues for security problems. You'll normally get a first response within a few days; fixes for confirmed issues ship as fast-follow releases.

## Scope notes

Duck-UI executes user-supplied SQL in the user's own browser by design — SQL running in your own session is not a vulnerability. Things that ARE in scope: XSS through query results or shared links, deep links (`?load=`/`?sql=`) executing without the confirmation dialog, CSP bypasses, credential storage (AES-256-GCM in IndexedDB) weaknesses, and anything that lets one origin read another session's data.

# Execution architecture

How Duck-UI runs SQL, and why it is layered the way it is.

Status: Phase 1 shipped. Collaboration, peer execution, dashboards and Fork are
designed against these interfaces but not yet implemented. Nothing in this
document describes a server that executes SQL, because there isn't one and
there won't be.

---

## The problem

Duck-UI executes SQL against things that have almost nothing in common:

| Target | Where it runs | Wire format | Durable | Cancellable |
| --- | --- | --- | --- | --- |
| DuckDB-WASM, in-memory | this tab | Arrow | no | yes |
| DuckDB-WASM on OPFS | this tab | Arrow | yes | yes |
| DuckDB `httpserver` | a server | JSONCompact | yes | request only |
| another participant's browser | their tab | Arrow over WebRTC | theirs | yes |
| DuckDB 2.x over Quack | a server | Arrow | yes | yes |

Before Phase 1 the app branched on a three-value `scope` field in five
different places, and every consumer reached directly for a live
`AsyncDuckDBConnection` held in the store. Adding a transport meant editing
every branch; adding peer execution would have meant editing them twice.

The layer below replaces that with one question the UI is allowed to ask:
**what can this session do?**

---

## Layering

```
ConnectionDefinition      what to connect to. Serializable. No secrets.
CredentialMaterial        the secrets. Supplied separately. Never persisted here.
        │
        ▼
DataDriver                knows how to open one kind of connection
        │
        ▼
DataSession               live handle + SessionCapabilities
        │
        ▼
QueryExecution            one statement: streamed, cancellable
        │
        ▼
QueryStreamEvent          started → schema → batch* → completed | failed
```

Source layout:

```
src/services/engine/
  types.ts                  the contracts above
  queryStream.ts            execution envelope, truncation, materializers
  session.ts                capability presets, schema/catalog adapters, LocalDuckSession
  registry.ts               driver lookup + session lifecycle
  legacy.ts                 bridge to the pre-Phase-1 shapes
  drivers/
    localDuckSession.ts     shared in-tab DuckDB session
    wasmDriver.ts
    opfsDriver.ts
    httpDuckDriver.ts
```

Reserved but unimplemented: `peer`, `quack`, `flight-web`. They exist in the
`ConnectionKind` union so exhaustiveness checks stay honest, and `getDriver`
returns a plain-language error rather than a crash if one is reached.

---

## Capabilities, not kinds

`SessionCapabilities` is the contract between the engine and the UI:

```ts
streaming            results arrive incrementally
cancellation         an in-flight query can be interrupted
readonly / writable  whether mutations are accepted
transactions
persistence          data survives a reload
remote               execution happens outside this tab
shareable            may be offered to other participants
supportsCatalog
supportsFileImport   local files can be registered into the engine
arrowNative          batches are genuine Arrow RecordBatches
```

The rule: **`if (kind === "duck-http")` in a component is a bug.** Ask for a
capability instead. When peer sessions land, the data explorer, importer and
deep-link loader already behave correctly because they read
`supportsFileImport` and `remote`, not a connection type.

Current presets:

| | wasm | opfs | duck-http |
| --- | --- | --- | --- |
| streaming | ✓ | ✓ | |
| cancellation | ✓ | ✓ | ✓ (request only) |
| writable | ✓ | ✓ | ✓ |
| persistence | | ✓ | ✓ |
| remote | | | ✓ |
| supportsFileImport | ✓ | ✓ | |
| arrowNative | ✓ | ✓ | |

---

## The Arrow pipeline

Arrow is the canonical internal representation. `resultToJSON` — which carries
the hard-won DuckDB coercions (decimal word reconstruction, UTC dates,
month-day-nano intervals read straight from chunk buffers, geometry/varint/blob
decoding) — is a **materializer at the edge**, not a step in the pipeline.

```
DuckDB-WASM
    │  RecordBatch
    ▼
QueryExecution.stream
    ├── data grid          (materialized today, progressive later)
    ├── charts
    ├── exports
    ├── WebRTC / Arrow IPC (Phase 3)
    └── dashboards         (Phase 6)
```

### Why there is a chunk union

```ts
type QueryChunk =
  | { encoding: "arrow"; batch: RecordBatch }
  | { encoding: "rows"; rows: Record<string, unknown>[] }
```

The DuckDB HTTP server speaks JSONCompact. Synthesizing Arrow from it would
invent type information the server never sent — and that invention would then
be transmitted as fact the moment the result crossed an IPC boundary. So the
session declares `arrowNative: false` and emits row chunks. Consumers that
genuinely require Arrow (IPC transport, zero-copy charting) check the flag
rather than assume.

### Materializing

`collectExecution` drains a stream; `materializeCollected` renders it as the
legacy `QueryResult`. Both are the eager path, kept because most of the UI
still wants a whole result. Progressive consumers iterate `execution.stream`
directly. Migration is incremental by design — nothing was rewritten to move.

---

## Execution semantics

Every driver gets identical semantics from `createExecution`, which is the
point: a peer-executed query must behave exactly like a local one.

- **Lazy.** Nothing runs until the stream is iterated.
- **Single-consumption.** The underlying cursor is spent; a second iteration
  throws rather than silently returning nothing.
- **Failure is an event, not a rejection.** A `failed` event ends the stream.
  Messages have already been through `explainEngineError`.
- **Cancellation is distinguishable from failure.** `QueryErrorInfo.cancelled`
  separates "the user pressed Stop" from "the query was wrong".
- **`maxRows` is enforced by the session**, not the consumer, so a policy cap
  cannot be bypassed. Hitting it slices the batch, interrupts the engine, and
  still reports `completed` with `truncated: true` — the rows the caller asked
  for were all delivered.

### The two rules the local session must not break

Both predate the engine layer and are load-bearing:

1. **Statements run on a dedicated connection**, never the one used for catalog
   introspection. A streamed `send()` result is silently truncated when any
   other statement runs on the same connection before the stream is drained.
   Boot-time introspection was doing exactly that, and auto-run share links
   shipped returning zero rows because of it.
2. **One statement at a time** on that connection. Executions queue. Session
   state (`SET`, temp tables) therefore survives across runs without two
   cursors ever interleaving.

---

## Session lifecycle

`registry.ts` owns it, not the Zustand store. One session per connection id,
with concurrent opens de-duplicated — for OPFS a double open would deadlock on
the file lock, and for WASM it would silently double a 34MB engine.

The store keeps `currentSession` for convenience and projects `db`/`connection`
for the few code paths that genuinely need an in-tab DuckDB handle (file
import, parquet export, deep-link attach). Those go through
`requireLocalDuckSession`, which is the one deliberate escape hatch in the
layer and is gated by `supportsFileImport`.

Only one OPFS engine stays open at a time: switching away closes the previous
one rather than pinning a worker and 34MB per database ever visited.

---

## Credentials

Secrets never enter a `ConnectionDefinition`. They travel as
`CredentialMaterial`, supplied at `connect()` time and held only in memory and
in Duck-UI's existing encrypted local store.

This is not tidiness. `ConnectionDefinition` is what gets persisted, what goes
into workspace state, and — for the subset a host explicitly shares — what will
be described to a peer. A `CatalogSnapshot` names catalogs, schemas, tables and
types; it never carries data and never carries secrets. That is what makes it
safe to say "this guest can query Production" without the guest ever learning
how to reach Production.

---

## Future transports

### Peer (Phase 3)

`PeerDriver` becomes another `DataDriver`. Its session's `execute()` sends a
`query.start` over a WebRTC DataChannel and turns the returning Arrow IPC
frames into the same `QueryStreamEvent`s every other driver emits. Nothing
above the driver changes.

Guest SQL will **not** run in the host's privileged session. A separate
Share Runtime — its own DuckDB-WASM instance holding only explicitly shared
data — executes it. That boundary is a Phase 5 deliverable and its limitations
will be documented rather than overstated.

### Quack (future)

DuckDB 2.x over Quack is a `QuackDriver` and nothing else. No core type
mentions DuckDB 2.0, and none should.

### Flight SQL (future, constrained)

Ordinary Arrow Flight SQL is **not reachable from a browser** — it is Flight
over gRPC, and generic Flight servers are not browser-compatible. DuckDB's
Airport/Flight support does not exist in DuckDB-WASM either.

So `FlightSqlWebDriver` is reserved only for endpoints that explicitly offer a
browser-compatible protocol such as gRPC-Web. Ordinary Flight SQL reaches
Duck-UI by a different route: through a native DuckDB behind Quack, or through
a peer that has native capability. Nothing in the current architecture waits on
any of this.

---

## Testing

| Area | Where |
| --- | --- |
| stream envelope, truncation, cancellation, materializers | `engine/__tests__/queryStream.test.ts` |
| dedicated connection, serialization, interrupt wiring, teardown | `engine/__tests__/localDuckSession.test.ts` |
| JSONCompact → schema + rows, auth headers, abort, caps | `engine/__tests__/httpDuckDriver.test.ts` |
| driver lookup, open de-duplication, close ordering | `engine/__tests__/registry.test.ts` |
| scope ↔ kind, secret exclusion, catalog adapter | `engine/__tests__/legacy.test.ts` |
| real DuckDB coercions | `services/duckdb/__tests__/engineIntegration.test.ts` |
| app-level regressions | `e2e/smoke.spec.ts` |

Note that `bun run typecheck` (`tsc -b --noEmit`) does **not** catch everything
— `--noEmit` is ignored in build mode. `bun run build` is the real gate.

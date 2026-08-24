# Security model

The threat model for Duck-UI's collaborative features, written from what the
code enforces — not from what would be nice. Where a protection is partial,
this document says so; a security page that overclaims is worse than none.

Companion to `execution.md`. File references are to `src/`.

---

## Posture in one paragraph

Duck-UI has no application backend, so there is no server to trust — and none
to compromise. Every boundary that matters is either **architectural** (a
separate process/engine that hostile input physically cannot reach),
**cryptographic** (DTLS on every peer link, AES-256-GCM on stored
credentials), or **validated at the edge** (every inbound network byte parsed
by Zod before any field is read). Pattern-matching of SQL exists but is
defence-in-depth, never the boundary itself.

## Assets

| Asset | Where it lives | Must never |
| --- | --- | --- |
| Database credentials | memory + encrypted IndexedDB (`persistence/crypto.ts`) | reach a peer, a URL, or collaborative state |
| Local datasets | DuckDB-WASM / OPFS | leave without an explicit share or fork |
| Query results | the browser that ran the query | be CRDT-synced or persisted into shares |
| Workspace documents | Yjs doc + IndexedDB | carry any of the above |

## Trust boundaries

```
 YOUR BROWSER
 ┌────────────────────────────────────────────────┐
 │ private engine        share runtime            │
 │  credentials           only copied-in data     │
 │  OPFS, local files     external access OFF     │
 │  extensions            config LOCKED           │
 │        │        explicit copy ▲                │
 │        └───────────────────────┘               │
 │                                │ screened SQL  │
 └────────────────────────────────┼───────────────┘
                       DTLS (WebRTC) │ Zod-validated frames
 ┌────────────────────────────────┼───────────────┐
 │ PEER BROWSER (assumed hostile) ▼               │
 └────────────────────────────────────────────────┘
```

### 1. The peer is hostile until proven otherwise

Every inbound frame passes `protocol/codec.ts`: length-checked framing, a
version gate, then a **closed** Zod union (`protocol/messages.ts`) with size
caps on every string and list. Unknown message types are rejected, not
ignored. Chunk reassembly (`arrow/chunking.ts`) validates every declared
length before allocating, caps message size at 256 MB, and drops a message
whose chunks contradict each other. Decoding never throws; malformed frames
become counted `protocolErrors`.

### 2. Guest SQL never touches your session

The boundary is the **ShareRuntime** (`collaboration/shareRuntime.ts`): a
separate DuckDB-WASM instance in its own worker holding only tables you
explicitly copied in. It boots with `enable_external_access=false` (no httpfs,
no local files, no remote ATTACH/COPY — enforced by DuckDB itself), extension
autoload off, a 512 MB memory ceiling, and `lock_configuration=true` applied
last so guest SQL cannot re-enable any of it. A failed hardening step aborts
the runtime rather than starting it soft.

The statement screen (`capabilities/policy.ts`) sits in FRONT of that: an
allowlist of read shapes, refusal of multiple statements, writes, ATTACH,
COPY, INSTALL/LOAD, SET, and file/URL reader functions, with comment and
string-literal stripping first. **It is a legibility layer** — a guest typing
`DROP TABLE` gets a clear refusal instead of an engine error — and a bypass of
it is a bug to fix, not a breach, because everything behind it is the isolated
runtime.

### 3. Capabilities carry names, never means

A grant (`capabilities/capability.ts`) tells a guest that "Production" exists
and its table shapes. The wire type has **no field that could hold a
credential**; `toWireCapability` additionally strips the executor before
sending. Limits (row cap, byte cap, expiry, timeout, concurrency) are enforced
host-side on every request — a guest's `maxRows` is clamped to the grant, an
expired or revoked capability is refused with the same message as one that
never existed, and re-sharing is impossible because peer sessions are not
`shareable`.

### 4. Signaling reveals topology, nothing else

Manual pairing means invite/answer blobs carried by people. They contain SDP:
IP addresses, ports, a DTLS fingerprint. Whoever reads the chat you pasted an
invite into learns your network addresses — and nothing else; an offer is
useless to anyone but the first peer to answer it, because DTLS binds the
connection to the fingerprint. Invites are single-use (`inviteId`), and every
share travels in the URL **fragment**, which browsers never send to servers —
query strings would put SQL and SDP into access logs and referrer headers.

### 5. Untrusted text renders, it does not execute

Dashboard documents and notebook markdown pass through DOMPurify. Component
props are parsed, never evaluated; interpolation (`{q[0].col}`) is a lookup
with no expression language and no `eval` reachable from a document. Dashboard
inputs and parameters substitute into SQL as **escaped literals**
(`dashboard/inputs.ts`, `queryRunner.ts`) — a shared document's dropdown is
user input in the injection sense. Injection attempts are pinned by tests.

## Known limitations — read these as facts, not apologies

- **Viewer/editor share roles are workflow signals, not locks.** The document
  is in the recipient's browser; a determined recipient can extract it. The
  enforceable role boundary is a live session, where the host can revoke.
- **DuckDB-WASM has no intra-engine permission system.** ShareRuntime
  restrictions are instance-wide configuration. A guest can still make the
  runtime burn CPU within its caps; limits bound it, they do not eliminate it.
- **A guest can write TEMP state into the share runtime** if a statement gets
  past the screen — affecting only that throwaway instance, never host data.
- **Notebook live-sync merges per cell**: structure by cell id, text as CRDT
  characters, like SQL and dashboards. What syncs is a projection with no
  result field — query results stay with whoever ran the query.
- **TURN is opt-in and self-verifiable**: `DUCK_UI_TURN_URLS` configures a
  relay, and Share Live offers a probe that requests a relay-only candidate
  from it — exercising URL, credentials and allocation, the same path a real
  session uses behind a strict NAT. A relay sees only DTLS ciphertext.
- **Reconnection is a grace window plus manual re-pair**: a transient ICE drop
  gets ~12s to recover on its own before the session reacts; a real drop
  requires a fresh invite, because manual signaling has no channel to
  renegotiate through. Rejoining restores the shared workspace via state-vector
  sync; nothing local is lost either way.
- **The host relays plaintext between guests.** Peer links are DTLS-encrypted
  hop-by-hop; the host, by design, sees everything in its own session.
- **Availability is not defended**: a guest flooding queries hits the
  concurrency cap and per-query limits, but a malicious peer can still consume
  the host's attention until removed. Removal is one click.

## Standing rules for contributors

1. Anything crossing the network gets a Zod schema and size caps. TypeScript
   types prove nothing at runtime.
2. Secrets never gain a field in any type that is persisted, synced, or sent.
   Absence of the field is the control.
3. New engine surfaces for guests go through the ShareRuntime, never the
   private session — the regex screen is not a boundary.
4. Shares and invites ride the URL fragment, never the query string.
5. Fail closed and legible: an expired grant, an unknown tag, a blocked
   storage upgrade each say what happened rather than doing something else.

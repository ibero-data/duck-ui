/**
 * DuckDB `httpserver` reached over HTTP(S).
 *
 * This endpoint answers a whole query in one POST and replies in JSONCompact.
 * That has consequences the rest of the app must not paper over:
 *
 * - No Arrow. The session reports `arrowNative: false` and emits row chunks.
 *   Synthesizing Arrow here would invent type information the server never
 *   sent, and would be wrong the moment the result crosses an IPC boundary.
 * - No incremental delivery. `streaming: false`; the single chunk arrives when
 *   the request completes.
 * - Cancellation aborts the *request*, not the server-side query. The server
 *   keeps working; we simply stop waiting. Advertised as `cancellation: true`
 *   because the user-visible effect (the query stops blocking them) is real.
 * - No local file import, so `supportsFileImport: false` and the importer
 *   correctly refuses instead of failing halfway.
 */

import { generateUUID } from "@/lib/utils";
import {
  executeExternalQuery,
  fetchExternalDatabases,
  testExternalConnection,
  type ExternalEndpoint,
} from "@/services/duckdb/externalConnection";
import { createExecution } from "../queryStream";
import { DUCK_HTTP_CAPABILITIES, catalogSnapshot } from "../session";
import type {
  CatalogSnapshot,
  ConnectionDefinition,
  CredentialMaterial,
  DataDriver,
  DataSession,
  QueryExecution,
  QueryRequest,
  SessionCapabilities,
} from "../types";

/** Folds the definition and its secrets into the shape the fetch layer wants. */
const toEndpoint = (
  definition: ConnectionDefinition<"duck-http">,
  credentials?: CredentialMaterial
): ExternalEndpoint => ({
  host: definition.config.host,
  port: definition.config.port,
  database: definition.config.database,
  authMode: definition.config.authMode,
  user: definition.config.user,
  password: credentials?.password,
  apiKey: credentials?.apiKey,
});

class DuckHttpSession implements DataSession {
  readonly id = generateUUID();
  readonly kind = "duck-http" as const;
  readonly capabilities: SessionCapabilities = DUCK_HTTP_CAPABILITIES;

  private open = true;

  constructor(
    readonly connectionId: string,
    private readonly endpoint: ExternalEndpoint
  ) {}

  get isOpen(): boolean {
    return this.open;
  }

  execute(request: QueryRequest): QueryExecution {
    const controller = new AbortController();
    const endpoint = this.endpoint;
    const isOpen = () => this.open;

    return createExecution({
      id: request.id,
      sql: request.sql,
      signal: request.signal,
      maxRows: request.maxRows,
      onCancel: () => controller.abort(),
      async *produce() {
        if (!isOpen()) throw new Error("Connection is closed");

        const result = await executeExternalQuery(request.sql, endpoint, controller.signal);
        if (result.error) throw new Error(result.error);

        yield {
          kind: "schema",
          schema: {
            fields: result.columns.map((name, index) => ({
              name,
              type: result.columnTypes[index] ?? "VARCHAR",
              // JSONCompact carries no nullability; assuming nullable is the
              // safe direction — it never promises more than the server said.
              nullable: true,
            })),
          },
        };

        yield {
          kind: "chunk",
          rows: result.data.length,
          chunk: { encoding: "rows", rows: result.data },
        };
      },
    });
  }

  async introspect(): Promise<CatalogSnapshot> {
    if (!this.open) throw new Error("Connection is closed");
    const databases = await fetchExternalDatabases(this.endpoint);
    return catalogSnapshot(
      databases.map((database) => ({
        name: database.name,
        tables: database.tables.map((table) => ({
          name: table.name,
          schema: table.schema,
          columns: table.columns,
          // The endpoint has no cheap row count. Zero is what the consumers
          // (schema autocomplete, the AI schema formatter) treat as "unknown"
          // and skip; a negative sentinel would render as "-1 rows".
          rowCount: table.rowCount,
        })),
      }))
    );
  }

  async close(): Promise<void> {
    // Nothing to release — each query is its own request.
    this.open = false;
  }
}

export const httpDuckDriver: DataDriver<"duck-http"> = {
  kind: "duck-http",

  async isAvailable(): Promise<boolean> {
    return typeof fetch === "function";
  },

  async connect(
    definition: ConnectionDefinition<"duck-http">,
    credentials?: CredentialMaterial
  ): Promise<DataSession> {
    return new DuckHttpSession(definition.id, toEndpoint(definition, credentials));
  },

  async test(
    definition: ConnectionDefinition<"duck-http">,
    credentials?: CredentialMaterial
  ): Promise<void> {
    await testExternalConnection(toEndpoint(definition, credentials));
  },
};

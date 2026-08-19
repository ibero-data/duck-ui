/**
 * Host side of peer execution.
 *
 * Listens for `query.start` from guests, screens it against the granting
 * capability, runs it in the share runtime, and streams Arrow batches back.
 *
 * Everything a guest sends is a request, never an instruction. The host
 * decides whether the capability exists, whether it has expired, whether the
 * statement is a read, and how many rows come back. A guest cannot widen any
 * of that by asking.
 */

import { Table } from "apache-arrow";
import { encodeRecordBatch, encodeSchema } from "@/services/arrow/ipc";
import { collectExecution, createExecution, type ProducedItem } from "@/services/engine";
import { arrowSchemaToQuerySchema } from "@/services/engine/session";
import {
  effectiveMaxRows,
  isCapabilityExpired,
  type SharedCapability,
} from "./capabilities/capability";
import { screenGuestQuery } from "./capabilities/policy";
import type { ShareRuntime } from "./shareRuntime";
import type { InboundMessage, PeerTransport } from "./transport/transport";
import type { QueryStartMessage } from "./protocol/messages";

export interface PeerHostOptions {
  transport: PeerTransport;
  runtime: ShareRuntime;
  /** Capabilities this host currently grants, by id. */
  capabilities: Map<string, SharedCapability>;
  /** Concurrent guest queries allowed. Bounds what one peer can start. */
  maxConcurrentQueries?: number;
}

interface RunningQuery {
  cancel: () => void;
}

/** Default ceiling on how many guest queries may run at once. */
export const MAX_CONCURRENT_GUEST_QUERIES = 4;

export class PeerHost {
  private readonly running = new Map<string, RunningQuery>();
  private readonly detach: () => void;
  private closed = false;

  constructor(private readonly options: PeerHostOptions) {
    this.detach = options.transport.onMessage((inbound) => {
      void this.handle(inbound);
    });
  }

  /** Queries currently executing for guests. */
  get runningCount(): number {
    return this.running.size;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.detach();
    for (const query of this.running.values()) query.cancel();
    this.running.clear();
  }

  private async handle(inbound: InboundMessage): Promise<void> {
    if (this.closed) return;
    switch (inbound.message.t) {
      case "query.start":
        await this.startQuery(inbound.message);
        break;
      case "query.cancel":
        this.running.get(inbound.message.queryId)?.cancel();
        break;
      default:
        // Other message types belong to other subsystems.
        break;
    }
  }

  private async fail(queryId: string, message: string, cancelled = false): Promise<void> {
    await this.options.transport
      .send("query", { t: "query.error", queryId, message, cancelled })
      .catch(() => {
        // The guest is gone; nothing further to report to.
      });
  }

  private async startQuery(request: QueryStartMessage): Promise<void> {
    const { queryId, capabilityId, sql } = request;

    if (this.running.has(queryId)) {
      await this.fail(queryId, "A query with this id is already running");
      return;
    }

    const limit = this.options.maxConcurrentQueries ?? MAX_CONCURRENT_GUEST_QUERIES;
    if (this.running.size >= limit) {
      await this.fail(queryId, "Too many queries running on this shared connection");
      return;
    }

    const capability = this.options.capabilities.get(capabilityId);
    // Same message whether the capability never existed or was revoked: a
    // guest should not be able to probe which ids a host has.
    if (!capability) {
      await this.fail(queryId, "This shared connection is no longer available");
      return;
    }
    if (isCapabilityExpired(capability)) {
      await this.fail(queryId, "Access to this shared connection has expired");
      return;
    }

    const verdict = screenGuestQuery(sql, capability.policy);
    if (!verdict.allowed) {
      await this.fail(queryId, verdict.reason ?? "This query is not permitted");
      return;
    }

    if (!this.options.runtime.isRunning) {
      await this.fail(queryId, "This shared connection is no longer available");
      return;
    }

    const maxRows = effectiveMaxRows(capability.policy, request.maxRows);
    const timeoutMs = capability.policy.timeoutMs;
    const maxBytes = capability.policy.maxResultBytes;

    const connection = this.options.runtime.requireConnection();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const execution = createExecution({
      id: queryId,
      sql,
      maxRows,
      signal: controller.signal,
      onCancel: () => connection.cancelSent().then(() => undefined),
      produce: async function* (): AsyncGenerator<ProducedItem> {
        const reader = await connection.send(sql);
        if (reader.schema) {
          yield { kind: "schema", schema: arrowSchemaToQuerySchema(reader.schema) };
        }
        for await (const batch of reader) {
          yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
        }
      },
    });

    this.running.set(queryId, { cancel: () => controller.abort() });

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      let seq = 0;
      let sentBytes = 0;
      let overBytes = false;

      for await (const event of execution.stream) {
        if (this.closed) break;

        switch (event.type) {
          case "schema": {
            // The schema travels as Arrow too, so the guest rebuilds real
            // Arrow types rather than a JSON approximation of them.
            const payload = event.schema.arrow
              ? encodeSchema(event.schema.arrow)
              : encodeSchema(new Table([]).schema);
            await this.options.transport.send("query", { t: "query.schema", queryId }, payload);
            break;
          }

          case "batch": {
            if (event.chunk.encoding !== "arrow") break;
            const payload = encodeRecordBatch(event.chunk.batch);

            // Byte cap: enforced as batches are sent, because a row cap alone
            // says nothing about width. Stop before exceeding it.
            if (maxBytes !== undefined && sentBytes + payload.byteLength > maxBytes) {
              overBytes = true;
              controller.abort();
              break;
            }
            sentBytes += payload.byteLength;

            await this.options.transport.send(
              "query",
              { t: "query.batch", queryId, seq, rows: event.rows },
              payload
            );
            seq += 1;
            break;
          }

          case "completed":
            await this.options.transport.send("query", {
              t: "query.complete",
              queryId,
              rowCount: event.rowCount,
              batchCount: event.batchCount,
              durationMs: event.durationMs,
              // Reported as truncated whether the cap that bit was rows or
              // bytes — the guest's result is a prefix either way.
              truncated: event.truncated || overBytes,
            });
            break;

          case "failed":
            if (overBytes) {
              await this.options.transport.send("query", {
                t: "query.complete",
                queryId,
                rowCount: 0,
                batchCount: seq,
                durationMs: 0,
                truncated: true,
              });
            } else {
              await this.fail(queryId, event.error.message, event.error.cancelled);
            }
            break;

          case "started":
            break;
        }
      }
    } catch (error) {
      await this.fail(queryId, error instanceof Error ? error.message : "Query failed on the host");
    } finally {
      if (timer) clearTimeout(timer);
      this.running.delete(queryId);
    }
  }
}

/** Convenience for tests and diagnostics: run one statement locally. */
export const runInShareRuntime = async (runtime: ShareRuntime, sql: string): Promise<Table> => {
  const connection = runtime.requireConnection();
  const collected = await collectExecution(
    createExecution({
      sql,
      produce: async function* (): AsyncGenerator<ProducedItem> {
        const reader = await connection.send(sql);
        if (reader.schema) {
          yield { kind: "schema", schema: arrowSchemaToQuerySchema(reader.schema) };
        }
        for await (const batch of reader) {
          yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
        }
      },
    })
  );
  if (collected.error) throw new Error(collected.error.message);
  return new Table(collected.batches);
};

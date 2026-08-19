/**
 * Arrow IPC encoding for peer transport.
 *
 * Query results cross the wire as Arrow IPC bytes, never as JSON. Serializing
 * a batch to JSON would cost the type fidelity the whole Arrow-first pipeline
 * exists to preserve — decimals, timestamps, intervals and binary columns all
 * degrade — and would inflate the payload several-fold.
 *
 * Each batch is encoded as a SELF-CONTAINED IPC stream (schema + one batch)
 * rather than as a continuation of one long stream. That repeats the schema on
 * every frame, which costs a few hundred bytes against batches that are
 * typically tens to hundreds of kilobytes. In exchange the receiver is
 * stateless: a frame decodes on its own, a dropped or late frame cannot
 * corrupt the ones after it, and a query that fails midway leaves no
 * half-open decoder behind. For a link that can stall, reconnect, or
 * interleave several queries, that trade is worth making.
 */

import { RecordBatch, Table, tableFromIPC, tableToIPC, type Schema } from "apache-arrow";

/** Encodes one record batch as a standalone Arrow IPC stream. */
export const encodeRecordBatch = (batch: RecordBatch): Uint8Array =>
  tableToIPC(new Table([batch]), "stream");

/** Encodes a schema with no rows — used to announce a result's shape. */
export const encodeSchema = (schema: Schema): Uint8Array => tableToIPC(new Table(schema), "stream");

/**
 * Decodes an Arrow IPC stream back into record batches.
 *
 * Returns every batch in the payload. A frame written by `encodeRecordBatch`
 * yields exactly one; a schema-only frame yields none.
 */
export const decodeRecordBatches = (bytes: Uint8Array): RecordBatch[] => {
  const table = tableFromIPC(bytes);
  return table.batches.filter((batch) => batch.numRows > 0);
};

/** Decodes just the schema from any IPC payload. */
export const decodeSchema = (bytes: Uint8Array): Schema => tableFromIPC(bytes).schema;

/**
 * Decodes a frame into a table, preserving the schema even when there are no
 * rows. Callers that need column headers for an empty result want this rather
 * than `decodeRecordBatches`.
 */
export const decodeTable = (bytes: Uint8Array): Table => tableFromIPC(bytes);

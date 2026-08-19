import { describe, it, expect, vi } from "vitest";
import { tableFromArrays } from "apache-arrow";
import type * as duckdb from "@duckdb/duckdb-wasm";
import { ShareRuntime } from "../shareRuntime";
import { decodeRecordBatches } from "@/services/arrow/ipc";

/**
 * The share runtime's contract with DuckDB, pinned.
 *
 * Booting a real one needs a browser worker, so these drive the load/seal path
 * against a recording connection. That is enough to catch the class of bug
 * that matters here: reaching for the wrong DuckDB API.
 */
const recordingRuntime = () => {
  const statements: string[] = [];
  const inserts: { ipc: Uint8Array; options: { name?: string; create?: boolean } }[] = [];

  const connection = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      return tableFromArrays({ n: [1] });
    }),
    insertArrowFromIPCStream: vi.fn(
      async (ipc: Uint8Array, options: { name?: string; create?: boolean }) => {
        inserts.push({ ipc, options });
      }
    ),
    close: vi.fn(async () => {}),
  };

  const db = {
    registerFileBuffer: vi.fn(async () => {}),
    dropFile: vi.fn(async () => {}),
    terminate: vi.fn(async () => {}),
  };

  const runtime = ShareRuntime.wrapping(
    db as unknown as duckdb.AsyncDuckDB,
    connection as unknown as duckdb.AsyncDuckDBConnection
  );

  return { runtime, connection, db, statements, inserts };
};

const sample = () =>
  tableFromArrays({
    id: Int32Array.from([1, 2, 3]),
    label: ["a", "b", "c"],
  }).batches;

describe("ShareRuntime — loading shared tables", () => {
  it("inserts Arrow straight into the engine", async () => {
    const { runtime, connection, inserts } = recordingRuntime();
    await runtime.addTable({ name: "twitter_dataset", batches: sample() });

    expect(connection.insertArrowFromIPCStream).toHaveBeenCalledTimes(1);
    expect(inserts[0].options).toMatchObject({ name: "twitter_dataset", create: true });
    // The bytes really are the rows, not a reference to them.
    const decoded = decodeRecordBatches(inserts[0].ipc);
    expect(decoded[0].numRows).toBe(3);
  });

  it("does NOT register a file buffer and select from its name", async () => {
    // The bug this pins: a registered buffer lives in the virtual filesystem,
    // and DuckDB resolves a bare identifier against the CATALOG — so
    // `SELECT * FROM "<id>-name.arrow"` fails with "Table with name … does not
    // exist". It would also be a path read, which this runtime forbids.
    const { runtime, db, statements } = recordingRuntime();
    await runtime.addTable({ name: "twitter_dataset", batches: sample() });

    expect(db.registerFileBuffer).not.toHaveBeenCalled();
    expect(statements.join("\n")).not.toMatch(/\.arrow/);
    expect(statements.join("\n")).not.toMatch(/CREATE OR REPLACE TABLE/i);
  });

  it("tracks what a guest may query", async () => {
    const { runtime } = recordingRuntime();
    await runtime.addTable({ name: "sales", batches: sample() });
    await runtime.addTable({ name: "customers", batches: sample() });
    expect(runtime.tableNames).toEqual(["sales", "customers"]);
  });

  it("refuses a table with no data rather than creating an empty one", async () => {
    const { runtime } = recordingRuntime();
    await expect(runtime.addTable({ name: "empty", batches: [] })).rejects.toThrow(/no data/i);
  });

  it("refuses to load into a runtime that is not running", async () => {
    const { runtime } = recordingRuntime();
    await runtime.close();
    await expect(runtime.addTable({ name: "x", batches: sample() })).rejects.toThrow(
      /not running/i
    );
  });
});

describe("ShareRuntime — sealing", () => {
  it("locks configuration so guest SQL cannot re-enable anything", async () => {
    const { runtime, statements } = recordingRuntime();
    await runtime.seal();
    expect(statements).toContain("SET lock_configuration=true");
  });

  it("surfaces a failure to seal rather than continuing unsealed", async () => {
    const { runtime, connection } = recordingRuntime();
    connection.query.mockRejectedValueOnce(new Error("nope"));
    await expect(runtime.seal()).rejects.toThrow(/could not be sealed/i);
  });
});

describe("ShareRuntime — teardown", () => {
  it("releases the connection and terminates the engine", async () => {
    const { runtime, connection, db } = recordingRuntime();
    await runtime.addTable({ name: "sales", batches: sample() });
    await runtime.close();

    expect(connection.close).toHaveBeenCalled();
    expect(db.terminate).toHaveBeenCalled();
    expect(runtime.isRunning).toBe(false);
    expect(runtime.tableNames).toEqual([]);
  });
});

describe("ShareRuntime — catalog identity", () => {
  it("defaults to the catalog an in-memory DuckDB actually uses", () => {
    const { runtime } = recordingRuntime();
    expect(runtime.catalogName).toBe("memory");
    expect(runtime.schemaName).toBe("main");
  });

  it("reports names the guest's explorer can qualify against", () => {
    // Regression: the snapshot advertised a catalog called "shared" that the
    // runtime had never heard of, so the first table a guest clicked produced
    // `Binder Error: Catalog "shared" does not exist`. The snapshot must
    // describe the engine, not a label chosen for the UI.
    const { runtime } = recordingRuntime();
    expect(runtime.catalogName).not.toBe("shared");
    expect(runtime.catalogName).toBeTruthy();
    expect(runtime.schemaName).toBeTruthy();
  });
});

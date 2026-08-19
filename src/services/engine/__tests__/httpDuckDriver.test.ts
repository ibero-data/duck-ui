import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpDuckDriver } from "../drivers/httpDuckDriver";
import { collectExecution, materializeExecution } from "../queryStream";
import type { ConnectionDefinition } from "../types";

const definition: ConnectionDefinition<"duck-http"> = {
  id: "prod",
  name: "Production",
  origin: "APP",
  config: {
    kind: "duck-http",
    host: "duck.example.com",
    port: 9999,
    database: "analytics",
    authMode: "password",
    user: "reader",
  },
};

const jsonCompact = (meta: { name: string; type: string }[], data: unknown[][]): string =>
  JSON.stringify({ meta, data, rows: data.length });

const okResponse = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpDuckDriver — capabilities", () => {
  it("advertises remote and persistent, but not Arrow, streaming or file import", async () => {
    const session = await httpDuckDriver.connect(definition);
    expect(session.capabilities).toMatchObject({
      remote: true,
      persistence: true,
      arrowNative: false,
      streaming: false,
      supportsFileImport: false,
      supportsCatalog: true,
    });
  });

  it("reports its kind so the registry can route to it", () => {
    expect(httpDuckDriver.kind).toBe("duck-http");
  });
});

describe("httpDuckDriver — execution", () => {
  it("emits a schema from the JSONCompact meta, then one row chunk", async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        jsonCompact(
          [
            { name: "id", type: "BIGINT" },
            { name: "label", type: "VARCHAR" },
          ],
          [
            [1, "a"],
            [2, "b"],
          ]
        )
      )
    );

    const session = await httpDuckDriver.connect(definition);
    const collected = await collectExecution(session.execute({ sql: "SELECT * FROM t" }));

    expect(collected.schema?.fields).toEqual([
      { name: "id", type: "BIGINT", nullable: true },
      { name: "label", type: "VARCHAR", nullable: true },
    ]);
    expect(collected.batches).toEqual([]);
    expect(collected.rows).toEqual([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);
  });

  it("materializes to the legacy QueryResult shape with the server's types", async () => {
    fetchMock.mockResolvedValue(okResponse(jsonCompact([{ name: "n", type: "INTEGER" }], [[7]])));
    const session = await httpDuckDriver.connect(definition);
    const result = await materializeExecution(session.execute({ sql: "SELECT 7" }));

    expect(result).toMatchObject({
      columns: ["n"],
      columnTypes: ["INTEGER"],
      rowCount: 1,
      data: [{ n: 7 }],
    });
  });

  it("sends basic auth built from the definition's user and the supplied password", async () => {
    fetchMock.mockResolvedValue(okResponse(jsonCompact([{ name: "n", type: "INTEGER" }], [[1]])));

    const session = await httpDuckDriver.connect(definition, { password: "s3cret" });
    await materializeExecution(session.execute({ sql: "SELECT 1" }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("duck.example.com:9999");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("reader:s3cret")}`
    );
  });

  it("sends the API key header when the definition asks for key auth", async () => {
    fetchMock.mockResolvedValue(okResponse(jsonCompact([{ name: "n", type: "INTEGER" }], [[1]])));

    const keyed: ConnectionDefinition<"duck-http"> = {
      ...definition,
      config: { ...definition.config, authMode: "api_key", user: undefined },
    };
    const session = await httpDuckDriver.connect(keyed, { apiKey: "abc123" });
    await materializeExecution(session.execute({ sql: "SELECT 1" }));

    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["X-API-Key"]).toBe(
      "abc123"
    );
  });

  it("surfaces an auth rejection as a presentable failure", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
    const session = await httpDuckDriver.connect(definition);
    const collected = await collectExecution(session.execute({ sql: "SELECT 1" }));

    expect(collected.error?.cancelled).toBe(false);
    expect(collected.error?.message).toMatch(/authentication failed/i);
  });

  it("reports an aborted request as a cancellation, not a fault", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );

    const session = await httpDuckDriver.connect(definition);
    const execution = session.execute({ sql: "SELECT 1" });
    const collecting = collectExecution(execution);
    await execution.cancel();

    expect((await collecting).error?.cancelled).toBe(true);
  });

  it("applies maxRows as a hard cap on what the consumer sees", async () => {
    fetchMock.mockResolvedValue(
      okResponse(jsonCompact([{ name: "n", type: "INTEGER" }], [[1], [2], [3], [4]]))
    );
    const session = await httpDuckDriver.connect(definition);
    const collected = await collectExecution(session.execute({ sql: "SELECT 1", maxRows: 2 }));

    expect(collected.truncated).toBe(true);
    expect(collected.rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("refuses statements after close", async () => {
    const session = await httpDuckDriver.connect(definition);
    await session.close();
    const result = await materializeExecution(session.execute({ sql: "SELECT 1" }));
    expect(result.error).toMatch(/closed/i);
  });
});

describe("httpDuckDriver — credentials", () => {
  it("never stores secrets on the connection definition", () => {
    expect(JSON.stringify(definition)).not.toContain("s3cret");
    expect(Object.keys(definition.config)).not.toContain("password");
    expect(Object.keys(definition.config)).not.toContain("apiKey");
  });
});

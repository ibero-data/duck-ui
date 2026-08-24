import { describe, it, expect } from "vitest";
import { wkbToWkt, blobToString, varintToString, intervalToString } from "../cellDecoders";
import { explainEngineError, stagedFileName, stageRemoteTextFile } from "../utils";

/**
 * The happy paths are covered in engineIntegration.test.ts by diffing against
 * DuckDB's own ::VARCHAR output. What's left here are the cases a healthy
 * engine never produces: corrupt bytes and values too big to render.
 */
describe("wkbToWkt", () => {
  it("falls back to a size summary on corrupt bytes instead of throwing", () => {
    expect(wkbToWkt(new Uint8Array([1, 99, 0, 0, 0]))).toBe("GEOMETRY (5 bytes)");
  });

  it("falls back rather than reading past the end of a truncated geometry", () => {
    // A LINESTRING header claiming 100 points, with no coordinates behind it.
    const bytes = new Uint8Array([1, 2, 0, 0, 0, 100, 0, 0, 0]);
    expect(wkbToWkt(bytes)).toBe("GEOMETRY (9 bytes)");
  });

  it("summarises geometries too large to render in a cell", () => {
    const huge = new Uint8Array(1_000_001);
    expect(wkbToWkt(huge)).toBe("GEOMETRY (976.6 KB)");
  });

  it("reads big-endian geometries", () => {
    // POINT(1 2), byte-order flag 0, type and coordinates all big-endian.
    const bytes = new Uint8Array([
      0, 0, 0, 0, 1, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(wkbToWkt(bytes)).toBe("POINT (1 2)");
  });
});

describe("blobToString", () => {
  it("escapes the backslash so the output re-parses as the same blob", () => {
    expect(blobToString(new Uint8Array([0x5c]))).toBe("\\x5C");
  });

  it("summarises blobs too large to render in a cell", () => {
    expect(blobToString(new Uint8Array(1_000_001))).toBe("BLOB (976.6 KB)");
  });
});

describe("varintToString", () => {
  it("returns empty for a buffer shorter than the header", () => {
    expect(varintToString(new Uint8Array([128, 0]))).toBe("");
  });

  it("stops at the buffer end when the header overstates the length", () => {
    // Header claims 200 magnitude bytes; only one is present.
    expect(varintToString(new Uint8Array([128, 0, 200, 5]))).toBe("5");
  });
});

describe("intervalToString", () => {
  it("renders hours past 24 without rolling into days", () => {
    expect(intervalToString(0, 0, 90_000n * 1_000_000_000n)).toBe("25:00:00");
  });

  it("keeps the sign on each component independently", () => {
    expect(intervalToString(-1, 2, -1_000_000_000n)).toBe("-1 month 2 days -00:00:01");
  });

  it("prints a zero time rather than an empty string", () => {
    expect(intervalToString(0, 0, 0n)).toBe("00:00:00");
  });

  it("drops sub-microsecond precision the way DuckDB does", () => {
    expect(intervalToString(0, 0, 1_500_000_500n)).toBe("00:00:01.5");
  });
});

describe("explainEngineError", () => {
  it("unwraps duckdb-wasm's JSON error envelope", () => {
    expect(
      explainEngineError('{"exception_type":"Binder Error","exception_message":"no such column"}')
    ).toBe("Binder Error: no such column");
  });

  it("does not repeat the type when the message already carries it", () => {
    expect(
      explainEngineError(
        '{"exception_type":"Binder Error","exception_message":"Binder Error: nope"}'
      )
    ).toBe("Binder Error: nope");
  });

  it("leaves plain-text engine errors untouched", () => {
    expect(explainEngineError("Catalog Error: Table with name x does not exist")).toBe(
      "Catalog Error: Table with name x does not exist"
    );
  });

  it("leaves a message containing an unparseable brace untouched", () => {
    expect(explainEngineError("Parser Error: syntax error at {")).toBe(
      "Parser Error: syntax error at {"
    );
  });

  it("tells the user how to read a VARIANT column", () => {
    const explained = explainEngineError(
      '{"exception_type":"Not implemented","exception_message":"Unsupported Arrow type VARIANT"}'
    );
    expect(explained).toContain("VARIANT");
    expect(explained).toContain("::VARCHAR");
  });
});

describe("stagedFileName", () => {
  it("never returns a name DuckDB would route to httpfs", () => {
    const url =
      "https://raw.githubusercontent.com/vega/vega-datasets/main/data/seattle-weather.csv";
    const name = stagedFileName(url);
    expect(name).toBe("seattle-weather.csv");
    expect(name).not.toContain("://");
  });

  it("drops query strings and fragments", () => {
    expect(stagedFileName("https://example.com/data.csv?token=abc#frag")).toBe("data.csv");
  });

  it("sanitises characters that aren't safe in a filename", () => {
    expect(stagedFileName("https://example.com/my%20file (1).csv")).toBe("my_20file__1_.csv");
  });

  it("falls back to a placeholder when the URL has no basename", () => {
    expect(stagedFileName("https://example.com/")).toBe("example.com");
    expect(stagedFileName("https://")).toBe("staged_data");
  });
});

describe("stageRemoteTextFile", () => {
  const fakeDb = () => {
    const registered: { name: string; text: string }[] = [];
    return {
      registered,
      dropFile: async () => {},
      registerFileText: async (name: string, text: string) => {
        registered.push({ name, text });
      },
    };
  };

  const withFetch = async (response: Response, run: () => Promise<void>) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => response) as typeof globalThis.fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  };

  it("never registers under a name DuckDB would send to httpfs", async () => {
    // This is the bug that made every remote CSV load as one merged column:
    // registering under the URL meant the staged bytes were never read.
    const db = fakeDb();
    await withFetch(new Response("a,b\n1,2\n"), async () => {
      const url = "https://example.com/data/report.csv";
      const name = await stageRemoteTextFile(db as never, url);
      expect(name).toBe("report.csv");
      expect(name).not.toBe(url);
      expect(db.registered).toHaveLength(1);
      expect(db.registered[0].name).toBe("report.csv");
      expect(db.registered[0].name).not.toContain("://");
    });
  });

  it("refuses to hold a file too large to fit in memory", async () => {
    const db = fakeDb();
    const huge = new Response("a,b\n", {
      headers: { "content-length": String(200 * 1024 * 1024) },
    });
    await withFetch(huge, async () => {
      expect(await stageRemoteTextFile(db as never, "https://example.com/huge.csv")).toBeNull();
      expect(db.registered).toHaveLength(0);
    });
  });

  it("surfaces a failed download instead of registering empty content", async () => {
    const db = fakeDb();
    await withFetch(new Response("nope", { status: 404 }), async () => {
      await expect(stageRemoteTextFile(db as never, "https://example.com/x.csv")).rejects.toThrow(
        /404/
      );
      expect(db.registered).toHaveLength(0);
    });
  });
});

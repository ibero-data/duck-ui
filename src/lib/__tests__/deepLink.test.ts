import { describe, it, expect } from "vitest";
import {
  inferFormat,
  deriveSourceName,
  parseDeepLink,
  buildSourceSQL,
  buildDeepLink,
  buildBadgeMarkdown,
  defaultDeepLinkQuery,
  isLikelyCorsError,
} from "../deepLink";

describe("inferFormat", () => {
  it("recognizes the supported formats", () => {
    expect(inferFormat("https://x.com/taxi.parquet")).toBe("parquet");
    expect(inferFormat("https://x.com/data.csv")).toBe("csv");
    expect(inferFormat("https://x.com/data.csv.gz")).toBe("csv");
    expect(inferFormat("https://x.com/rows.ndjson")).toBe("json");
    expect(inferFormat("https://x.com/db.duckdb")).toBe("duckdb");
    expect(inferFormat("https://x.com/db.db?sig=abc")).toBe("duckdb");
    expect(inferFormat("ducklake:https://x.com/catalog.ducklake")).toBe("ducklake");
    expect(inferFormat("https://x.com/unknown")).toBeNull();
  });
});

describe("deriveSourceName", () => {
  it("derives safe SQL names from URLs", () => {
    expect(deriveSourceName("https://x.com/nyc-taxi.parquet")).toBe("nyc_taxi");
    expect(deriveSourceName("https://x.com/path/My%20Data.csv")).toBe("my_20data");
    expect(deriveSourceName("https://x.com/2024_sales.csv")).toBe("t_2024_sales");
    expect(deriveSourceName("https://x.com/---.csv", 2)).toBe("data_3");
  });
});

describe("parseDeepLink", () => {
  const params = (query: string) => new URLSearchParams(query);

  it("returns null without load params", () => {
    expect(parseDeepLink(params("sql=SELECT+1"))).toBeNull();
    expect(parseDeepLink(params(""))).toBeNull();
  });

  it("parses sources, sql, and run flag", () => {
    const req = parseDeepLink(
      params("load=https://x.com/a.parquet&load=https://x.com/b.csv&sql=SELECT+1&run=0")
    );
    expect(req).not.toBeNull();
    expect(req!.sources.map((s) => s.format)).toEqual(["parquet", "csv"]);
    expect(req!.sql).toBe("SELECT 1");
    expect(req!.autoRun).toBe(false);
  });

  it("defaults autoRun to true", () => {
    const req = parseDeepLink(params("load=https://x.com/a.parquet"));
    expect(req!.autoRun).toBe(true);
  });

  it("drops non-http schemes — file:, data:, javascript:", () => {
    expect(parseDeepLink(params("load=file:///etc/passwd&format=csv"))).toBeNull();
    expect(parseDeepLink(params("load=data:text/csv,1&format=csv"))).toBeNull();
    expect(parseDeepLink(params("load=javascript:alert(1)&format=csv"))).toBeNull();
  });

  it("honors the format override for extension-less URLs", () => {
    const req = parseDeepLink(params("load=https://r2.dev/dataset&format=parquet"));
    expect(req!.sources[0].format).toBe("parquet");
  });

  it("drops sources whose format cannot be determined", () => {
    expect(parseDeepLink(params("load=https://x.com/thing"))).toBeNull();
  });

  it("de-duplicates derived names so sources can't shadow each other", () => {
    const req = parseDeepLink(
      params("load=https://a.com/data.parquet&load=https://b.com/data.parquet")
    );
    expect(req!.sources.map((s) => s.name)).toEqual(["data", "data_2"]);
  });
});

describe("buildSourceSQL", () => {
  it("creates read-only attaches for databases and catalogs", () => {
    expect(buildSourceSQL({ url: "https://x.com/f.duckdb", format: "duckdb", name: "f" })).toBe(
      `ATTACH 'https://x.com/f.duckdb' AS "f" (READ_ONLY)`
    );
    expect(
      buildSourceSQL({
        url: "ducklake:https://x.com/c.ducklake",
        format: "ducklake",
        name: "c",
      })
    ).toBe(`ATTACH 'ducklake:https://x.com/c.ducklake' AS "c" (READ_ONLY)`);
  });

  it("creates views over file readers and escapes quotes", () => {
    expect(buildSourceSQL({ url: "https://x.com/a'b.csv", format: "csv", name: "a_b" })).toBe(
      `CREATE OR REPLACE VIEW "a_b" AS SELECT * FROM read_csv('https://x.com/a''b.csv')`
    );
  });
});

describe("defaultDeepLinkQuery", () => {
  it("previews files and lists tables for databases", () => {
    expect(defaultDeepLinkQuery([{ url: "u", format: "parquet", name: "taxi" }])).toBe(
      `SELECT * FROM "taxi" LIMIT 100;`
    );
    expect(defaultDeepLinkQuery([{ url: "u", format: "duckdb", name: "db" }])).toBe(
      "SHOW ALL TABLES;"
    );
  });
});

describe("buildDeepLink + badge", () => {
  it("round-trips through parseDeepLink", () => {
    const link = buildDeepLink(
      "https://demo.duckui.com/",
      ["https://x.com/a.parquet"],
      "SELECT count(*) FROM a"
    );
    const parsed = parseDeepLink(new URL(link).searchParams);
    expect(parsed!.sources[0].url).toBe("https://x.com/a.parquet");
    expect(parsed!.sql).toBe("SELECT count(*) FROM a");
  });

  it("builds the badge markdown", () => {
    const md = buildBadgeMarkdown("https://demo.duckui.com/?load=x", "https://demo.duckui.com");
    expect(md).toBe(
      "[![Open in Duck-UI](https://demo.duckui.com/badge.svg)](https://demo.duckui.com/?load=x)"
    );
  });
});

describe("extractRemoteSources", () => {
  it("finds reader URLs and attach targets, deduplicated", async () => {
    const { extractRemoteSources } = await import("../deepLink");
    const sql = `
      SELECT * FROM read_parquet('https://x.com/a.parquet')
      JOIN read_csv('https://x.com/b.csv', header=true) USING (id);
      ATTACH 'ducklake:https://x.com/cat.ducklake' AS lake (READ_ONLY);
      ATTACH 'https://x.com/other.duckdb' AS other;
      SELECT * FROM read_csv('local.csv');
      SELECT * FROM read_parquet('https://x.com/a.parquet');
    `;
    expect(extractRemoteSources(sql)).toEqual([
      "https://x.com/a.parquet",
      "https://x.com/b.csv",
      "ducklake:https://x.com/cat.ducklake",
      "https://x.com/other.duckdb",
    ]);
  });
});

describe("isLikelyCorsError", () => {
  it("flags browser network/CORS failures", () => {
    expect(isLikelyCorsError("TypeError: Failed to fetch")).toBe(true);
    expect(isLikelyCorsError("No 'Access-Control-Allow-Origin' header")).toBe(true);
    expect(isLikelyCorsError("Binder Error: column x not found")).toBe(false);
  });
});

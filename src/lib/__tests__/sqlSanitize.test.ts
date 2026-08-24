import { describe, it, expect } from "vitest";
import { sqlEscapeString, sqlEscapeIdentifier, qualifyTable } from "../sqlSanitize";

describe("sqlEscapeString", () => {
  it("doubles single quotes", () => {
    expect(sqlEscapeString("it's")).toBe("it''s");
    expect(sqlEscapeString("plain")).toBe("plain");
  });
});

describe("sqlEscapeIdentifier", () => {
  it("quotes and doubles embedded quotes", () => {
    expect(sqlEscapeIdentifier("my table")).toBe('"my table"');
    expect(sqlEscapeIdentifier('we"ird')).toBe('"we""ird"');
  });
});

describe("qualifyTable (#3 multi-schema attach)", () => {
  it("emits three-part names for attached databases", () => {
    expect(qualifyTable("mydb", "analytics", "events")).toBe('"mydb"."analytics"."events"');
  });

  it("defaults the schema to main when a database is given", () => {
    expect(qualifyTable("mydb", undefined, "events")).toBe('"mydb"."main"."events"');
    expect(qualifyTable("mydb", "", "events")).toBe('"mydb"."main"."events"');
  });

  it("omits the catalog for in-memory pseudo-names", () => {
    expect(qualifyTable(":memory:", undefined, "events")).toBe('"events"');
    expect(qualifyTable(undefined, "main", "events")).toBe('"events"');
    expect(qualifyTable(undefined, "staging", "events")).toBe('"staging"."events"');
  });

  it("escapes every part", () => {
    expect(qualifyTable('d"b', 's"ch', 't"bl')).toBe('"d""b"."s""ch"."t""bl"');
  });
});

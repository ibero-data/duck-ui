import { describe, it, expect } from "vitest";
import {
  catalogToDatabaseInfo,
  kindToScope,
  scopeToKind,
  toConnectionDefinition,
  toCredentialMaterial,
} from "../legacy";
import type { ConnectionProvider } from "@/store/types";
import type { CatalogSnapshot, ConnectionKind } from "../types";

describe("scope ↔ kind mapping", () => {
  it("maps the three legacy scopes onto their drivers", () => {
    expect(scopeToKind("WASM")).toBe("wasm");
    expect(scopeToKind("OPFS")).toBe("opfs");
    expect(scopeToKind("External")).toBe("duck-http");
  });

  it("round-trips without drifting", () => {
    for (const scope of ["WASM", "OPFS", "External"]) {
      expect(kindToScope(scopeToKind(scope))).toBe(scope);
    }
  });

  it("falls back to the HTTP driver for an unrecognised persisted scope", () => {
    expect(scopeToKind("Something-New")).toBe("duck-http");
    expect(scopeToKind(undefined)).toBe("duck-http");
  });

  it("maps peer onto its own scope — session-granted, never persisted", () => {
    expect(kindToScope("peer")).toBe("Peer");
    expect(scopeToKind("Peer")).toBe("peer");
  });

  it("keeps unimplemented kinds under their own name — they have no legacy scope", () => {
    for (const kind of ["quack", "flight-web"] as ConnectionKind[]) {
      expect(kindToScope(kind)).toBe(kind);
    }
  });
});

describe("toConnectionDefinition", () => {
  it("builds a wasm definition", () => {
    const definition = toConnectionDefinition({
      environment: "APP",
      id: "WASM",
      name: "WASM",
      scope: "WASM",
    });
    expect(definition).toEqual({
      id: "WASM",
      name: "WASM",
      origin: "APP",
      config: { kind: "wasm" },
    });
  });

  it("carries the OPFS path through", () => {
    const definition = toConnectionDefinition({
      environment: "APP",
      id: "local",
      name: "Local",
      scope: "OPFS",
      path: "analytics.db",
    });
    expect(definition.config).toEqual({ kind: "opfs", path: "analytics.db" });
  });

  it("builds an HTTP definition without any secret in it", () => {
    const provider: ConnectionProvider = {
      environment: "APP",
      id: "prod",
      name: "Production",
      scope: "External",
      host: "duck.example.com",
      port: 9999,
      database: "analytics",
      user: "reader",
      password: "s3cret",
      apiKey: "key-abc",
      authMode: "password",
    };

    const definition = toConnectionDefinition(provider);
    expect(definition.config).toEqual({
      kind: "duck-http",
      host: "duck.example.com",
      port: 9999,
      database: "analytics",
      user: "reader",
      authMode: "password",
    });
    // The definition is what gets persisted and (later) described to peers.
    expect(JSON.stringify(definition)).not.toContain("s3cret");
    expect(JSON.stringify(definition)).not.toContain("key-abc");
  });

  it("infers the auth mode when a legacy record never stored one", () => {
    const withKey = toConnectionDefinition({
      environment: "APP",
      id: "a",
      name: "a",
      scope: "External",
      host: "h",
      apiKey: "k",
    });
    const withUser = toConnectionDefinition({
      environment: "APP",
      id: "b",
      name: "b",
      scope: "External",
      host: "h",
      user: "u",
    });
    const bare = toConnectionDefinition({
      environment: "APP",
      id: "c",
      name: "c",
      scope: "External",
      host: "h",
    });

    expect(withKey.config).toMatchObject({ authMode: "api_key" });
    expect(withUser.config).toMatchObject({ authMode: "password" });
    expect(bare.config).toMatchObject({ authMode: "none" });
  });

  it("preserves the origin so ENV-provisioned connections stay distinguishable", () => {
    const definition = toConnectionDefinition({
      environment: "ENV",
      id: "env",
      name: "env",
      scope: "External",
      host: "h",
    });
    expect(definition.origin).toBe("ENV");
  });
});

describe("toCredentialMaterial", () => {
  it("extracts exactly the secrets, and nothing else", () => {
    expect(
      toCredentialMaterial({
        environment: "APP",
        id: "a",
        name: "a",
        scope: "External",
        host: "h",
        user: "reader",
        password: "s3cret",
        apiKey: "key-abc",
      })
    ).toEqual({ password: "s3cret", apiKey: "key-abc" });
  });

  it("yields an empty material for a connection with no secrets", () => {
    expect(toCredentialMaterial({ environment: "APP", id: "w", name: "w", scope: "WASM" })).toEqual(
      { password: undefined, apiKey: undefined }
    );
  });
});

describe("catalogToDatabaseInfo", () => {
  const snapshot: CatalogSnapshot = {
    capturedAt: "2026-08-18T00:00:00.000Z",
    databases: [
      {
        name: "memory",
        tables: [
          {
            name: "sales",
            schema: "main",
            rowCount: 42,
            columns: [{ name: "id", type: "BIGINT", nullable: false }],
          },
        ],
      },
    ],
  };

  it("renders the shape the explorer consumes, stamping the capture time", () => {
    expect(catalogToDatabaseInfo(snapshot)).toEqual([
      {
        name: "memory",
        tables: [
          {
            name: "sales",
            schema: "main",
            rowCount: 42,
            columns: [{ name: "id", type: "BIGINT", nullable: false }],
            createdAt: "2026-08-18T00:00:00.000Z",
          },
        ],
      },
    ]);
  });

  it("handles an empty catalog", () => {
    expect(catalogToDatabaseInfo({ databases: [], capturedAt: "" })).toEqual([]);
  });
});

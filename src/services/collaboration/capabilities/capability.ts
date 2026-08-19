/**
 * Shared capabilities — what a host lets a guest do, described without ever
 * handing over the means to do it independently.
 *
 * The central idea: a guest is given a NAME and a SHAPE, never a connection.
 * It learns that "Production" exists and that it has a `sales` table with
 * these columns. It does not learn the host, the port, the user, or the
 * password, and it cannot reach that database except by asking the host's
 * browser to run a query on its behalf.
 *
 * That is why `SharedCapability` has no credential field, and why the type
 * that crosses the wire (`protocol/messages.ts`) has none either. There is no
 * code path that could serialize one, because there is nowhere to put it.
 */

import type { CatalogSnapshot } from "@/services/engine";

/**
 * Limits attached to a grant.
 *
 * Enforced by the HOST, on the host's side, every time. A guest is told the
 * policy so its UI can be honest about the limits, but nothing the guest sends
 * can widen them — a `maxRows` in a request is a request, not an instruction.
 */
export interface CapabilityPolicy {
  /** Always true in this release. Writable peer capabilities do not exist. */
  readonly: true;

  maxResultRows?: number;
  maxResultBytes?: number;

  /** When present, only these catalogs/schemas/tables may be referenced. */
  allowedCatalogs?: string[];
  allowedSchemas?: string[];
  allowedTables?: string[];

  allowDDL: boolean;
  allowAttach: boolean;
  allowCopy: boolean;

  /** ISO timestamp. A grant past its expiry is refused. */
  expiresAt?: string;

  /** Abandon a guest query that runs longer than this. */
  timeoutMs?: number;
}

/**
 * The conservative default. Everything a guest might use to reach outside the
 * share runtime is off, and it stays off unless a host deliberately turns it
 * on — which, in this release, the UI does not offer.
 */
export const DEFAULT_CAPABILITY_POLICY: CapabilityPolicy = {
  readonly: true,
  maxResultRows: 100_000,
  maxResultBytes: 64 * 1024 * 1024,
  allowDDL: false,
  allowAttach: false,
  allowCopy: false,
  timeoutMs: 60_000,
};

/** Where a capability's SQL actually runs. */
export type CapabilityExecutor = { kind: "peer"; peerId: string } | { kind: "local" };

export interface SharedCapability {
  id: string;
  ownerPeerId: string;
  name: string;
  type: "query";
  permission: "read";
  executor: CapabilityExecutor;
  /** Names and types only. Never rows. */
  catalog?: CatalogSnapshot;
  policy: CapabilityPolicy;
}

/** Whether a grant is still valid at a given moment. */
export const isCapabilityExpired = (
  capability: SharedCapability,
  now: number = Date.now()
): boolean => {
  const { expiresAt } = capability.policy;
  if (!expiresAt) return false;
  const deadline = Date.parse(expiresAt);
  // An unparseable expiry is treated as expired. Failing closed on a
  // malformed grant is the only safe reading.
  return Number.isNaN(deadline) || deadline <= now;
};

/**
 * The row cap actually applied to a request.
 *
 * The stricter of what the guest asked for and what it was granted. A guest
 * requesting more than its policy allows gets the policy.
 */
export const effectiveMaxRows = (
  policy: CapabilityPolicy,
  requested?: number
): number | undefined => {
  if (policy.maxResultRows === undefined) return requested;
  if (requested === undefined) return policy.maxResultRows;
  return Math.min(policy.maxResultRows, requested);
};

/** Strips a capability down to what is safe to send to a guest. */
export const toWireCapability = (capability: SharedCapability) => ({
  id: capability.id,
  ownerPeerId: capability.ownerPeerId,
  name: capability.name,
  type: capability.type,
  permission: capability.permission,
  catalog: capability.catalog,
  policy: {
    readonly: true as const,
    maxResultRows: capability.policy.maxResultRows,
    maxResultBytes: capability.policy.maxResultBytes,
    expiresAt: capability.policy.expiresAt,
  },
});

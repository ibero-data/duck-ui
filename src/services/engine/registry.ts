/**
 * Driver registry and live-session book-keeping.
 *
 * One session per connection definition, keyed by connection id. Opening is
 * de-duplicated so two callers racing to select the same connection get the
 * same engine rather than two — which for OPFS would deadlock on the file
 * lock, and for WASM would silently double the memory footprint.
 *
 * Sessions are runtime resources, not application state: they live here, not
 * in the Zustand store. The store keeps a reference for convenience, but this
 * module owns their lifecycle.
 */

import { httpDuckDriver } from "./drivers/httpDuckDriver";
import { opfsDriver } from "./drivers/opfsDriver";
import { peerDriver } from "./drivers/peerDriver";
import { wasmDriver } from "./drivers/wasmDriver";
import type {
  ConnectionDefinition,
  ConnectionKind,
  CredentialMaterial,
  DataDriver,
  DataSession,
} from "./types";

const drivers = new Map<ConnectionKind, DataDriver>();

export const registerDriver = (driver: DataDriver): void => {
  drivers.set(driver.kind, driver);
};

// `quack` and `flight-web` remain reservations with no implementation.
registerDriver(wasmDriver as DataDriver);
registerDriver(opfsDriver as DataDriver);
registerDriver(httpDuckDriver as DataDriver);
registerDriver(peerDriver as DataDriver);

/** Human-readable names for the kinds no driver implements yet. */
const NOT_IMPLEMENTED: Partial<Record<ConnectionKind, string>> = {
  quack: "DuckDB 2.0 (Quack) connections are not available in this build.",
  "flight-web": "Flight SQL connections are not available in this build.",
};

export const getDriver = <K extends ConnectionKind>(kind: K): DataDriver<K> => {
  const driver = drivers.get(kind);
  if (!driver) {
    throw new Error(NOT_IMPLEMENTED[kind] ?? `No driver registered for connection kind "${kind}".`);
  }
  return driver as unknown as DataDriver<K>;
};

export const hasDriver = (kind: ConnectionKind): boolean => drivers.has(kind);

/** Whether this browser can actually host a given kind right now. */
export const isKindAvailable = async (kind: ConnectionKind): Promise<boolean> => {
  const driver = drivers.get(kind);
  if (!driver) return false;
  try {
    return await driver.isAvailable();
  } catch {
    return false;
  }
};

//
// Session lifecycle
//

const sessions = new Map<string, DataSession>();
const opening = new Map<string, Promise<DataSession>>();

/** The live session for a connection, if one is open. */
export const getSession = (connectionId: string): DataSession | null => {
  const session = sessions.get(connectionId);
  if (session && !session.isOpen) {
    sessions.delete(connectionId);
    return null;
  }
  return session ?? null;
};

/**
 * Returns the live session for a connection, opening it if needed.
 * Concurrent calls for the same connection share one open.
 */
export const openSession = async <K extends ConnectionKind>(
  definition: ConnectionDefinition<K>,
  credentials?: CredentialMaterial
): Promise<DataSession> => {
  const existing = getSession(definition.id);
  if (existing) return existing;

  const inFlight = opening.get(definition.id);
  if (inFlight) return inFlight;

  const driver = getDriver(definition.config.kind as K);
  const promise = driver
    .connect(definition, credentials)
    .then((session) => {
      sessions.set(definition.id, session);
      return session;
    })
    .finally(() => {
      opening.delete(definition.id);
    });

  opening.set(definition.id, promise);
  return promise;
};

/** Closes and forgets a session. Safe to call when none is open. */
export const closeSession = async (connectionId: string): Promise<void> => {
  const pending = opening.get(connectionId);
  if (pending) {
    // Let the in-flight open settle first, otherwise it re-registers the
    // session we just tried to close.
    await pending.catch(() => undefined);
  }
  const session = sessions.get(connectionId);
  sessions.delete(connectionId);
  if (session) {
    await session.close().catch((error) => {
      console.warn(`[engine] failed to close session for "${connectionId}":`, error);
    });
  }
};

export const closeAllSessions = async (): Promise<void> => {
  await Promise.all([...sessions.keys()].map(closeSession));
};

/** Every open session, for diagnostics and the session panel. */
export const listSessions = (): DataSession[] => [...sessions.values()];

/** Probes a connection without leaving a session behind. */
export const testConnection = async <K extends ConnectionKind>(
  definition: ConnectionDefinition<K>,
  credentials?: CredentialMaterial
): Promise<void> => {
  const driver = getDriver(definition.config.kind as K);
  await driver.test(definition, credentials);
};

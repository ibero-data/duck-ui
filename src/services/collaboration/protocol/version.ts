/**
 * Duck Peer Protocol versioning.
 *
 * Two browsers in a session are two independent deployments of Duck-UI. One
 * may be a tab open since last week, the other a fresh load after a deploy.
 * Assuming both run the same build is the single easiest way to ship a
 * protocol that breaks in the field, so version is negotiated on connect and
 * every frame carries it.
 */

/** Wire protocol name, for logs and diagnostics. */
export const PROTOCOL_NAME = "duck-peer";

/** Version this build speaks. */
export const PROTOCOL_VERSION = 1;

/**
 * Versions this build can still talk. Older entries stay here as long as the
 * code genuinely handles them — listing a version it cannot actually speak is
 * worse than refusing the connection.
 */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [1];

/**
 * Picks the highest version both peers support, or null when they share none.
 *
 * A null result is a clean, explainable refusal ("this session needs a newer
 * Duck-UI"), which is the only honest outcome — proceeding on a guessed
 * version produces corrupt frames rather than an error message.
 */
export const negotiateVersion = (theirVersions: readonly number[]): number | null => {
  const shared = SUPPORTED_PROTOCOL_VERSIONS.filter((version) => theirVersions.includes(version));
  return shared.length > 0 ? Math.max(...shared) : null;
};

/** Human-readable identifier, e.g. `duck-peer/1`. */
export const protocolId = (version: number = PROTOCOL_VERSION): string =>
  `${PROTOCOL_NAME}/${version}`;

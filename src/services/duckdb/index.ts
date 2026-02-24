// DuckDB Service Layer
// Extracted from the monolithic store for testability and modularity.

export { rawResultToJSON, resultToJSON } from "./resultParser";
export { initializeWasmConnection, loadEmbeddedDatabases, resolveDuckdbBundles } from "./wasmConnection";
export { cleanupOPFSConnection, testOPFSConnection, opfsActivePaths } from "./opfsConnection";
export {
  executeExternalQuery,
  testExternalConnection,
  fetchExternalDatabases,
} from "./externalConnection";
export { fetchWasmDatabases } from "./schemaFetcher";
export { retryWithBackoff, validateConnection, updateHistory } from "./utils";

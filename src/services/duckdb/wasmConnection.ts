import * as duckdb from "@duckdb/duckdb-wasm";
import { sqlEscapeString, sqlEscapeIdentifier } from "@/lib/sqlSanitize";
import { validateConnection } from "./utils";

const getRuntimeEnv = (): Partial<NonNullable<Window["env"]>> =>
  (window.env ?? {}) as Partial<NonNullable<Window["env"]>>;

const getCdnBundles = (runtimeEnv: Partial<NonNullable<Window["env"]>>): duckdb.DuckDBBundles => {
  const configuredBaseUrl = runtimeEnv.DUCK_UI_DUCKDB_WASM_BASE_URL ?? "";
  if (!configuredBaseUrl) {
    return duckdb.getJsDelivrBundles();
  }

  const baseUrl = configuredBaseUrl.replace(/\/+$/, "");

  return {
    mvp: {
      mainModule: `${baseUrl}/duckdb-mvp.wasm`,
      mainWorker: `${baseUrl}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${baseUrl}/duckdb-eh.wasm`,
      mainWorker: `${baseUrl}/duckdb-browser-eh.worker.js`,
    },
  };
};

export const resolveDuckdbBundles: () => Promise<duckdb.DuckDBBundles> =
  __DUCK_UI_BUILD_DUCKDB_CDN_ONLY__
    ? async () => getCdnBundles(getRuntimeEnv())
    : (() => {
        let localBundlesPromise: Promise<duckdb.DuckDBBundles> | null = null;

        const getLocalBundles = async (): Promise<duckdb.DuckDBBundles> => {
          if (!localBundlesPromise) {
            localBundlesPromise = Promise.all([
              import("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url"),
              import("@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url"),
              import("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url"),
              import("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url"),
            ])
              .then(([duckdbWasm, mvpWorker, duckdbWasmEh, ehWorker]) => ({
                mvp: {
                  mainModule: duckdbWasm.default,
                  mainWorker: mvpWorker.default,
                },
                eh: {
                  mainModule: duckdbWasmEh.default,
                  mainWorker: ehWorker.default,
                },
              }))
              .catch((error) => {
                // Allow retry after transient chunk/load failures.
                localBundlesPromise = null;
                throw error;
              });
          }

          return localBundlesPromise;
        };

        return async () => {
          const runtimeEnv = getRuntimeEnv();
          if (runtimeEnv.DUCK_UI_DUCKDB_WASM_USE_CDN === true) {
            return getCdnBundles(runtimeEnv);
          }
          return getLocalBundles();
        };
      })();

export const createDuckdbWorker = (
  mainWorkerUrl: string
): { worker: Worker; revoke: () => void } => {
  if (/^https?:\/\//i.test(mainWorkerUrl)) {
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts(${JSON.stringify(mainWorkerUrl)});`], { type: "text/javascript" })
    );
    return {
      worker: new Worker(workerUrl),
      revoke: () => URL.revokeObjectURL(workerUrl),
    };
  }

  return {
    worker: new Worker(mainWorkerUrl),
    revoke: () => {},
  };
};

/**
 * Initializes a new DuckDB WASM connection.
 */
export const initializeWasmConnection = async (): Promise<{
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}> => {
  const bundles = await resolveDuckdbBundles();
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) {
    throw new Error("DuckDB WASM bundle is missing the main worker URL");
  }
  const { worker, revoke } = createDuckdbWorker(bundle.mainWorker);
  const logger = new duckdb.VoidLogger();

  // Check if unsigned extensions are allowed from environment
  const allowUnsignedExtensions = window.env?.DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS || false;

  // Create database with configuration
  const db = new duckdb.AsyncDuckDB(logger, worker);

  try {
    await db.instantiate(bundle.mainModule);
  } finally {
    revoke();
  }

  try {
    const dbConfig: duckdb.DuckDBConfig = {
      allowUnsignedExtensions: allowUnsignedExtensions,
    };

    await db.open(dbConfig);

    const connection = await db.connect();
    // Validate immediately
    validateConnection(connection);

    // Install and load extensions (non-blocking for offline support)
    try {
      await connection.query(`INSTALL excel`);
      await connection.query(`LOAD excel`);
    } catch (error) {
      console.warn("[DuckDB] Failed to install/load excel extension:", error);
    }

    // Load embedded databases from public/databases/
    await loadEmbeddedDatabases(db, connection);

    return { db, connection };
  } catch (error) {
    await db.terminate();
    throw error;
  }
};

/**
 * Loads embedded databases from the public/databases directory.
 */
export const loadEmbeddedDatabases = async (
  db: duckdb.AsyncDuckDB,
  connection: duckdb.AsyncDuckDBConnection
): Promise<void> => {
  try {
    // Fetch the manifest file
    const manifestResponse = await fetch("/databases/manifest.json");
    if (!manifestResponse.ok) {
      console.info("No embedded databases manifest found");
      return;
    }

    const manifest = await manifestResponse.json();
    const databases = manifest.databases || [];

    if (databases.length === 0) {
      console.info("No embedded databases configured");
      return;
    }

    console.info(`Loading ${databases.length} embedded database(s)...`);

    // Load each database
    for (const dbConfig of databases) {
      if (!dbConfig.autoLoad) {
        console.info(`Skipping ${dbConfig.name} (autoLoad: false)`);
        continue;
      }

      try {
        console.info(`Loading embedded database: ${dbConfig.name}`);

        // Fetch the database file
        const dbFileResponse = await fetch(`/databases/${dbConfig.file}`);
        if (!dbFileResponse.ok) {
          console.error(`Failed to fetch ${dbConfig.file}: ${dbFileResponse.statusText}`);
          continue;
        }

        const arrayBuffer = await dbFileResponse.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // Register the file in DuckDB's virtual file system
        const fileName = dbConfig.file;
        await db.registerFileBuffer(fileName, buffer);

        // Attach the database (derive alias from filename without extension)
        const dbAlias = fileName.replace(/\.db$/i, "").replace(/[^a-zA-Z0-9_]/g, "_");
        await connection.query(
          `ATTACH DATABASE '${sqlEscapeString(fileName)}' AS ${sqlEscapeIdentifier(dbAlias)}`
        );

        console.info(`Successfully loaded embedded database: ${dbConfig.name} as ${dbAlias}`);
      } catch (error) {
        console.error(`Error loading embedded database ${dbConfig.name}:`, error);
      }
    }
  } catch (error) {
    console.error("Error loading embedded databases:", error);
  }
};

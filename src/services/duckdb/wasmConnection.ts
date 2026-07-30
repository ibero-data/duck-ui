import * as duckdb from "@duckdb/duckdb-wasm";
import { sqlEscapeString, sqlEscapeIdentifier } from "@/lib/sqlSanitize";
import { loadAppConfig, getEmbeddedDatabases, type EmbeddedDatabase } from "@/lib/appConfig";
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
 * A `file` value that DuckDB can ATTACH directly — a DuckLake catalog or any
 * remote/scheme-qualified source — rather than a file bundled in
 * public/databases/. Matches `ducklake:…`, `s3://…`, `https://…`, `md:…`, etc.
 */
const isConnectionString = (file: string): boolean =>
  /:\/\//.test(file) || /^(ducklake|s3|gcs|azure|az|r2|md|motherduck|https?):/i.test(file);

/** Derives a safe, non-empty attach alias from an explicit alias, name, or file. */
const deriveAlias = (dbConfig: EmbeddedDatabase): string => {
  const source = dbConfig.alias?.trim() || dbConfig.name?.trim() || dbConfig.file;
  const cleaned = source
    .replace(/^[a-z][a-z0-9+.-]*:/i, "") // strip a leading scheme (ducklake:, s3:)
    .replace(/\.db$/i, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "embedded_db";
};

/** Builds the `(READ_ONLY, DATA_PATH '…')` options clause for an ATTACH. */
const buildAttachOptions = (dbConfig: EmbeddedDatabase, readOnlyDefault: boolean): string => {
  const options: string[] = [];
  if (dbConfig.readOnly ?? readOnlyDefault) {
    options.push("READ_ONLY");
  }
  if (dbConfig.dataPath) {
    options.push(`DATA_PATH '${sqlEscapeString(dbConfig.dataPath)}'`);
  }
  return options.length > 0 ? ` (${options.join(", ")})` : "";
};

/**
 * Attaches the databases declared in the manifest (public/databases/manifest.json).
 *
 * Two kinds of entries are supported:
 * - Connection strings (DuckLake catalogs, remote `.db`, s3://, https://…) are
 *   attached in place, read-only by default. Nothing is downloaded into the
 *   WASM engine — DuckDB reads the source directly.
 * - Bundled files (e.g. `sales.db` sitting in public/databases/) are fetched,
 *   registered in DuckDB's virtual FS, then attached.
 */
export const loadEmbeddedDatabases = async (
  db: duckdb.AsyncDuckDB,
  connection: duckdb.AsyncDuckDBConnection
): Promise<void> => {
  try {
    await loadAppConfig();
    const databases = getEmbeddedDatabases();

    if (databases.length === 0) {
      console.debug("No embedded databases configured");
      return;
    }

    console.info(`Loading ${databases.length} embedded database(s)...`);

    const base = import.meta.env.BASE_URL ?? "/";

    for (const dbConfig of databases) {
      if (dbConfig.autoLoad === false) {
        console.info(`Skipping ${dbConfig.name} (autoLoad: false)`);
        continue;
      }

      try {
        const alias = deriveAlias(dbConfig);

        if (isConnectionString(dbConfig.file)) {
          // Attach the remote source directly. Remote sources default to read-only.
          console.info(`Attaching embedded database: ${dbConfig.name} (${dbConfig.file})`);
          const options = buildAttachOptions(dbConfig, true);
          await connection.query(
            `ATTACH '${sqlEscapeString(dbConfig.file)}' AS ${sqlEscapeIdentifier(alias)}${options}`
          );
        } else {
          // Bundled file: fetch, register in the virtual FS, then attach.
          console.info(`Loading embedded database: ${dbConfig.name}`);
          const dbFileResponse = await fetch(`${base}databases/${dbConfig.file}`);
          if (!dbFileResponse.ok) {
            console.error(`Failed to fetch ${dbConfig.file}: ${dbFileResponse.statusText}`);
            continue;
          }

          const buffer = new Uint8Array(await dbFileResponse.arrayBuffer());
          await db.registerFileBuffer(dbConfig.file, buffer);
          const options = buildAttachOptions(dbConfig, false);
          await connection.query(
            `ATTACH '${sqlEscapeString(dbConfig.file)}' AS ${sqlEscapeIdentifier(alias)}${options}`
          );
        }

        console.info(`Successfully loaded embedded database: ${dbConfig.name} as ${alias}`);
      } catch (error) {
        console.error(`Error loading embedded database ${dbConfig.name}:`, error);
      }
    }
  } catch (error) {
    console.error("Error loading embedded databases:", error);
  }
};

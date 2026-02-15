import * as duckdb from "@duckdb/duckdb-wasm";
import { validateConnection } from "./utils";

// Import WASM bundles
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

export const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

/**
 * Initializes a new DuckDB WASM connection.
 */
export const initializeWasmConnection = async (): Promise<{
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}> => {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();

  // Check if unsigned extensions are allowed from environment
  const allowUnsignedExtensions = window.env?.DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS || false;

  // Create database with configuration
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule);

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
        await connection.query(`ATTACH DATABASE '${fileName}' AS ${dbAlias}`);

        console.info(`Successfully loaded embedded database: ${dbConfig.name} as ${dbAlias}`);
      } catch (error) {
        console.error(`Error loading embedded database ${dbConfig.name}:`, error);
      }
    }
  } catch (error) {
    console.error("Error loading embedded databases:", error);
  }
};

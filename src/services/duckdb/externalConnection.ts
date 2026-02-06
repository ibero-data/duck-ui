import { rawResultToJSON } from "./resultParser";
import type {
  CurrentConnection,
  ConnectionProvider,
  QueryResult,
  ColumnInfo,
  TableInfo,
  DatabaseInfo,
} from "@/store/types";

/**
 * Executes a query against an external connection.
 */
export const executeExternalQuery = async (
  query: string,
  connection: CurrentConnection
): Promise<QueryResult> => {
  if (!connection.host) {
    throw new Error("Host must be defined for external connections.");
  }

  // Construct URL properly - handle schemes and ports
  let url = connection.host;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  if (connection.port && !connection.host.includes(":")) {
    url = `${url}:${connection.port}`;
  }
  if (!url.endsWith("/")) {
    url = `${url}/`;
  }

  // Build headers based on auth mode
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    format: "JSONCompact",
  };

  if (connection.authMode === "api_key" && connection.apiKey) {
    headers["X-API-Key"] = connection.apiKey;
  } else if (connection.authMode === "password" && connection.user && connection.password) {
    const authHeader = btoa(`${connection.user}:${connection.password}`);
    headers["Authorization"] = `Basic ${authHeader}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error("Authentication failed - check your credentials");
      } else if (response.status === 404) {
        throw new Error(`Cannot reach server at ${url}`);
      }
      throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
    }

    const rawResult = await response.text();
    return rawResultToJSON(rawResult);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        `Network error: Cannot reach ${url}. Check your connection and CORS settings.`
      );
    }
    throw error;
  }
};

/**
 * Tests an external connection by executing a basic query.
 */
export const testExternalConnection = async (connection: ConnectionProvider): Promise<void> => {
  if (!connection.host) {
    throw new Error("Host must be defined for external connections.");
  }

  // Construct URL properly
  let url = connection.host;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  if (connection.port && !connection.host.includes(":")) {
    url = `${url}:${connection.port}`;
  }
  if (!url.endsWith("/")) {
    url = `${url}/`;
  }

  // Build headers based on auth mode
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (connection.authMode === "api_key" && connection.apiKey) {
    headers["X-API-Key"] = connection.apiKey;
  } else if (connection.authMode === "password" && connection.user && connection.password) {
    const authHeader = btoa(`${connection.user}:${connection.password}`);
    headers["Authorization"] = `Basic ${authHeader}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: `SELECT 1`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error("Authentication failed - check your credentials");
      } else if (response.status === 404) {
        throw new Error(`Cannot reach server at ${url}`);
      }
      throw new Error(`Connection test failed! Status: ${response.status}, Message: ${errorText}`);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        `Network error: Cannot reach ${url}. Check your connection and CORS settings.`
      );
    }
    throw error;
  }
};

/**
 * Fetches databases and tables for an external connection.
 */
export const fetchExternalDatabases = async (
  connection: CurrentConnection
): Promise<DatabaseInfo[]> => {
  try {
    // Try to get database list
    const dbListResult = await executeExternalQuery("SHOW DATABASES", connection);
    const databases: DatabaseInfo[] = [];

    // If database list is available, fetch tables for each
    if (dbListResult.data && dbListResult.data.length > 0) {
      for (const dbRow of dbListResult.data) {
        const dbName = dbRow[dbListResult.columns[0] as string] as string;
        try {
          const tablesResult = await executeExternalQuery(
            `SELECT table_name FROM information_schema.tables WHERE table_catalog = '${dbName}'`,
            connection
          );

          const tables: TableInfo[] = [];
          for (const tableRow of tablesResult.data) {
            const tableName = tableRow.table_name as string;
            try {
              // Try to get columns info
              const columnsResult = await executeExternalQuery(
                `DESCRIBE ${dbName}.${tableName}`,
                connection
              );

              const columns: ColumnInfo[] = columnsResult.data.map((col: any) => ({
                name: col.column_name as string,
                type: col.column_type as string,
                nullable: col.null === "YES",
              }));

              tables.push({
                name: tableName,
                schema: dbName,
                columns,
                rowCount: 0, // External connections don't provide row count easily
                createdAt: new Date().toISOString(),
              });
            } catch {
              // If describe fails, add table with basic info
              tables.push({
                name: tableName,
                schema: dbName,
                columns: [],
                rowCount: 0,
                createdAt: new Date().toISOString(),
              });
            }
          }

          if (tables.length > 0 || dbListResult.data.length === 1) {
            databases.push({ name: dbName, tables });
          }
        } catch (e) {
          console.warn(`Failed to fetch tables for database ${dbName}:`, e);
          databases.push({ name: dbName, tables: [] });
        }
      }
    }

    return databases;
  } catch (error) {
    // If fetching databases fails, return empty array
    console.warn("Failed to fetch external databases:", error);
    return [];
  }
};

import type { QueryResult, ExternalQueryResponse } from "@/store/types";

/**
 * Converts a raw result (from an external HTTP endpoint) into a QueryResult.
 * Handles JSONCompact format, NDJSON, and plain JSON array-of-objects responses.
 * See: https://github.com/caioricciuti/duck-ui/issues/24
 */
export const rawResultToJSON = (rawResult: string): QueryResult => {
  const trimmed = rawResult.trim();
  if (!trimmed) {
    return { columns: [], columnTypes: [], data: [], rowCount: 0 };
  }

  try {
    // Try parsing as single JSON first (standard format)
    let parsed: Partial<ExternalQueryResponse> | undefined;

    try {
      const json = JSON.parse(trimmed);

      // Handle array-of-objects format (default httpserver response without JSONCompact)
      // e.g. [{"col1": "val1", "col2": "val2"}, ...]
      if (Array.isArray(json) && json.length > 0 && !("meta" in json[0])) {
        const columns = Object.keys(json[0]);
        const data = json.map((row: Record<string, unknown>) => ({ ...row }));
        return {
          columns,
          columnTypes: columns.map(() => "VARCHAR"),
          data,
          rowCount: data.length,
        };
      }

      parsed = json;
    } catch {
      // If single JSON fails, try NDJSON (newline-delimited JSON)
      // DuckDB httpserver may return multiple JSON objects, one per line
      const lines = trimmed.split("\n").filter((line) => line.trim());

      if (lines.length === 0) {
        return { columns: [], columnTypes: [], data: [], rowCount: 0 };
      }

      // Parse each line as JSON
      const objects = lines.map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(
            `Failed to parse NDJSON line ${idx + 1}/${lines.length}: "${line.substring(0, 80)}${line.length > 80 ? "..." : ""}"`
          );
        }
      });

      // If all lines are plain objects (array-of-objects NDJSON), treat as rows
      if (
        objects.length > 0 &&
        objects.every(
          (obj) => obj && typeof obj === "object" && !("meta" in obj) && !("data" in obj)
        )
      ) {
        const columns = Object.keys(objects[0]);
        return {
          columns,
          columnTypes: columns.map(() => "VARCHAR"),
          data: objects,
          rowCount: objects.length,
        };
      }

      // Find the result object (has meta and data)
      const resultObj = objects.find(
        (obj): obj is ExternalQueryResponse =>
          obj && typeof obj === "object" && "meta" in obj && "data" in obj
      );

      if (resultObj) {
        parsed = resultObj;
      } else {
        // If no single result object, try to merge (meta from one, data from others)
        const metaObj = objects.find((obj) => obj?.meta);
        const dataObj = objects.find((obj) => obj?.data);

        if (metaObj && dataObj) {
          parsed = {
            meta: metaObj.meta,
            data: dataObj.data,
            rows: dataObj.rows || dataObj.data?.length || 0,
          };
        } else {
          const preview = trimmed.substring(0, 200);
          throw new Error(
            `Unrecognized response format. Expected JSONCompact (with "meta" and "data" fields) ` +
              `or array of objects. Response preview: ${preview}${trimmed.length > 200 ? "..." : ""}`
          );
        }
      }
    }

    // Validate required fields
    if (!parsed || typeof parsed !== "object") {
      throw new Error(
        `Invalid response: expected a JSON object but got ${typeof parsed}. ` +
          `Response preview: ${trimmed.substring(0, 200)}${trimmed.length > 200 ? "..." : ""}`
      );
    }

    if (
      !parsed.meta ||
      !parsed.data ||
      !Array.isArray(parsed.meta) ||
      !Array.isArray(parsed.data)
    ) {
      const hasKeys = parsed ? Object.keys(parsed).join(", ") : "none";
      throw new Error(
        `Invalid response format: expected "meta" (array) and "data" (array) fields. ` +
          `Found keys: [${hasKeys}]. Ensure the DuckDB httpserver is returning JSONCompact format.`
      );
    }

    // Convert to QueryResult format
    const columns = parsed.meta.map((m) => m.name);
    const columnTypes = parsed.meta.map((m) => m.type);
    const data = parsed.data.map((row: unknown, rowIdx: number) => {
      if (!Array.isArray(row)) {
        // If rows are objects instead of arrays, use them directly
        if (row && typeof row === "object") {
          return row as Record<string, unknown>;
        }
        throw new Error(`Invalid row format at index ${rowIdx}: expected array or object`);
      }
      const rowObject: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        rowObject[col] = row[index];
      });
      return rowObject;
    });

    return {
      columns,
      columnTypes,
      data,
      rowCount: parsed.rows || data.length,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse query result: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

/**
 * Converts a WASM query result into a QueryResult.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resultToJSON = (result: any): QueryResult => {
  try {
    const schema = result.schema;
    const fields = schema.fields;

    // Pre-extract column vectors for Decimal types
    const columnVectors = fields.map((_: unknown, colIdx: number) => result.getChildAt(colIdx));

    // Use the standard toArray().map() approach, but fix Decimal values from column vectors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.toArray().map((row: any, rowIndex: number) => {
      const jsonRow = row.toJSON();

      // Fix Decimal types by reading directly from column vectors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fields.forEach((field: any, columnIndex: number) => {
        const col = field.name;
        const type = field.type.toString();

        // Only fix Decimal types - they come as null from toJSON()
        if (type.includes("Decimal")) {
          try {
            // Get the value directly from the column vector
            const value = columnVectors[columnIndex].get(rowIndex);

            if (value !== null && value !== undefined) {
              // Convert Decimal object to number
              // Arrow Decimals store unscaled values - we need to apply the scale
              if (typeof value === "object" && typeof value.valueOf === "function") {
                const unscaledValue = Number(value.valueOf());
                const scale = field.type.scale || 0; // Get scale from Arrow type metadata
                const scaledValue = unscaledValue / Math.pow(10, scale);
                jsonRow[col] = scaledValue;
              } else if (typeof value === "number") {
                jsonRow[col] = value;
              } else if (typeof value === "string") {
                const parsed = parseFloat(value);
                jsonRow[col] = isNaN(parsed) ? null : parsed;
              } else {
                jsonRow[col] = null;
              }
            }
          } catch (error) {
            console.error(`Error processing Decimal column ${col} at row ${rowIndex}:`, error);
          }
        }
        // Fix Date types
        else if (type === "Date32<DAY>") {
          const value = jsonRow[col];
          if (value !== null && value !== undefined) {
            jsonRow[col] = new Date(value).toLocaleDateString();
          }
        }
        // Fix Timestamp types
        else if (type === "Date64<MILLISECOND>" || type === "Timestamp<MICROSECOND>") {
          const value = jsonRow[col];
          if (value !== null && value !== undefined) {
            jsonRow[col] = new Date(value);
          }
        }
      });

      return jsonRow;
    });

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columns: fields.map((field: any) => field.name),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columnTypes: fields.map((field: any) => field.type.toString()),
      data,
      rowCount: result.numRows,
    };
  } catch (error) {
    console.error("Error converting query result to JSON:", error);
    return {
      columns: [],
      columnTypes: [],
      data: [],
      rowCount: 0,
      error: `Failed to process query results: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
};

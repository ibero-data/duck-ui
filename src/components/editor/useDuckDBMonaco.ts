import { useDuckStore } from "@/store";
import { useEffect, useCallback, useRef } from "react";
import * as monaco from "monaco-editor";
import { toast } from "sonner";

// Column type mapping for suggestions
const SQL_TYPE_MAPPINGS: Record<string, string[]> = {
  VARCHAR: [
    "LIKE",
    "ILIKE",
    "SUBSTR",
    "UPPER",
    "LOWER",
    "TRIM",
    "LENGTH",
    "REGEXP_MATCHES",
    "REGEXP_REPLACE",
  ],
  BIGINT: ["SUM", "AVG", "MIN", "MAX", "COUNT", "BETWEEN", "ABS", "ROUND"],
  INTEGER: ["SUM", "AVG", "MIN", "MAX", "COUNT", "BETWEEN", "ABS", "ROUND"],
  DOUBLE: ["ROUND", "CEIL", "FLOOR", "ABS", "POWER", "SQRT"],
  DATE: ["EXTRACT", "DATE_TRUNC", "DATE_PART", "AGE"],
  TIMESTAMP: ["EXTRACT", "DATE_TRUNC", "DATE_PART", "AGE", "NOW"],
  BOOLEAN: ["AND", "OR", "NOT", "IS TRUE", "IS FALSE", "IS NULL"],
  JSON: ["JSON_EXTRACT_PATH", "JSON_TYPEOF", "JSON_ARRAY_LENGTH"],
  ARRAY: ["ARRAY_LENGTH", "UNNEST", "ARRAY_AGG"],
};

interface DuckDBFunctionInfo {
  function_name: string;
  description: string | null;
  parameter_types: string | null;
  return_type: string | null;
  example: string | null;
}

const useDuckDBMonaco = () => {
  const { executeQuery, databases } = useDuckStore();
  const monacoInitialized = useRef(false);
  const keywordsRef = useRef<string[]>([]);
  const functionsRef = useRef<DuckDBFunctionInfo[]>([]);

  const fetchAndConfigureMonaco = useCallback(async () => {
    if (monacoInitialized.current) {
      return;
    }

    try {
      const keywordsResult: any = await executeQuery(
        "SELECT DISTINCT(keyword_name) FROM duckdb_keywords()"
      );

      const functionsResult: any = await executeQuery(
        "SELECT DISTINCT ON (function_name) * FROM DUCKDB_FUNCTIONS();"
      );

      const keywords: string[] =
        keywordsResult?.data?.map((k: any) => k.keyword_name.toUpperCase()) ??
        [];
      keywordsRef.current = keywords;

      const functions: DuckDBFunctionInfo[] =
        functionsResult?.data?.map((f: any) => ({
          function_name: f.function_name.toUpperCase(),
          description: f.description,
          parameter_types: f.parameter_types,
          return_type: f.return_type,
          example: f.example,
        })) ?? [];
      functionsRef.current = functions;

      monaco.languages.register({ id: "sql" });

      // Update Monarch Tokens Provider
      monaco.languages.setMonarchTokensProvider("sql", {
        tokenizer: {
          root: [
            [
              /[a-zA-Z_]\w*/,
              {
                cases: {
                  "@SQL_KEYWORDS": "keyword",
                  "@SQL_FUNCTIONS": "predefined",
                  "@default": "identifier",
                },
              },
            ],
            [/--.*$/, "comment"],
            [/\/\*/, "comment", "@comment"],
            [/"[^"]*"/, "string"],
            [/'[^']*'/, "string"],
            [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
            [/\d+/, "number"],
            [/[;,.]/, "delimiter"],
            [/[(){}[\]]/, "@brackets"],
            [/[<>=!]+/, "operator"],
          ],
          comment: [
            [/[^/*]+/, "comment"],
            [/\*\//, "comment", "@pop"],
            [/[/*]/, "comment"],
          ],
        },
        SQL_KEYWORDS: keywords,
        SQL_FUNCTIONS: functions.map((f) => f.function_name),
      });

      // Register Completion Provider
      monaco.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", "(", ","],
        provideCompletionItems: (model, position) => {
          const wordUntilPosition = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: wordUntilPosition.startColumn,
            endColumn: wordUntilPosition.endColumn,
          };

          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const suggestions: monaco.languages.CompletionItem[] = [];

          // Add table suggestions
          databases.forEach((db) => {
            db.tables.forEach((table) => {
              suggestions.push({
                label: table.name,
                kind: monaco.languages.CompletionItemKind.Class,
                detail: `Table (${table.schema}) - ${table.columns.length} columns`,
                documentation: {
                  value: [
                    "```sql",
                    `-- Table: ${table.name}`,
                    `-- Schema: ${table.schema}`,
                    "-- Columns:",
                    ...table.columns.map(
                      (col) =>
                        `${col.name} ${col.type}${col.nullable ? " NULL" : ""}`
                    ),
                    "```",
                  ].join("\n"),
                },
                insertText: table.name,
                range,
              });

              // Add column suggestions
              const tablePattern = new RegExp(`\\b${table.name}\\b`, "i");
              if (tablePattern.test(textUntilPosition)) {
                table.columns.forEach((column) => {
                  const compatibleFunctions =
                    SQL_TYPE_MAPPINGS[column.type] || [];
                  suggestions.push({
                    label: column.name,
                    kind: monaco.languages.CompletionItemKind.Field,
                    detail: `${column.type}${column.nullable ? " NULL" : ""}`,
                    documentation: {
                      value: [
                        `Column from ${table.name}`,
                        `Type: ${column.type}`,
                        column.nullable ? "Nullable: YES" : "Nullable: NO",
                        "",
                        "Suggested functions:",
                        ...compatibleFunctions.map((fn) => `- ${fn}()`),
                      ].join("\n"),
                    },
                    insertText: column.name,
                    range,
                  });
                });
              }
            });
          });

          // Add keyword suggestions based on context
          const lastWord = textUntilPosition
            .trim()
            .split(/\s+/)
            .pop()
            ?.toUpperCase();
          if (lastWord) {
            const contextKeywords = getContextualKeywords(
              lastWord,
              keywordsRef.current
            );
            contextKeywords.forEach((keyword) => {
              suggestions.push({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range,
              });
            });
          }

          // Add function suggestions
          functionsRef.current.forEach((fn) => {
            suggestions.push({
              label: fn.function_name,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: `${fn.function_name}()`,
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              detail: fn.return_type ?? "function",
              documentation: {
                value: [
                  `**${fn.function_name}**`,
                  fn.description ? `\n${fn.description}\n` : "",
                  fn.parameter_types ? `\nParameters: ${fn.parameter_types}\n` : "",
                  fn.return_type ? `\nReturns: ${fn.return_type}\n` : "",
                  fn.example ? `\nExample:\n\`\`\`sql\n${fn.example}\n\`\`\`\n` : "",
                ].join(""),
                supportHtml: true,
                supportThemeIcons: true,
              },
            });
          });

          return { suggestions };
        },
      });

      // Register Hover Provider
      monaco.languages.registerHoverProvider("sql", {
        provideHover: (model, position) => {
          const word = model.getWordAtPosition(position);
          if (!word) return null;

          const functions = functionsRef.current;

          // Check for function hover
          const hoveredFunction = functions.find(
            (fn) => fn.function_name.toLowerCase() === word.word.toLowerCase()
          );

          if (hoveredFunction) {
            return {
              contents: [
                { value: `**${hoveredFunction.function_name}**` },
                hoveredFunction.description
                  ? { value: hoveredFunction.description }
                  : null,
                hoveredFunction.parameter_types
                  ? { value: `Parameters: ${hoveredFunction.parameter_types}` }
                  : null,
                hoveredFunction.return_type
                  ? { value: `Returns: ${hoveredFunction.return_type}` }
                  : null,
                hoveredFunction.example
                  ? { value: `Example:\n\`\`\`sql\n${hoveredFunction.example}\n\`\`\`` }
                  : null,
              ].filter(Boolean) as monaco.IMarkdownString[], // Filter out nulls
            };
          }

          // Check for table hover
          for (const db of databases) {
            for (const table of db.tables) {
              if (table.name.toLowerCase() === word.word.toLowerCase()) {
                return {
                  contents: [
                    { value: `**Table: ${table.name}**` },
                    { value: `Schema: ${table.schema}` },
                    {
                      value:
                        "```sql\n" +
                        table.columns
                          .map(
                            (col) =>
                              `${col.name} ${col.type}${
                                col.nullable ? " NULL" : ""
                              }`
                          )
                          .join("\n") +
                        "\n```",
                    },
                  ],
                };
              }

              // Check for column hover
              const column = table.columns.find(
                (c) => c.name.toLowerCase() === word.word.toLowerCase()
              );
              if (column) {
                const compatibleFunctions =
                  SQL_TYPE_MAPPINGS[column.type] || [];
                return {
                  contents: [
                    { value: `**Column: ${column.name}**` },
                    {
                      value: `Type: ${column.type}${
                        column.nullable ? " NULL" : ""
                      }`,
                    },
                    { value: `Table: ${table.name}` },
                    {
                      value:
                        "\nCompatible functions:\n" +
                        compatibleFunctions.map((f) => `- ${f}`).join("\n"),
                    },
                  ],
                };
              }
            }
          }

          return null;
        },
      });

      monacoInitialized.current = true;
    } catch (error) {
      toast.error(
        `Failed to fetch keywords/functions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      console.error("Failed to fetch keywords/functions:", error);
    }
  }, [executeQuery, databases]);

  useEffect(() => {
    fetchAndConfigureMonaco();
  }, [fetchAndConfigureMonaco]);

  const getContextualKeywords = (
    lastWord: string,
    keywords: string[]
  ): string[] => {
    const contextMap: Record<string, string[]> = {
      SELECT: ["DISTINCT", "ALL", "*"],
      FROM: ["TABLE", "JOIN", "LEFT", "RIGHT", "INNER", "CROSS"],
      JOIN: ["ON"],
      WHERE: ["AND", "OR", "NOT", "EXISTS", "IN", "BETWEEN", "LIKE"],
      GROUP: ["BY"],
      ORDER: ["BY"],
      BY: ["ASC", "DESC"],
      HAVING: ["AND", "OR", "NOT"],
    };

    return contextMap[lastWord] || keywords;
  };

  return null;
};

export default useDuckDBMonaco;
import * as monaco from "monaco-editor";
import { useDuckStore } from "@/store";
import { useMemo } from "react";
import type { editor } from "monaco-editor";
import { toast } from "sonner";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { format } from "sql-formatter";

// Types
export interface EditorInstance {
  editor: editor.IStandaloneCodeEditor;
  dispose: () => void;
}

interface EditorConfig {
  language: string;
  theme: string;
  automaticLayout: boolean;
  tabSize: number;
  minimap: { enabled: boolean };
  padding: { top: number };
  suggestOnTriggerCharacters: boolean;
  quickSuggestions: boolean;
  wordBasedSuggestions: boolean;
  fontSize: number;
  lineNumbers: "on" | "off" | "relative";
  scrollBeyondLastLine: boolean;
  cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
  matchBrackets: "always" | "never" | "near";
  rulers: number[];
}

// Worker configuration
self.MonacoEnvironment = {
  getWorker(_workerId: string) {
    return new editorWorker();
  },
};

// SQL Keywords and Functions
const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "TABLE",
  "DATABASE",
  "INDEX",
  "VIEW",
  "TRIGGER",
  "PROCEDURE",
  "FUNCTION",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "OUTER",
  "ON",
  "GROUP",
  "BY",
  "ORDER",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "UNION",
  "ALL",
  "DISTINCT",
  "AS",
  "INTO",
  "VALUES",
  "SET",
  "NULL",
  "NOT",
  "AND",
  "OR",
  "IN",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "ILIKE",
  "IS",
  "PRIMARY",
  "FOREIGN",
  "KEY",
  "REFERENCES",
  "DEFAULT",
  "CHECK",
  "CONSTRAINT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "UNIQUE",
  "ASC",
  "DESC",
  "FOR",
  "EACH",
  "ROW",
  "WITH",
  "RECURSIVE",
  "GRANT",
  "REVOKE",
  "TRUE",
  "FALSE",
  "USING",
  "NATURAL",
  "CROSS",
  "RETURNING",
  "REPLACE",
  "TRUNCATE",
  "TEMPORARY",
  "IF",
  "EXISTS",
  "MATERIALIZED",
  "VACUUM",
  "ANALYZE",
  "EXPLAIN",
  "CAST",
  "TRY_CAST",
  "SHOW",
  "DESCRIBE",
  "PRAGMA",
  "ATTACH",
  "DETACH",
  "USE",
  "READ_PARQUET",
  "READ_CSV",
  "READ_JSON",
  "COPY",
  "TO",
  "FROM",
  "DELIMITER",
  "HEADER",
  "QUOTE",
  "ESCAPE",
  "NULL AS",
  "FORCE_QUOTE",
  "FORCE_NOT_NULL",
];

const SQL_FUNCTIONS = [
  "ABS",
  "ACOS",
  "ASIN",
  "ATAN",
  "ATAN2",
  "AVG",
  "CEIL",
  "CEILING",
  "COALESCE",
  "CONCAT",
  "COS",
  "COT",
  "COUNT",
  "DATE_PART",
  "DATE_TRUNC",
  "DEGREES",
  "EXP",
  "EXTRACT",
  "FLOOR",
  "GREATEST",
  "INITCAP",
  "LEAST",
  "LENGTH",
  "LN",
  "LOG",
  "LOWER",
  "LPAD",
  "LTRIM",
  "MAX",
  "MIN",
  "MOD",
  "NOW",
  "NULLIF",
  "PI",
  "POWER",
  "RADIANS",
  "RANDOM",
  "ROUND",
  "RPAD",
  "RTRIM",
  "SIGN",
  "SIN",
  "SQRT",
  "SUBSTR",
  "SUBSTRING",
  "SUM",
  "TAN",
  "TRIM",
  "TRUNC",
  "UPPER",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "CURRENT_USER",
  "LIST",
  "STRING_AGG",
  "FIRST",
  "LAST",
  "NTH_VALUE",
  "LAG",
  "LEAD",
  "FIRST_VALUE",
  "LAST_VALUE",
  "ROW_NUMBER",
  "RANK",
  "DENSE_RANK",
  "PERCENT_RANK",
  "CUME_DIST",
  "NTILE",
  "LAG",
  "LEAD",
  "REGEXP_MATCHES",
  "REGEXP_REPLACE",
  "REGEXP_EXTRACT",
  "UNNEST",
  "GENERATE_SERIES",
  "CAST",
  "TRY_CAST",
];

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

// Update Monaco configuration
export const updateMonaco = () => {
  const { databases } = useDuckStore.getState();

  // Register SQL language
  monaco.languages.register({ id: "sql" });

  // Set tokenizer
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
    SQL_KEYWORDS,
    SQL_FUNCTIONS,
  });

  // Register completion provider
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
              const compatibleFunctions = SQL_TYPE_MAPPINGS[column.type] || [];
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
        const contextKeywords = getContextualKeywords(lastWord);
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
      SQL_FUNCTIONS.forEach((fn) => {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}()`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      });

      return { suggestions };
    },
  });

  // Register hover provider
  monaco.languages.registerHoverProvider("sql", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

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
            const compatibleFunctions = SQL_TYPE_MAPPINGS[column.type] || [];
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
};

// Helper function to get contextual keywords
const getContextualKeywords = (lastWord: string): string[] => {
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

  return contextMap[lastWord] || SQL_KEYWORDS;
};

// Create editor instance
export const createEditor = (
  container: HTMLElement,
  config: EditorConfig,
  initialContent: string,
  tabId: string,
  executeQueryFn: (query: string, tabId: string) => Promise<void>
): EditorInstance => {
  const editor = monaco.editor.create(container, {
    ...config,
    value: initialContent,
    wordBasedSuggestions: config.wordBasedSuggestions ? "allDocuments" : "off",
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    renderWhitespace: "selection",
    smoothScrolling: true,
    cursorSmoothCaretAnimation: "on",
    formatOnPaste: true,
    formatOnType: true,
    snippetSuggestions: "inline",
    suggest: {
      preview: true,
      showMethods: true,
      showFunctions: true,
      showVariables: true,
      showWords: true,
      showColors: true,
    },
  });

  // Add commands
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, async () => {
    const query = editor.getValue().trim();
    if (!query) {
      toast.error("Please enter a query to execute");
      return;
    }
    try {
      await executeQueryFn(query, tabId);
    } catch (err) {
      toast.error(
        `Query execution failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  });

  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
    const formatAction = editor.getAction("editor.action.formatDocument");
    formatAction?.run();
  });

  // Add context menu actions
  editor.addAction({
    id: "execute-selection",
    label: "Execute Selected Query",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    ],
    contextMenuGroupId: "navigation",
    run: async (ed) => {
      const selection = ed.getSelection();
      const selectedText = selection
        ? ed.getModel()?.getValueInRange(selection)
        : "";

      if (selectedText?.trim()) {
        try {
          await executeQueryFn(selectedText.trim(), tabId);
        } catch (err) {
          toast.error(
            `Query execution failed: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      }
    },
  });

  editor.addAction({
    id: "format-sql",
    label: "Format SQL",
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
    contextMenuGroupId: "modification",
    run: (ed) => {
      const text = ed.getValue();
      try {
        const formatted = format(text, {
          language: "sql",
          keywordCase: "upper",
          indentStyle: "standard",
          linesBetweenQueries: 2,
        });
        ed.setValue(formatted);
      } catch (err) {
        toast.error("Failed to format SQL");
      }
    },
  });

  // Setup content change listener with debounce
  let timeoutId: number;
  const disposable = editor.onDidChangeModelContent(() => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      const newValue = editor.getValue();
      useDuckStore.getState().updateTabQuery(tabId, newValue);
    }, 300);
  });

  return {
    editor,
    dispose: () => {
      clearTimeout(timeoutId);
      disposable.dispose();
      editor.dispose();
    },
  };
};

// Enhanced config hook with better defaults
export const useMonacoConfig = (theme: string): EditorConfig => {
  return useMemo(
    () => ({
      language: "sql",
      theme: theme === "dark" ? "vs-dark" : "vs",
      automaticLayout: true,
      tabSize: 2,
      minimap: { enabled: false },
      padding: { top: 10 },
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      wordBasedSuggestions: false,
      fontSize: 12,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      cursorBlinking: "blink",
      matchBrackets: "always",
      rulers: [],
    }),
    [theme]
  );
};

// Register SQL formatting provider
monaco.languages.registerDocumentFormattingEditProvider("sql", {
  provideDocumentFormattingEdits: (model) => {
    try {
      const formatted = format(model.getValue(), {
        language: "sql",
        keywordCase: "upper",
        indentStyle: "standard",
        linesBetweenQueries: 2,
      });

      return [
        {
          range: model.getFullModelRange(),
          text: formatted,
        },
      ];
    } catch (err) {
      console.error("SQL formatting failed:", err);
      return [];
    }
  },
});

// Initialize Monaco configuration
updateMonaco();

// Export everything needed
export default {
  createEditor,
  useMonacoConfig,
  updateMonaco,
};

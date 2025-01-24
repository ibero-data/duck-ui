import * as monaco from "monaco-editor";
import { useDuckStore } from "@/store";
import { useMemo } from "react";
import type { editor } from "monaco-editor";
import { toast } from "sonner";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { format } from "sql-formatter";
import { TableInfo } from "@/store"; // Import the types

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
}

// set worker
self.MonacoEnvironment = {
  getWorker(_workerId: string) {
    return new editorWorker();
  },
};

// Define SQL keywords, system functions, and user-defined functions
const sqlKeywords = [
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
];

const sqlSystemFunctions = [
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "UPPER",
  "LOWER",
  "SUBSTRING",
  "TRIM",
  "COALESCE",
  "NULLIF",
  "CAST",
  "CONVERT",
  "EXTRACT",
  "DATE_PART",
  "DATE_TRUNC",
  "NOW",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "LENGTH",
  "ABS",
  "ROUND",
  "SQRT",
  "POWER",
  "CEIL",
  "FLOOR",
  "RANDOM",
];

// Register SQL language with custom tokens provider
monaco.languages.register({ id: "sql" });
monaco.languages.setMonarchTokensProvider("sql", {
  tokenizer: {
    root: [
      [
        /([a-zA-Z_][a-zA-Z0-9_]*)(\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*))?/,
        {
          cases: {
            "@sqlKeywords": "keyword",
            "@sqlSystemFunctions": "predefined",
            "@default": "identifier",
          },
        },
      ],
      [/"([^"\\]|\\.)*?"/, "string"],
      [/'([^'\\]|\\.)*?'/, "string"],
      { include: "@whitespace" },
      [/[{}()\[\]]/, "@brackets"],
      [/[<>](?!@symbols)/, "@brackets"],
      [
        /@symbols/,
        {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        },
      ],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/0[bB][01]+/, "number.binary"],
      [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
      [/\d+/, "number"],
      [/[;,.]/, "delimiter"],
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/"/, "string", '@string."'],
      [/'([^'\\]|\\.)*$/, "string.invalid"],
      [/'/, "string", "@string.'"],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/--.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
    ],
    comment: [
      [/[^\/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"],
    ],
    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape.invalid"],
      [/"/, "string", "@pop"],
    ],
  },
  sqlKeywords,
  sqlSystemFunctions,
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  operators: [
    "=",
    ">",
    "<",
    "!",
    "~",
    "?",
    ":",
    "==",
    "<=",
    ">=",
    "!=",
    "&&",
    "||",
    "++",
    "--",
    "+",
    "-",
    "*",
    "/",
    "&",
    "|",
    "^",
    "%",
    "<<",
    ">>",
    ">>>",
  ],
});

// Dynamic auto-completion provider
monaco.languages.registerCompletionItemProvider("sql", {
  triggerCharacters: [" ", ".", "(", ","],
  provideCompletionItems: (model, position) => {
    const { databases } = useDuckStore.getState(); // Default to empty array
    const tables =  databases.reduce((acc, db) => {
      return [...acc, ...db.tables]
    },[] as TableInfo[]);

    const textUntilPosition = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      word.endColumn
    );
    const currentWord = model.getWordAtPosition(position)?.word || "";

    // Function suggestions
    const functionSuggestions = sqlSystemFunctions.map((func) => ({
      label: func,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: func + "()",
      range,
    }));

    // Keyword suggestions
    const keywordSuggestions = sqlKeywords
      .map((keyword) => {
        const insertText = keyword;
        const item: monaco.languages.CompletionItem = {
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText,
          range,
        };
        if (
          textUntilPosition.toUpperCase().trimEnd().endsWith("SELECT") ||
          textUntilPosition.toUpperCase().trimEnd().endsWith("FROM") ||
          textUntilPosition.toUpperCase().trimEnd().endsWith("WHERE") ||
          textUntilPosition.toUpperCase().trimEnd().endsWith("ORDER BY") ||
          textUntilPosition.toUpperCase().trimEnd().endsWith("GROUP BY")
        ) {
          return item;
        }

        if (
          textUntilPosition.toUpperCase().trimEnd().endsWith("JOIN") ||
          textUntilPosition.toUpperCase().trimEnd().endsWith("LEFT JOIN") ||
          textUntilPosition.toUpperCase().trimEnd().endsWith("RIGHT JOIN")
        ) {
          if (keyword === "ON") {
            return item;
          }
        }
        return null;
      })
      .filter(Boolean) as monaco.languages.CompletionItem[];

    // Table name suggestions
    const tableSuggestions = tables.map((table) => ({
      label: table.name,
      kind: monaco.languages.CompletionItemKind.Variable,
      insertText: table.name,
      range,
      detail: "Table",
    }));

    // Column name suggestions
    const columnSuggestions = tables.reduce((acc, table) => {
      const fromMatch = textUntilPosition
        .toUpperCase()
        .match(new RegExp(`FROM\\s+([\\w."]+)`, "g"));
      const joinMatch = textUntilPosition
        .toUpperCase()
        .match(new RegExp(`JOIN\\s+([\\w."]+)`, "g"));
      if (fromMatch || joinMatch) {
        const tablesInQuery = (fromMatch ?? [])
          .concat(joinMatch ?? [])
          .map((match) =>
            match
              .toUpperCase()
              .replace(/(FROM|JOIN)\s+/, "")
              .trim()
              .replace(/"/g, "")
          );
        const tableAliases = tablesInQuery.reduce((tableAcc, tableName) => {
          const aliasMatch = tableName.match(/(\w+)\s+AS\s+(\w+)/);
          if (aliasMatch) {
            tableAcc[aliasMatch[2]] = aliasMatch[1];
            return tableAcc;
          }
          return tableAcc;
        }, {} as Record<string, string>);

        const tableAliasesKeys = Object.keys(tableAliases);
        const tableName = tableAliases[currentWord]
          ? tableAliases[currentWord]
          : table.name;
        if (
          tablesInQuery.includes(tableName) ||
          tablesInQuery.includes(table.name) ||
          tableAliasesKeys.includes(currentWord)
        ) {
          const colSuggest = table.columns.map((col) => {
            const insertText =
              (tableAliasesKeys.includes(currentWord) &&
                tableAliases[currentWord] === table.name) ||
              (tableAliasesKeys.includes(currentWord) &&
                table.name.toUpperCase() === tableName)
                ? `${currentWord}.${col.name}`
                : col.name;
            return {
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText,
              range,
              detail: `${table.name} Column`,
            };
          });
          acc.push(...colSuggest);
        }
      }
      return acc;
    }, [] as monaco.languages.CompletionItem[]);
    return {
      suggestions: [
        ...keywordSuggestions,
        ...functionSuggestions,
        ...tableSuggestions,
        ...columnSuggestions,
      ],
    };
  },
});

monaco.languages.registerCodeActionProvider("sql", {
  provideCodeActions: (model, _range, _context, _token) => {
    const actions: monaco.languages.CodeAction[] = [];

    // Simple code formatting action
    actions.push({
      title: "Format SQL Code",
      edit: {
        edits: [
          {
            resource: model.uri,
            range: model.getFullModelRange(),
            text: model
              .getValue()
              .split("\n")
              .map((s) => s.trim())
              .join("\n"),
          },
        ],
      },
      kind: "quickfix",
      isPreferred: true,
    });

    return { actions, dispose: () => {} };
  },
});

monaco.languages.registerDocumentFormattingEditProvider("sql", {
  provideDocumentFormattingEdits: (model) => {
    const formatted = format(model.getValue(), { language: "sql" });
    return [
      {
        range: model.getFullModelRange(),
        text: formatted,
      },
    ];
  },
});

// DuckDB-specific commands

const createEditorCommands = (
  editor: editor.IStandaloneCodeEditor,
  tabId: string,
  executeQueryFn: (query: string, tabId: string) => Promise<void>
) => {
  // Execute Query Command
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, async () => {
    await executeCurrentQuery(editor, tabId, executeQueryFn);
  });

  // Save/Execute Alternative Command
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
    await executeCurrentQuery(editor, tabId, executeQueryFn);
  });

  // Format Command
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
    const formatAction = editor.getAction("editor.action.formatDocument");
    if (formatAction) {
      formatAction.run();
    }
  });

  // Add context menu
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
        : ed.getValue();

      if (selectedText?.trim()) {
        await executeQueryFn(selectedText.trim(), tabId);
      }
    },
  });
};

// Helper function to execute queries
const executeCurrentQuery = async (
  editor: editor.IStandaloneCodeEditor,
  tabId: string,
  executeQueryFn: (query: string, tabId: string) => Promise<void>
) => {
  const query = editor.getValue().trim();
  if (!query) {
    toast.error("Please enter a query to execute");
    return;
  }

  try {
    await executeQueryFn(query, tabId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Query execution failed: ${errorMessage}`);
  }
};

// Create new editor instance
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
    fontSize: config.fontSize,
  });

  // Register commands and context menu
  createEditorCommands(editor, tabId, executeQueryFn);

  // Setup content change listener
  const disposable = editor.onDidChangeModelContent(() => {
    const newValue = editor.getValue();
    useDuckStore.getState().updateTabQuery(tabId, newValue);
  });

  return {
    editor,
    dispose: () => {
      disposable.dispose();
      editor.dispose();
    },
  };
};

// Hook for editor configuration
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
    }),
    [theme]
    );
};
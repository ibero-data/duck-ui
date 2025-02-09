// monacoConfig.ts
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

// Helper function to escape single quotes for SQL queries
const escape = (str: string): string => {
    return str.replace(/'/g, "''");
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


// Adapt to use the WASM autocompletion
interface AutocompleteItem { suggestion: string; }
const queryNative = async <T>(connection: any, query: string): Promise<T[]> => {
    const results = await connection.query(query);
    return results.toArray().map((row: any) => row as T);
};

monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [' ', '.', '(', ','],
    async provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
        };
        const textInRange = model.getValueInRange({
            startColumn: 0,
            endColumn: position.column,
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
        });

        // Get the connection and ensure it's valid
        const { connection } = useDuckStore.getState();
        if (!connection) {
            console.warn("No database connection available for autocompletion.");
            return { suggestions: [] };
        }
        try {

            const escapedText = escape(textInRange);
            const query = `select suggestion from sql_auto_complete('${escapedText}')`;
            const items: AutocompleteItem[] = await queryNative<AutocompleteItem>(connection, query);

            const suggestions = items.map((item) => {
                return {
                    label: String(item.suggestion),
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: String(item.suggestion),
                    range,
                };
            });

            return { suggestions };

        } catch (error) {
            console.error("Autocompletion query failed:", error);
            return { suggestions: [] };
        }
    },
});

// Export everything needed
export default {
  createEditor,
  useMonacoConfig,
};
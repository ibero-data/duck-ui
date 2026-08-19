/**
 * Monaco wiring for dashboard authoring intelligence.
 *
 * The logic lives in `services/dashboard/authoring.ts` (pure, tested); this
 * file adapts it to Monaco's completion API. One provider is registered
 * globally for the markdown language, gated to models explicitly enrolled via
 * `enableDashboardCompletions` — notebook markdown or any future markdown
 * surface stays untouched.
 */

import * as monaco from "monaco-editor";
import {
  authoringContext,
  authoringSnippets,
  inputNamesIn,
  propsForComponent,
  queryNamesIn,
} from "@/services/dashboard/authoring";

/** Models that get dashboard completions, by URI. */
const enrolled = new Set<string>();
let registered = false;

const wordRange = (model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange => {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  };
};

const buildSuggestions = (
  model: monaco.editor.ITextModel,
  position: monaco.Position
): monaco.languages.CompletionItem[] => {
  const before = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const source = model.getValue();
  const context = authoringContext(before);
  const range = wordRange(model, position);

  switch (context.kind) {
    case "sql":
      // Inside a query fence: SQL, not dashboard markup. Word suggestions
      // from Monaco still apply; nothing dashboard-specific to add.
      return [];

    case "query-ref":
      return queryNamesIn(source).map((name) => ({
        label: name,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: name,
        detail: "Query in this dashboard",
        range,
      }));

    case "input-var": {
      const items: monaco.languages.CompletionItem[] = [];
      for (const input of inputNamesIn(source)) {
        if (input.isRange) {
          for (const part of ["start", "end"] as const) {
            items.push({
              label: `inputs.${input.name}.${part}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `inputs.${input.name}.${part}}`,
              detail: "Date range input",
              range,
            });
          }
        } else {
          items.push({
            label: `inputs.${input.name}.value`,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: `inputs.${input.name}.value}`,
            detail: "Input variable",
            range,
          });
        }
      }
      return items;
    }

    case "component-props":
      return propsForComponent(context.tag).map((prop) => ({
        label: prop,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: prop === "data" ? "data={$1}" : `${prop}=`,
        insertTextRules:
          prop === "data"
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
        detail: `<${context.tag}> prop`,
        range,
      }));

    case "top": {
      // `<` may already be typed; the snippet must not double it.
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const openBracket = /<[A-Za-z]*$/.test(line);
      // The document's real query names become a snippet CHOICE in the data
      // slot: accepting a component immediately offers the queries that
      // exist, instead of a placeholder the user has to know to replace.
      const names = queryNamesIn(source);
      const dataSlot = names.length > 0 ? `{\${1|${names.join(",")}|}}` : "{${1:query_name}}";
      return authoringSnippets().map((snippet) => {
        const startsWithTag = snippet.insertText.startsWith("<");
        let insertText = snippet.insertText.replace("{${1:query_name}}", dataSlot);
        if (openBracket && startsWithTag) insertText = insertText.slice(1);
        return {
          label: snippet.label,
          kind: startsWithTag
            ? monaco.languages.CompletionItemKind.Class
            : monaco.languages.CompletionItemKind.Snippet,
          insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: snippet.detail,
          sortText: `${snippet.sort}-${snippet.label}`,
          range,
        };
      });
    }
  }
};

const registerProvider = (): void => {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider("markdown", {
    triggerCharacters: ["<", "{", "$", ".", " "],
    provideCompletionItems(model, position) {
      if (!enrolled.has(model.uri.toString())) return { suggestions: [] };
      try {
        return { suggestions: buildSuggestions(model, position) };
      } catch {
        // A parse hiccup must never take typing down with it.
        return { suggestions: [] };
      }
    },
  });
};

/**
 * Turns dashboard completions on for one model. Returns the off switch;
 * callers disable on dispose so a recycled URI cannot inherit them.
 */
export const enableDashboardCompletions = (model: monaco.editor.ITextModel): (() => void) => {
  registerProvider();
  const key = model.uri.toString();
  enrolled.add(key);
  return () => enrolled.delete(key);
};

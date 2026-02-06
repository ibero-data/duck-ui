import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, Loader2, Table2, Columns } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DatabaseInfo } from "@/store";
import SchemaAutocomplete, {
  buildSchemaSuggestions,
  type SchemaSuggestion,
} from "./SchemaAutocomplete";

// Render text with styled @ mentions
const renderWithMentions = (text: string) => {
  const mentionRegex = /@([\w.]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }

    // Add the mention as a styled pill
    const mention = match[1];
    const isColumn = mention.includes(".");
    parts.push(
      <span
        key={`mention-${match.index}`}
        className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-primary/20 text-primary text-xs font-medium align-baseline"
      >
        {isColumn ? <Columns className="h-3 w-3" /> : <Table2 className="h-3 w-3" />}
        {mention}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : text;
};

interface DuckBrainInputProps {
  onSend: (message: string) => void;
  onAbort?: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  placeholder?: string;
  databases?: DatabaseInfo[];
  className?: string;
}

const DuckBrainInput: React.FC<DuckBrainInputProps> = ({
  onSend,
  onAbort,
  isGenerating,
  disabled = false,
  placeholder = "Ask Duck Brain to write SQL... (@ for tables)",
  databases = [],
  className,
}) => {
  const [input, setInput] = useState("");
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SchemaSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLFormElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Detect @ mentions and filter suggestions
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setInput(value);

      // Find the @ before cursor
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        // Check if there's a space between @ and cursor (mention ended)
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
        const hasSpace = /\s/.test(textAfterAt);

        if (!hasSpace) {
          // Active mention - show suggestions
          setMentionStart(lastAtIndex);
          const filter = textAfterAt;
          const filtered = buildSchemaSuggestions(databases, filter);
          setSuggestions(filtered);
          setIsAutocompleteOpen(filtered.length > 0);
          setActiveIndex(0);
          return;
        }
      }

      // No active mention
      setIsAutocompleteOpen(false);
      setMentionStart(null);
    },
    [databases]
  );

  // Insert selected suggestion
  const insertSuggestion = useCallback(
    (suggestion: SchemaSuggestion) => {
      if (mentionStart === null) return;

      const before = input.slice(0, mentionStart);
      const cursorPos = textareaRef.current?.selectionStart || input.length;
      const after = input.slice(cursorPos);

      // Insert with @ prefix so it renders as a pill
      const insertText = `@${suggestion.fullPath}`;
      const newInput = `${before}${insertText} ${after}`;

      setInput(newInput);
      setIsAutocompleteOpen(false);
      setMentionStart(null);

      // Focus and set cursor position
      setTimeout(() => {
        const newCursorPos = before.length + insertText.length + 1;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [input, mentionStart]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle autocomplete navigation
    if (isAutocompleteOpen && suggestions.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % suggestions.length);
          return;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev === 0 ? suggestions.length - 1 : prev - 1));
          return;
        case "Tab":
        case "Enter":
          if (suggestions[activeIndex]) {
            e.preventDefault();
            insertSuggestion(suggestions[activeIndex]);
            return;
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsAutocompleteOpen(false);
          return;
      }
    }

    // Regular Enter to send (if not in autocomplete)
    if (e.key === "Enter" && !e.shiftKey && !isAutocompleteOpen) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isGenerating || disabled) return;

    onSend(input.trim());
    setInput("");
    setIsAutocompleteOpen(false);
  };

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsAutocompleteOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if input has any @ mentions to show overlay
  const hasMentions = /@[\w.]+/.test(input);

  return (
    <form ref={containerRef} onSubmit={handleSubmit} className={cn("relative", className)}>
      {/* Visual overlay for styled mentions */}
      {hasMentions && (
        <div
          className="absolute inset-0 pointer-events-none px-3 py-[9px] text-sm overflow-hidden"
          aria-hidden="true"
        >
          <div className="whitespace-pre-wrap break-words leading-normal">
            {renderWithMentions(input)}
          </div>
        </div>
      )}
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isGenerating}
        className={cn(
          "min-h-[44px] max-h-[120px] resize-none pr-12",
          "text-sm placeholder:text-muted-foreground/60",
          // Make text transparent when we have mentions to show overlay
          hasMentions && "text-transparent caret-foreground"
        )}
        rows={1}
      />

      {/* Schema Autocomplete Popover */}
      <SchemaAutocomplete
        isOpen={isAutocompleteOpen}
        suggestions={suggestions}
        activeIndex={activeIndex}
        onSelect={insertSuggestion}
        position={{ top: 50, left: 0 }}
      />

      <div className="absolute right-2 bottom-2">
        {isGenerating ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onAbort}
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            disabled={!input.trim() || disabled}
            className="h-8 w-8"
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </form>
  );
};

export default DuckBrainInput;

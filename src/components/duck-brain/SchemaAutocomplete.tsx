import React, { useEffect, useRef } from "react";
import { Table2, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatabaseInfo } from "@/store";

export interface SchemaSuggestion {
  type: "table" | "column";
  name: string;
  fullPath: string;
  tableName?: string;
  columnType?: string;
  rowCount?: number;
}

interface SchemaAutocompleteProps {
  isOpen: boolean;
  suggestions: SchemaSuggestion[];
  activeIndex: number;
  onSelect: (suggestion: SchemaSuggestion) => void;
  position: { top: number; left: number };
  className?: string;
}

/**
 * Builds suggestions from database schema
 */
export function buildSchemaSuggestions(
  databases: DatabaseInfo[],
  filter: string = ""
): SchemaSuggestion[] {
  const suggestions: SchemaSuggestion[] = [];
  const lowerFilter = filter.toLowerCase();

  // Check if filter contains a dot (table.column)
  const dotIndex = filter.indexOf(".");
  const tableFilter = dotIndex > 0 ? filter.slice(0, dotIndex).toLowerCase() : null;
  const columnFilter = dotIndex > 0 ? filter.slice(dotIndex + 1).toLowerCase() : null;

  for (const db of databases) {
    for (const table of db.tables) {
      const tableName = db.name === "memory" ? table.name : `${db.name}.${table.name}`;

      // If filtering for columns of a specific table
      if (tableFilter) {
        if (table.name.toLowerCase() === tableFilter || tableName.toLowerCase() === tableFilter) {
          // Show columns for this table
          for (const col of table.columns) {
            if (!columnFilter || col.name.toLowerCase().startsWith(columnFilter)) {
              suggestions.push({
                type: "column",
                name: col.name,
                fullPath: `${table.name}.${col.name}`,
                tableName: table.name,
                columnType: col.type,
              });
            }
          }
        }
      } else {
        // Show tables matching filter
        if (!lowerFilter || table.name.toLowerCase().startsWith(lowerFilter)) {
          suggestions.push({
            type: "table",
            name: table.name,
            fullPath: tableName,
            rowCount: table.rowCount,
          });
        }
      }
    }
  }

  // Sort: tables first, then columns, alphabetically
  return suggestions.sort((a, b) => {
    if (a.type !== b.type) return a.type === "table" ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).slice(0, 10); // Limit to 10 suggestions
}

const SchemaAutocomplete: React.FC<SchemaAutocompleteProps> = ({
  isOpen,
  suggestions,
  activeIndex,
  onSelect,
  position,
  className,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && activeIndex >= 0) {
      const activeItem = listRef.current.children[activeIndex] as HTMLElement;
      activeItem?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!isOpen || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute z-50 w-64 max-h-48 overflow-auto",
        "bg-popover border rounded-md shadow-lg",
        className
      )}
      style={{ bottom: position.top, left: position.left }}
    >
      <div ref={listRef} className="py-1">
        {suggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.type}-${suggestion.fullPath}`}
            type="button"
            onClick={() => onSelect(suggestion)}
            className={cn(
              "w-full px-3 py-1.5 text-left text-sm flex items-center gap-2",
              "hover:bg-accent",
              index === activeIndex && "bg-accent"
            )}
          >
            {suggestion.type === "table" ? (
              <Table2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            ) : (
              <Columns3 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium truncate block">
                {suggestion.name}
              </span>
              {suggestion.type === "table" && (
                <span className="text-[10px] text-muted-foreground">
                  {suggestion.rowCount ? `${suggestion.rowCount.toLocaleString()} rows` : "table"}
                </span>
              )}
              {suggestion.type === "column" && suggestion.columnType && (
                <span className="text-[10px] text-muted-foreground">
                  {suggestion.columnType}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/30">
        <kbd className="px-1 rounded bg-muted">↑↓</kbd> navigate
        <span className="mx-1.5">·</span>
        <kbd className="px-1 rounded bg-muted">Tab</kbd> select
        <span className="mx-1.5">·</span>
        <kbd className="px-1 rounded bg-muted">Esc</kbd> close
      </div>
    </div>
  );
};

export default SchemaAutocomplete;

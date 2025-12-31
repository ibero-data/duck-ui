import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Import, Table, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImportOptions {
  tableName: string;
  importMode: "table" | "view";
}

interface ImportOptionsPopoverProps {
  fileName: string;
  onImport: (options: ImportOptions) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * Generate a valid table name from a filename
 */
function generateTableName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "") // Remove extension
    .replace(/[^a-zA-Z0-9_]/g, "_") // Replace special chars with underscore
    .replace(/^[0-9]/, "_$&") // Ensure doesn't start with number
    .replace(/_+/g, "_") // Collapse multiple underscores
    .replace(/^_|_$/g, ""); // Trim leading/trailing underscores
}

const ImportOptionsPopover: React.FC<ImportOptionsPopoverProps> = ({
  fileName,
  onImport,
  children,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [tableName, setTableName] = useState(generateTableName(fileName));
  const [importMode, setImportMode] = useState<"table" | "view">("table");

  const handleImport = () => {
    if (!tableName.trim()) return;
    onImport({ tableName: tableName.trim(), importMode });
    setOpen(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Reset to defaults when opening
      setTableName(generateTableName(fileName));
      setImportMode("table");
    }
    setOpen(isOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start" side="right">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Import Options</h4>
            <p className="text-xs text-muted-foreground truncate" title={fileName}>
              {fileName}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tableName" className="text-xs">
              Name
            </Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="table_name"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Mode</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={importMode === "table" ? "default" : "outline"}
                size="sm"
                className={cn("flex-1 gap-1.5 text-xs", importMode === "table" && "bg-primary")}
                onClick={() => setImportMode("table")}
              >
                <Table className="h-3.5 w-3.5" />
                Table
              </Button>
              <Button
                type="button"
                variant={importMode === "view" ? "default" : "outline"}
                size="sm"
                className={cn("flex-1 gap-1.5 text-xs", importMode === "view" && "bg-primary")}
                onClick={() => setImportMode("view")}
              >
                <Link2 className="h-3.5 w-3.5" />
                View
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {importMode === "table"
                ? "Copies data into DuckDB (faster queries)"
                : "Links to file (fresh data, less memory)"}
            </p>
          </div>

          <Button
            onClick={handleImport}
            disabled={!tableName.trim()}
            size="sm"
            className="w-full gap-1.5"
          >
            <Import className="h-3.5 w-3.5" />
            {importMode === "table" ? "Import" : "Link"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ImportOptionsPopover;

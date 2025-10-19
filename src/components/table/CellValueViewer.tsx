import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface CellValueViewerProps {
  value: any;
  columnName: string;
  rowIndex: number;
  onClose: () => void;
}

export const CellValueViewer: React.FC<CellValueViewerProps> = ({
  value,
  columnName,
  rowIndex,
  onClose,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  // Detect value type and format accordingly
  const { displayValue, valueType, isFormatted } = useMemo(() => {
    if (value === null || value === undefined) {
      return { displayValue: "NULL", valueType: "null", isFormatted: false };
    }

    // Check if it's JSON
    if (typeof value === "object") {
      try {
        return {
          displayValue: JSON.stringify(value, null, 2),
          valueType: "json",
          isFormatted: true,
        };
      } catch (e) {
        return {
          displayValue: String(value),
          valueType: "object",
          isFormatted: false,
        };
      }
    }

    // Check if string value is JSON
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "object") {
          return {
            displayValue: JSON.stringify(parsed, null, 2),
            valueType: "json",
            isFormatted: true,
          };
        }
      } catch (e) {
        // Not JSON, return as string
      }

      // Check if it's a long text
      if (value.length > 100) {
        return {
          displayValue: value,
          valueType: "text",
          isFormatted: false,
        };
      }
    }

    // Check if it's a number
    if (typeof value === "number" || typeof value === "bigint") {
      return {
        displayValue: String(value),
        valueType: "number",
        isFormatted: false,
      };
    }

    // Default string
    return {
      displayValue: String(value),
      valueType: "string",
      isFormatted: false,
    };
  }, [value]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayValue);
    toast.success("Copied to clipboard");
  };

  if (isMinimized) {
    return (
      <Card className="fixed bottom-4 right-4 z-30 w-[300px] shadow-lg border">
        <CardHeader className="p-3 cursor-pointer" onClick={() => setIsMinimized(false)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium truncate">
              {columnName} (Row {rowIndex + 1})
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(false);
                }}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-30 w-[500px] max-h-[400px] shadow-lg border">
      <CardHeader className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-medium">Cell Value</CardTitle>
            <p className="text-xs text-muted-foreground">
              {columnName} • Row {rowIndex + 1} • {valueType}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setIsMinimized(true)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="max-h-[300px] overflow-auto">
          {valueType === "json" ? (
            <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto">
              <code className="language-json">{displayValue}</code>
            </pre>
          ) : valueType === "text" ? (
            <div className="text-xs whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
              {displayValue}
            </div>
          ) : valueType === "null" ? (
            <div className="text-xs text-muted-foreground italic p-3">
              {displayValue}
            </div>
          ) : (
            <div className="text-xs font-mono bg-muted/50 p-3 rounded-md break-all">
              {displayValue}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CellValueViewer;

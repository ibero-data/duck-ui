import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type ColumnFiltersState,
  type ColumnResizeMode,
  type PaginationState,
  type ColumnSizingState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes, formatDuration } from "@/lib/utils";
import {
  Download,
  Search,
  X,
  Clock,
  SlidersHorizontal,
  Grid3X3,
  Copy,
  MousePointer,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  BarChart3,
  FolderOpen,
  FileSpreadsheet,
  FileJson,
  FileText,
  FileArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useDuckStore } from "@/store";
import { CellValueViewer } from "./CellValueViewer";
import { ColumnStatsPanel } from "./ColumnStatsPanel";
import { fileSystemService } from "@/lib/fileSystem";

// Define a generic type for the data row
type DataRow = Record<string, any>;

// Types for cell selection
type CellPosition = { row: number; col: string };
type ContextMenuPosition = { x: number; y: number };

// Type for the component props
interface DuckTableProps {
  data: DataRow[];
  executionTime?: number | null;
  responseSize?: number | null;
  initialPageSize?: number;
  columnRenderers?: Record<string, (value: any) => React.ReactNode>;
  tableHeight?: string | number;
}

const globalFilterFn: FilterFn<DataRow> = (row, columnId, value) => {
  const cellValue = row.getValue(columnId);
  if (cellValue === null || cellValue === undefined) return false;
  const searchStr = String(cellValue).toLowerCase();
  const filterValue = String(value).toLowerCase();
  return searchStr.includes(filterValue);
};

const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 50;
const MAX_COLUMN_WIDTH = 1000; // Generous max for "free" resizing
const DEFAULT_MAX_AUTO_WIDTH = 250;
const DEFAULT_MIN_AUTO_WIDTH = 80;
const DEFAULT_SAMPLE_SIZE = 100;

// Safe JSON stringify that handles BigInt
const safeStringify = (value: any): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      );
    } catch (e) {
      return String(value);
    }
  }
  return String(value);
};

// Calculate optimal column width based on content
const calculateOptimalWidth = (
  data: DataRow[],
  columnKey: string,
  minWidth: number = DEFAULT_MIN_AUTO_WIDTH,
  maxWidth: number = DEFAULT_MAX_AUTO_WIDTH,
  sampleSize: number = DEFAULT_SAMPLE_SIZE
): number => {
  if (!data.length) return DEFAULT_COLUMN_WIDTH;

  // Sample data for performance
  const sample = data.slice(0, Math.min(sampleSize, data.length));

  // Calculate based on content length
  let maxLength = columnKey.length; // Start with header length

  sample.forEach((row) => {
    const value = row[columnKey];
    const strValue = safeStringify(value);
    maxLength = Math.max(maxLength, strValue.length);
  });

  // Rough estimation: 8px per character + padding
  const estimatedWidth = Math.max(
    minWidth,
    Math.min(maxWidth, maxLength * 8 + 20)
  );

  return estimatedWidth;
};

const DuckUITable: React.FC<DuckTableProps> = ({
  data = [],
  executionTime,
  responseSize,
  initialPageSize = 25,
  columnRenderers,
  tableHeight = "100%",
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [globalFilterInput, setGlobalFilterInput] = useState("");

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [enabledColumns, setEnabledColumns] = useState<Record<string, boolean>>(
    {}
  );
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [userResizedColumns, setUserResizedColumns] = useState<
    Record<string, number>
  >({});
  const [columnSelectorFilter, setColumnSelectorFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // New spreadsheet features
  const [showRowNumbers, setShowRowNumbers] = useState(false);
  const [zebraStripes, setZebraStripes] = useState(true);
  const [showGridLines, setShowGridLines] = useState(false);
  const [showSpreadsheetOptions, setShowSpreadsheetOptions] = useState(false);

  // Cell selection state
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastSelectedCell, setLastSelectedCell] = useState<CellPosition | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(
    null
  );
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<CellPosition | null>(null);
  const [dragEnd, setDragEnd] = useState<CellPosition | null>(null);

  // Cell value viewer state
  const [viewedCell, setViewedCell] = useState<{
    value: any;
    columnName: string;
    rowIndex: number;
  } | null>(null);

  // Get mounted folders from store
  const mountedFolders = useDuckStore((state) => state.mountedFolders);

  // Column stats panel state
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [statsPanelMinimized, setStatsPanelMinimized] = useState(false);

  const columnResizeMode = "onChange" as ColumnResizeMode;

  useEffect(() => {
    const handler = setTimeout(() => setGlobalFilter(globalFilterInput), 300);
    return () => clearTimeout(handler);
  }, [globalFilterInput]);

  useEffect(() => {
    if (globalFilter !== globalFilterInput) setGlobalFilterInput(globalFilter);
  }, [globalFilter]);

  // Initialize/Update enabled columns when data changes
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const allKeys = Object.keys(data[0]);
      const initialEnabledCols = allKeys.reduce((acc, key) => {
        acc[key] =
          enabledColumns[key] === undefined ? true : enabledColumns[key];
        return acc;
      }, {} as Record<string, boolean>);
      setEnabledColumns(initialEnabledCols);

      const validUserResized: Record<string, number> = {};
      allKeys.forEach((key) => {
        if (userResizedColumns[key] !== undefined) {
          validUserResized[key] = userResizedColumns[key];
        }
      });
      setUserResizedColumns(validUserResized);
    } else {
      setEnabledColumns({});
      setUserResizedColumns({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]); // Keep enabledColumns and userResizedColumns out to preserve user settings

  // Effect to initialize columnSizing or update it when userResizedColumns change
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const newSizingState: ColumnSizingState = {};
      Object.keys(data[0]).forEach((key) => {
        newSizingState[key] =
          userResizedColumns[key] !== undefined
            ? userResizedColumns[key]
            : DEFAULT_COLUMN_WIDTH; // Use default width
      });
      if (JSON.stringify(columnSizing) !== JSON.stringify(newSizingState)) {
        setColumnSizing(newSizingState);
      }
    } else if (Object.keys(columnSizing).length > 0) {
      setColumnSizing({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, userResizedColumns]); // columnSizing itself should not be a direct dependency here to avoid loops

  // Close column selector and context menu on outside click (Issue #5, #6)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Close column selector if clicking outside
      if (showColumnSelector && !target.closest('.column-selector-panel')) {
        setShowColumnSelector(false);
      }

      // Close spreadsheet options if clicking outside
      if (showSpreadsheetOptions && !target.closest('.spreadsheet-options-panel')) {
        setShowSpreadsheetOptions(false);
      }

      // Close context menu on any click
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnSelector, showSpreadsheetOptions, contextMenu]);

  const columns = useMemo<ColumnDef<DataRow>[]>(() => {
    if (!data || !data.length || !data[0]) return [];
    const keys = Object.keys(data[0]);
    const cols: ColumnDef<DataRow>[] = [];

    // Add row numbers column if enabled
    if (showRowNumbers) {
      cols.push({
        id: "__row_number__",
        accessorFn: (_, index) => index + 1,
        minSize: 50,
        maxSize: 70,
        size: 60,
        header: () => (
          <div
            className="h-7 text-xs w-full flex items-center justify-center text-muted-foreground font-medium bg-muted cursor-pointer hover:brightness-95"
            title="Click to select all"
          >
            #
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-xs text-center text-muted-foreground font-mono bg-muted cursor-pointer hover:brightness-95">
            {row.index + 1}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        enableResizing: false,
      });
    }

    const dataCols = keys
      .map((key): ColumnDef<DataRow> => {
        return {
          id: key, // Explicit id to avoid TanStack Table misinterpreting numeric keys
          accessorFn: (row) => row[key], // Use accessorFn instead of accessorKey for direct property access
          minSize: MIN_COLUMN_WIDTH,
          maxSize: MAX_COLUMN_WIDTH,
          enableSorting: true,
          header: ({ column }) => (
            <div
              className="h-7 text-xs w-full flex items-center justify-between pl-0 pr-1 cursor-pointer select-none hover:bg-muted/50"
              title={`${key} (click to sort)`}
              onClick={() => column.toggleSorting()}
            >
              <span className="truncate">{key}</span>
              <span className="ml-1 flex-shrink-0">
                {column.getIsSorted() === "asc" ? (
                  <ChevronUp className="h-3 w-3" />
                ) : column.getIsSorted() === "desc" ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronsUpDown className="h-3 w-3 opacity-30" />
                )}
              </span>
            </div>
          ),
          cell: ({ row }) => {
            const value = row.getValue(key);
            const titleAttribute = safeStringify(value);
            let displayValue: React.ReactNode;

            if (
              columnRenderers &&
              columnRenderers[key] &&
              value !== null &&
              value !== undefined
            ) {
              displayValue = columnRenderers[key](value);
            } else if (value === null || value === undefined) {
              displayValue = (
                <span className="text-neutral-400 italic text-xs opacity-50">
                  null
                </span>
              );
            } else if (typeof value === "object" || typeof value === "bigint") {
              // Properly stringify objects and BigInt for display
              const stringifiedValue = safeStringify(value);
              displayValue = stringifiedValue; // Use plain string for better copy behavior
            } else {
              displayValue = String(value); // Default to string
            }

            return (
              <div
                className={`p-1 px-2 align-middle text-xs overflow-hidden whitespace-nowrap select-text ${
                  typeof value === "object" ? "font-mono text-blue-500" : ""
                }`}
                title={titleAttribute}
              >
                {displayValue}
              </div>
            );
          },
          enableColumnFilter: false,
          filterFn: globalFilterFn,
        };
      })
      .filter((column) => {
        // Check both accessorKey (old) and id (new) for enabled columns
        const accessorKey = (column as any).accessorKey as string;
        const columnId = (column as any).id as string;
        const keyToCheck = columnId || accessorKey;
        return (
          keyToCheck === undefined || enabledColumns[keyToCheck] !== false
        );
      });

    return [...cols, ...dataCols];
  }, [data, enabledColumns, columnRenderers, showRowNumbers]);

  const handleColumnSizeChange = (
    updater: React.SetStateAction<ColumnSizingState>
  ) => {
    const newSizingFromTable =
      typeof updater === "function" ? updater(columnSizing) : updater;
    setColumnSizing(newSizingFromTable);
    setUserResizedColumns(newSizingFromTable);
  };

  const table = useReactTable({
    data,
    columns,
    columnResizeMode,
    state: {
      columnFilters,
      globalFilter,
      pagination,
      columnSizing,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnSizingChange: handleColumnSizeChange,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableGlobalFilter: true,
    enableColumnResizing: true,
    enableSorting: true,
    debugTable: false,
  });

  const { rows } = table.getRowModel();
  const ROW_HEIGHT = 32; // Must match CSS and cell content height

  // Helper function to create selection range between two points
  const createSelectionRange = (
    start: CellPosition,
    end: CellPosition
  ): Set<string> => {
    const selection = new Set<string>();
    if (!data || !data[0]) return selection;

    const columns = Object.keys(data[0]);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const startColIndex = columns.indexOf(start.col);
    const endColIndex = columns.indexOf(end.col);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);

    for (let row = minRow; row <= maxRow && row < data.length; row++) {
      for (
        let colIdx = minColIndex;
        colIdx <= maxColIndex && colIdx < columns.length;
        colIdx++
      ) {
        const col = columns[colIdx];
        if (col !== "__row_number__") {
          selection.add(`${row}::${col}`);
        }
      }
    }

    return selection;
  };

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + C to copy selected cells
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedCells.size > 0) {
        e.preventDefault();

        // Get selected cells data organized by row and column
        const cellsByPosition = new Map<string, any>();
        const rowIndices = new Set<number>();
        const columnIds = new Set<string>();

        selectedCells.forEach((cellKey) => {
          const [rowStr, colId] = cellKey.split("::");
          const rowIndex = parseInt(rowStr);
          rowIndices.add(rowIndex);
          columnIds.add(colId);

          const row = rows[rowIndex];
          if (row) {
            const cell = row.getAllCells().find((c) => c.column.id === colId);
            if (cell) {
              cellsByPosition.set(cellKey, cell.getValue());
            }
          }
        });

        // Sort rows and columns
        const sortedRows = Array.from(rowIndices).sort((a, b) => a - b);
        const sortedCols = Array.from(columnIds);

        // Build TSV string for Excel/Sheets compatibility
        const tsvRows: string[] = [];
        sortedRows.forEach((rowIndex) => {
          const rowValues: string[] = [];
          sortedCols.forEach((colId) => {
            const cellKey = `${rowIndex}::${colId}`;
            const value = cellsByPosition.get(cellKey);
            if (value !== undefined) {
              const strValue = value === null ? "" : safeStringify(value);
              rowValues.push(strValue);
            } else if (selectedCells.has(cellKey)) {
              rowValues.push("");
            }
          });
          if (rowValues.length > 0) {
            tsvRows.push(rowValues.join("\t"));
          }
        });

        const tsvContent = tsvRows.join("\n");
        navigator.clipboard.writeText(tsvContent).then(() => {
          toast.success(`Copied ${selectedCells.size} cells to clipboard`);

          // Visual feedback - flash selected cells
          const tempCells = new Set(selectedCells);
          setSelectedCells(new Set());
          setTimeout(() => setSelectedCells(tempCells), 100);
        });
      }

      // Ctrl/Cmd + A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        const allCells = new Set<string>();
        rows.forEach((row, rowIndex) => {
          row.getVisibleCells().forEach((cell) => {
            if (cell.column.id !== "__row_number__") {
              allCells.add(`${rowIndex}::${cell.column.id}`);
            }
          });
        });
        setSelectedCells(allCells);
      }

      // Escape to clear selection
      if (e.key === "Escape") {
        setSelectedCells(new Set());
        setContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCells, rows]);

  // Handle mouse up globally for drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (dragEnd) {
          setLastSelectedCell(dragEnd);
        }
      }
    };

    if (isDragging) {
      document.addEventListener("mouseup", handleMouseUp);
      return () => document.removeEventListener("mouseup", handleMouseUp);
    }
  }, [isDragging, dragEnd, setLastSelectedCell]);

  // Auto-size columns when data changes
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const newSizing: ColumnSizingState = {};
      const keys = Object.keys(data[0]);

      keys.forEach((key) => {
        newSizing[key] = calculateOptimalWidth(data, key);
      });

      setColumnSizing(newSizing);
      setUserResizedColumns(newSizing);
    }
  }, [data]); // Trigger when data changes

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => horizontalScrollRef.current,
    overscan: 10, // Lowered slightly, adjust as needed
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  const exportToCSV = () => {
    if (!data || !data.length) return;
    const visibleKeys = table.getVisibleLeafColumns().map((c) => c.id);
    const headers =
      visibleKeys.length > 0
        ? visibleKeys
        : data[0]
        ? Object.keys(data[0])
        : [];
    if (headers.length === 0) return;

    const csvRows = [headers.join(",")];
    // Export based on current filter, but original data (not paginated)
    const dataToExport = table
      .getFilteredRowModel()
      .rows.map((r) => r.original);

    for (const row of dataToExport) {
      const values = headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "string" && value.includes(","))
          return `"${value.replace(/"/g, '""')}"`;
        if (typeof value === "object" || typeof value === "bigint")
          return `"${safeStringify(value).replace(/"/g, '""')}"`;
        return String(value);
      });
      csvRows.push(values.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `duck-ui-export-${new Date().toISOString().slice(0, 19)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  const exportToJSON = () => {
    if (!data || !data.length) return;

    const dataToExport = table
      .getFilteredRowModel()
      .rows.map((r) => r.original);

    const jsonString = JSON.stringify(
      dataToExport,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );

    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `duck-ui-export-${new Date().toISOString().slice(0, 19)}.json`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Exported to JSON");
  };

  const exportToXLSX = async () => {
    if (!data || !data.length) return;

    try {
      // Dynamic import - only load XLSX when needed
      const XLSX = await import("xlsx");

      const dataToExport = table
        .getFilteredRowModel()
        .rows.map((r) => {
          // Handle BigInt for XLSX
          const row: Record<string, any> = {};
          Object.keys(r.original).forEach((key) => {
            const val = r.original[key];
            row[key] = typeof val === "bigint" ? val.toString() : val;
          });
          return row;
        });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      // Auto-size columns
      const maxWidth = 50;
      const colWidths = Object.keys(dataToExport[0] || {}).map((key) => ({
        wch: Math.min(
          maxWidth,
          Math.max(
            key.length,
            ...dataToExport.slice(0, 100).map((row) => String(row[key] || "").length)
          )
        ),
      }));
      worksheet["!cols"] = colWidths;

      XLSX.writeFile(
        workbook,
        `duck-ui-export-${new Date().toISOString().slice(0, 19)}.xlsx`
      );

      toast.success("Exported to Excel");
    } catch (error) {
      console.error("XLSX export failed:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const exportToDuckDB = async () => {
    if (!data || !data.length) return;

    try {
      toast.info("Preparing DuckDB export...");

      const dataToExport = table.getFilteredRowModel().rows.map((r) => r.original);

      // Get current connection from store
      const { connection, db } = useDuckStore.getState();
      if (!connection || !db) {
        throw new Error("Database not initialized");
      }

      // Use Parquet format (DuckDB native format)
      const fileName = `export_${new Date().toISOString().slice(0, 19)}.parquet`;

      // Create VALUES clause for the data
      const createValuesClause = () => {
        if (dataToExport.length === 0) return "";

        const keys = Object.keys(dataToExport[0]);
        const values = dataToExport.map((row) => {
          const rowValues = keys.map((key) => {
            const val = row[key];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === "bigint") return val.toString();
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return String(val);
          });
          return `(${rowValues.join(", ")})`;
        });

        return values.join(", ");
      };

      const valuesClause = createValuesClause();
      const keys = Object.keys(dataToExport[0]);

      await connection.query(
        `COPY (SELECT * FROM (VALUES ${valuesClause}) AS t(${keys.map(k => `"${k}"`).join(", ")})) TO '${fileName}' (FORMAT 'parquet')`
      );

      const buffer = await db.copyFileToBuffer(fileName);
      await db.dropFile(fileName);

      // Convert Uint8Array to ArrayBuffer for Blob compatibility
      const arrayBuffer = buffer.buffer.slice(0) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Exported to Parquet (DuckDB format)");
    } catch (error) {
      console.error("DuckDB export failed:", error);
      toast.error("Failed to export: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  // Save to folder functions
  const saveToFolderAsCSV = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const visibleKeys = table.getVisibleLeafColumns().map((c) => c.id);
      const headers = visibleKeys.length > 0 ? visibleKeys : data[0] ? Object.keys(data[0]) : [];
      if (headers.length === 0) return;

      const csvRows = [headers.join(",")];
      const dataToExport = table.getFilteredRowModel().rows.map((r) => r.original);

      for (const row of dataToExport) {
        const values = headers.map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          if (typeof value === "string" && value.includes(","))
            return `"${value.replace(/"/g, '""')}"`;
          if (typeof value === "object" || typeof value === "bigint")
            return `"${safeStringify(value).replace(/"/g, '""')}"`;
          return String(value);
        });
        csvRows.push(values.join(","));
      }

      const content = csvRows.join("\n");
      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;

      await fileSystemService.saveFile(folderId, fileName, content);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const saveToFolderAsJSON = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const dataToExport = table.getFilteredRowModel().rows.map((r) => r.original);
      const jsonString = JSON.stringify(
        dataToExport,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2
      );

      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      await fileSystemService.saveFile(folderId, fileName, jsonString);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const saveToFolderAsXLSX = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const XLSX = await import("xlsx");
      const dataToExport = table.getFilteredRowModel().rows.map((r) => {
        const row: Record<string, any> = {};
        Object.keys(r.original).forEach((key) => {
          const val = r.original[key];
          row[key] = typeof val === "bigint" ? val.toString() : val;
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      // Auto-size columns
      const maxWidth = 50;
      const colWidths = Object.keys(dataToExport[0] || {}).map((key) => ({
        wch: Math.min(
          maxWidth,
          Math.max(
            key.length,
            ...dataToExport.slice(0, 100).map((row) => String(row[key] || "").length)
          )
        ),
      }));
      worksheet["!cols"] = colWidths;

      const xlsxBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.xlsx`;

      await fileSystemService.saveFile(folderId, fileName, xlsxBuffer);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const saveToFolderAsParquet = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const dataToExport = table.getFilteredRowModel().rows.map((r) => r.original);
      const { connection, db } = useDuckStore.getState();

      if (!connection || !db) {
        throw new Error("Database not initialized");
      }

      const tempFileName = `temp_export_${Date.now()}.parquet`;

      const createValuesClause = () => {
        if (dataToExport.length === 0) return "";
        const keys = Object.keys(dataToExport[0]);
        const values = dataToExport.map((row) => {
          const rowValues = keys.map((key) => {
            const val = row[key];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === "bigint") return val.toString();
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return String(val);
          });
          return `(${rowValues.join(", ")})`;
        });
        return values.join(", ");
      };

      const valuesClause = createValuesClause();
      const keys = Object.keys(dataToExport[0]);

      await connection.query(
        `COPY (SELECT * FROM (VALUES ${valuesClause}) AS t(${keys.map(k => `"${k}"`).join(", ")})) TO '${tempFileName}' (FORMAT 'parquet')`
      );

      const buffer = await db.copyFileToBuffer(tempFileName);
      await db.dropFile(tempFileName);

      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.parquet`;
      // Create new ArrayBuffer copy to satisfy TypeScript
      const arrayBuffer = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(arrayBuffer).set(buffer);
      await fileSystemService.saveFile(folderId, fileName, arrayBuffer);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const toggleColumnVisibility = (columnId: string) => {
    setEnabledColumns((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  const toggleAllColumns = (value: boolean) => {
    if (!data || !data.length || !data[0]) return;
    setEnabledColumns(
      Object.keys(data[0]).reduce((acc, key) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, boolean>)
    );
  };

  const ColumnSelector = () => {
    if (!data || !data.length || !data[0]) return null;
    const allColumnKeys = Object.keys(data[0]);
    const visibleCount = Object.values(enabledColumns).filter(Boolean).length;
    const totalCount = allColumnKeys.length;

    // Memoize column keys to prevent re-renders
    const stableColumnKeys = useMemo(() => allColumnKeys, [JSON.stringify(allColumnKeys)]);

    // Simplified filtering for column selector
    const filteredColumnKeys = useMemo(() => {
      if (!columnSelectorFilter) return stableColumnKeys;
      return stableColumnKeys.filter((key) =>
        key.toLowerCase().includes(columnSelectorFilter.toLowerCase())
      );
    }, [stableColumnKeys, columnSelectorFilter]);

    return (
      <Card className="column-selector-panel absolute right-0 top-12 z-20 w-[350px] bg-background shadow-lg rounded-md border p-2">
        <CardContent className="p-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold">
              Toggle Columns{" "}
              <span className="text-xs text-muted-foreground">
                ({visibleCount}/{totalCount})
              </span>
            </h3>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => toggleAllColumns(true)}
              >
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => toggleAllColumns(false)}
              >
                None
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowColumnSelector(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={columnSelectorFilter}
              onChange={(e) => setColumnSelectorFilter(e.target.value)}
              placeholder="Filter columns..."
              className="pl-7 h-7 text-xs w-full"
            />
            {columnSelectorFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-5 w-5 p-0"
                onClick={() => setColumnSelectorFilter("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="h-[350px] pr-1 overflow-y-auto space-y-1">
            {filteredColumnKeys.map((columnId) => (
              <div key={columnId} className="flex items-center space-x-2 pl-1">
                <Checkbox
                  id={`column-sel-${columnId}`}
                  checked={enabledColumns[columnId] !== false}
                  onCheckedChange={() => toggleColumnVisibility(columnId)}
                />
                <label
                  htmlFor={`column-sel-${columnId}`}
                  className="text-xs cursor-pointer truncate max-w-[240px]"
                  title={columnId}
                >
                  {columnId}
                </label>
              </div>
            ))}
            {filteredColumnKeys.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                No columns match your filter.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const SpreadsheetOptions = () => {
    return (
      <Card className="spreadsheet-options-panel absolute right-0 top-12 z-20 w-[300px] bg-background shadow-lg rounded-md border p-2">
        <CardContent className="p-2">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">Spreadsheet Options</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setShowSpreadsheetOptions(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-row-numbers"
                checked={showRowNumbers}
                onCheckedChange={(checked) =>
                  setShowRowNumbers(checked === true)
                }
              />
              <label
                htmlFor="show-row-numbers"
                className="text-xs cursor-pointer"
              >
                Show row numbers
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="zebra-stripes"
                checked={zebraStripes}
                onCheckedChange={(checked) => setZebraStripes(checked === true)}
              />
              <label htmlFor="zebra-stripes" className="text-xs cursor-pointer">
                Zebra stripes
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-grid-lines"
                checked={showGridLines}
                onCheckedChange={(checked) =>
                  setShowGridLines(checked === true)
                }
              />
              <label
                htmlFor="show-grid-lines"
                className="text-xs cursor-pointer"
              >
                Show grid lines
              </label>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const ContextMenu = () => {
    if (!contextMenu) return null;

    return (
      <div
        className="context-menu fixed z-20 bg-background border border-border rounded-md shadow-lg py-1 min-w-[160px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={() => {
            // Trigger copy
            const e = new KeyboardEvent("keydown", { key: "c", ctrlKey: true });
            window.dispatchEvent(e);
            setContextMenu(null);
          }}
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={() => {
            // Select all
            const e = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
            window.dispatchEvent(e);
            setContextMenu(null);
          }}
        >
          <MousePointer className="h-3 w-3" />
          Select All
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={() => {
            // Select row
            if (selectedCells.size > 0) {
              const firstCell = Array.from(selectedCells)[0];
              const rowIndex = parseInt(firstCell.split("::")[0]);
              if (data[0]) {
                const rowCells = new Set<string>();
                Object.keys(data[0]).forEach((key) => {
                  if (key !== "__row_number__") {
                    rowCells.add(`${rowIndex}::${key}`);
                  }
                });
                setSelectedCells(rowCells);
              }
            }
            setContextMenu(null);
          }}
        >
          <MoreHorizontal className="h-3 w-3" />
          Select Row
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={() => {
            // Select column
            if (selectedCells.size > 0) {
              const firstCell = Array.from(selectedCells)[0];
              const colId = firstCell.split("::")[1];
              if (colId) {
                const colCells = new Set<string>();
                for (let i = 0; i < data.length; i++) {
                  colCells.add(`${i}::${colId}`);
                }
                setSelectedCells(colCells);
              }
            }
            setContextMenu(null);
          }}
        >
          <MoreHorizontal className="h-3 w-3 rotate-90" />
          Select Column
        </button>
        <hr className="my-1 border-border" />
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={() => {
            exportToCSV();
            setContextMenu(null);
          }}
        >
          <Download className="h-3 w-3" />
          Export...
        </button>
      </div>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-32 text-muted-foreground">
        No data available.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        className="flex flex-col h-full w-full min-w-0 overflow-hidden"
        ref={tableContainerRef}
      >
        {/* Top controls area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 flex-shrink-0 mt-2 px-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search all columns..."
                value={globalFilterInput}
                onChange={(e) => setGlobalFilterInput(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGlobalFilterInput("");
                table.resetColumnFilters(true);
              }}
              className="h-8 text-xs"
              disabled={
                !globalFilterInput && !table.getState().columnFilters.length
              }
            >
              Clear Filters
            </Button>
          </div>
          <div className="hidden md:flex items-center gap-x-4 text-xs text-muted-foreground px-2">
            {executionTime !== null && executionTime !== undefined && (
              <div
                className="flex items-center gap-1"
                title="Query execution time"
              >
                <Clock className="h-3 w-3" />
                <span>{formatDuration(executionTime)}</span>
              </div>
            )}
            {responseSize !== null && responseSize !== undefined && (
              <div className="flex items-center" title="Response size">
                <span>{formatBytes(responseSize)}</span>
              </div>
            )}
            <span title="Showing rows count">
              {data.length.toLocaleString()} rows
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowStatsPanel(!showStatsPanel);
                if (!showStatsPanel) setStatsPanelMinimized(false);
              }}
              className="h-8 text-xs"
              title="Show column statistics"
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" />
              Stats
            </Button>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="h-8 text-xs"
                title="Configure visible columns"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                Columns
              </Button>
              {showColumnSelector && <ColumnSelector />}
            </div>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setShowSpreadsheetOptions(!showSpreadsheetOptions)
                }
                className="h-8 text-xs"
                title="Spreadsheet display options"
              >
                <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                View
              </Button>
              {showSpreadsheetOptions && <SpreadsheetOptions />}
            </div>
            {Object.keys(userResizedColumns).length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserResizedColumns({})}
                className="h-8 text-xs"
                title="Reset column widths"
              >
                Reset Size
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!data || !data.length}
                  title="Export data in various formats"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToCSV}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToJSON}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToXLSX}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as Excel (XLSX)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToDuckDB}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as Parquet
                </DropdownMenuItem>

                {/* Save to Folder submenu */}
                {mountedFolders.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderOpen className="mr-2 h-3.5 w-3.5" />
                        Save to Folder
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {mountedFolders.map((folder) => (
                          <DropdownMenuSub key={folder.id}>
                            <DropdownMenuSubTrigger>
                              <FolderOpen className="mr-2 h-3.5 w-3.5" />
                              {folder.name}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem onClick={() => saveToFolderAsCSV(folder.id, folder.name)}>
                                <FileText className="mr-2 h-3.5 w-3.5" />
                                Save as CSV
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => saveToFolderAsJSON(folder.id, folder.name)}>
                                <FileJson className="mr-2 h-3.5 w-3.5" />
                                Save as JSON
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => saveToFolderAsXLSX(folder.id, folder.name)}>
                                <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                                Save as Excel (XLSX)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => saveToFolderAsParquet(folder.id, folder.name)}>
                                <FileArchive className="mr-2 h-3.5 w-3.5" />
                                Save as Parquet
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Selection indicator */}
            {selectedCells.size > 0 && (
              <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-primary/10 rounded-md border">
                <span className="text-xs text-muted-foreground">
                  {selectedCells.size} cell{selectedCells.size !== 1 ? "s" : ""}{" "}
                  selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCells(new Set())}
                  className="h-6 px-2 text-xs hover:bg-primary/20"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Main table area */}
        <div
          className={`flex-1 rounded-md bg-card relative overflow-hidden ${
            showGridLines ? "border-2" : "border"
          } border-border`}
        >
          <div
            ref={horizontalScrollRef}
            className="h-full w-full overflow-auto"
            style={{
              height:
                typeof tableHeight === "string"
                  ? tableHeight
                  : `${tableHeight}px`,
              maxWidth: "100%",
            }}
          >
            <div
              style={{
                width: table.getTotalSize(),
                minWidth: "100%",
                maxWidth: "max-content",
                position: "relative",
              }}
            >
              <table
                className={`w-full border-collapse table-fixed ${
                  showGridLines ? "border-spacing-0" : ""
                }`}
              >
                <thead
                  className={`sticky top-0 z-10 bg-muted/70 backdrop-blur-sm ${
                    showGridLines ? "border-b-2 border-border" : "shadow-sm"
                  }`}
                >
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b border-border/40"
                    >
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className={`h-9 px-0 text-left align-middle font-medium text-muted-foreground whitespace-nowrap text-xs relative select-none ${
                            showGridLines ? "border-r border-border/50" : ""
                          }`}
                          style={{
                            width: header.getSize(),
                            minWidth: header.column.columnDef.minSize, // From columnDef
                            maxWidth: header.column.columnDef.maxSize, // From columnDef
                          }}
                        >
                          <div className="flex items-center justify-between w-full h-full px-2">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </div>
                          {header.column.getCanResize() && (
                            <div
                              className={`absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none group ${
                                header.column.getIsResizing()
                                  ? "bg-primary/20"
                                  : ""
                              }`}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              style={{ userSelect: "none" }}
                            >
                              <div
                                className={`w-[1px] h-4/6 my-auto ${
                                  header.column.getIsResizing()
                                    ? "bg-primary w-[2px]"
                                    : "bg-border/60 group-hover:bg-primary/60 group-hover:w-[2px]"
                                }`}
                              />
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody
                  className="bg-card text-card-foreground relative"
                  style={{ userSelect: isDragging ? "none" : "auto" }}
                >
                  {paddingTop > 0 && (
                    <tr style={{ height: `${paddingTop}px` }}>
                      <td colSpan={table.getVisibleLeafColumns().length} />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <tr
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        className={`transition-colors ${
                          zebraStripes && virtualRow.index % 2 === 0
                            ? "hover:bg-muted/40" // Stronger hover for zebra striped rows
                            : "hover:bg-muted/20" // Subtle hover for regular rows
                        } ${row.getIsSelected() ? "bg-muted" : ""} ${
                          zebraStripes && virtualRow.index % 2 === 0
                            ? "bg-muted/20"
                            : "bg-background"
                        } ${showGridLines ? "border-b border-border/30" : ""}`}
                        style={{ height: `${ROW_HEIGHT}px` }} // Use fixed ROW_HEIGHT
                      >
                        {row.getVisibleCells().map((cell) => {
                          const cellKey = `${virtualRow.index}::${cell.column.id}`;
                          const isSelected = selectedCells.has(cellKey);

                          return (
                            <td
                              key={cell.id}
                              className={`align-middle overflow-hidden relative ${
                                showGridLines ? "border-r border-border/30" : ""
                              } ${
                                isSelected
                                  ? "bg-primary/20 ring-1 ring-primary/30"
                                  : ""
                              } ${
                                isDragging ? "cursor-crosshair" : "cursor-cell"
                              }`}
                              style={{
                                width: cell.column.getSize(),
                                minWidth: cell.column.columnDef.minSize,
                                maxWidth: cell.column.columnDef.maxSize,
                              }}
                              onMouseDown={(e) => {
                                if (
                                  cell.column.id !== "__row_number__" &&
                                  e.button === 0
                                ) {
                                  e.preventDefault();
                                  const currentPosition = {
                                    row: virtualRow.index,
                                    col: cell.column.id,
                                  };

                                  if (e.shiftKey && lastSelectedCell) {
                                    // Shift+click: select rectangular range using helper function
                                    const rangeSelection = createSelectionRange(
                                      lastSelectedCell,
                                      currentPosition
                                    );
                                    setSelectedCells(rangeSelection);
                                  } else if (e.ctrlKey || e.metaKey) {
                                    // Ctrl/Cmd+click: toggle cell in selection
                                    const newSelection = new Set(selectedCells);
                                    if (newSelection.has(cellKey)) {
                                      newSelection.delete(cellKey);
                                    } else {
                                      newSelection.add(cellKey);
                                    }
                                    setSelectedCells(newSelection);
                                    setLastSelectedCell(currentPosition);
                                  } else {
                                    // Regular click: select only this cell and start drag
                                    setSelectedCells(new Set([cellKey]));
                                    setLastSelectedCell(currentPosition);

                                    // Start drag selection
                                    setIsDragging(true);
                                    setDragStart(currentPosition);
                                    setDragEnd(currentPosition);
                                  }
                                }
                              }}
                              onMouseEnter={() => {
                                if (
                                  isDragging &&
                                  dragStart &&
                                  cell.column.id !== "__row_number__"
                                ) {
                                  const currentPosition = {
                                    row: virtualRow.index,
                                    col: cell.column.id,
                                  };
                                  setDragEnd(currentPosition);

                                  // Update selection during drag
                                  const dragSelection = createSelectionRange(
                                    dragStart,
                                    currentPosition
                                  );
                                  setSelectedCells(dragSelection);
                                }
                              }}
                              onContextMenu={(e) => {
                                if (cell.column.id !== "__row_number__") {
                                  e.preventDefault();
                                  setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                  });
                                  if (!selectedCells.has(cellKey)) {
                                    setSelectedCells(new Set([cellKey]));
                                  }
                                }
                              }}
                              onDoubleClick={() => {
                                if (cell.column.id !== "__row_number__") {
                                  const cellValue = cell.getValue();
                                  setViewedCell({
                                    value: cellValue,
                                    columnName: cell.column.id,
                                    rowIndex: virtualRow.index,
                                  });
                                }
                              }}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr style={{ height: `${paddingBottom}px` }}>
                      <td colSpan={table.getVisibleFlatColumns().length} />
                    </tr>
                  )}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length || 1}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No results match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between mt-4 flex-shrink-0 mb-2 px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="h-7 w-7 p-0 text-xs"
              title="First page"
            >
              ««
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 w-7 p-0 text-xs"
              title="Previous page"
            >
              «
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 w-7 p-0 text-xs"
              title="Next page"
            >
              »
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="h-7 w-7 p-0 text-xs"
              title="Last page"
            >
              »»
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="text-xs border border-border/40 rounded-md h-7 px-2 bg-background"
              title="Rows per page"
            >
              {[10, 25, 50, 100, 200, 500, 1000, 5000, 10000].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} rows
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Context Menu */}
        <ContextMenu />

        {/* Cell Value Viewer */}
        {viewedCell && (
          <CellValueViewer
            value={viewedCell.value}
            columnName={viewedCell.columnName}
            rowIndex={viewedCell.rowIndex}
            onClose={() => setViewedCell(null)}
          />
        )}

        {/* Column Stats Panel */}
        {showStatsPanel && (
          <ColumnStatsPanel
            data={table.getFilteredRowModel().rows.map((r) => r.original)}
            onClose={() => setShowStatsPanel(false)}
            isMinimized={statsPanelMinimized}
            onToggleMinimize={() => setStatsPanelMinimized(!statsPanelMinimized)}
          />
        )}

        {/* Mobile stats */}
        <div className="md:hidden flex items-center justify-between text-xs text-muted-foreground py-2 border-t border-border/30 mt-2 flex-shrink-0">
          <span>
            {table.getFilteredRowModel().rows.length} of {data.length} rows
          </span>
          <div className="flex items-center gap-x-3">
            {executionTime !== null && executionTime !== undefined && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(executionTime)}</span>
              </div>
            )}
            {responseSize !== null && responseSize !== undefined && (
              <div className="flex items-center">
                <span>{formatBytes(responseSize)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default DuckUITable;

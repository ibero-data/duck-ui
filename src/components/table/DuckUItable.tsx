import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  flexRender,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  RowData,
  VisibilityState,
  Row,
  ColumnFiltersState,
  getPaginationRowModel,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns,
  RefreshCw,
  Loader2, // Import Loader2 for loading state
} from "lucide-react";
import DownloadDialog from "@/components/table/DownloadDialog";
import { SimpleFilter } from "@/components/table/SimpleFilter"; // Import SimpleFilter
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components
import { Label } from "@/components/ui/label";

// Constants
const DEFAULT_COLUMN_SIZE = 150;
const MIN_COLUMN_SIZE = 50;
const OVERSCAN_COUNT = 5;
const ROW_HEIGHT = 35;
const DEFAULT_PAGE_SIZE = 50; // Changed to 50
const PAGE_SIZE_OPTIONS = [50, 100, 200, 400]; // Available page size options

// Types
export interface TableMeta {
  name: string;
  type: string;
}

export interface TableResult<T extends RowData> {
  columns?: string[];
  columnTypes?: string[];
  data?: T[];
  message?: string;
  query_id?: string;
}

export interface TableProps<T extends RowData> {
  result: TableResult<T>;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  virtualScrolling?: boolean;
  defaultSorting?: SortingState;
  defaultColumnVisibility?: VisibilityState;
  onSortingChange?: (sorting: SortingState) => void;
  className?: string;
  query?: string;
}

function DuckUiTable<T extends RowData>({
  result,
  onLoadMore,
  onRefresh,
  isLoading = false,
  virtualScrolling = true,
  defaultSorting = [],
  defaultColumnVisibility = {},
  onSortingChange,
  className,
  query,
}: TableProps<T>) {
  // State
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    defaultColumnVisibility
  );
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState(""); // Use globalFilter
  const [, setFilterValue] = useState("");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE, // Use default page size
  });

  // Refs
  const sizeCache = useRef<Record<string, number>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  const resizeTimeout = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null); // Add observer ref

  const { columns, data, message, query_id } = result;

  // Error handling
  if (message) {
    useEffect(() => {
      toast.error(`Error: ${message}`);
    }, [message]); // Display toast on message change

    return (
      <div className="w-full mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
          Query ID: {query_id || "Unknown"}
        </p>
      </div>
    );
  }

  if (!data || !columns) {
    return (
      <div className="w-full mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
      </div>
    );
  }

  // Handle column resize
  const handleColumnResize = useCallback((size: number, columnId: string) => {
    if (resizeTimeout.current) {
      clearTimeout(resizeTimeout.current);
    }

    resizeTimeout.current = setTimeout(() => {
      setColumnSizing((prev) => ({
        ...prev,
        [columnId]: Math.max(MIN_COLUMN_SIZE, size),
      }));
    }, 10);
  }, []);

  // Update your memoizedColumns definition
  const memoizedColumns = useMemo<ColumnDef<T>[]>(() => {
    const baseColumns = columns.map((col) => ({
      id: col,
      accessorKey: col,
      header: col,
      enableResizing: true,
      size: columnSizing[col] || DEFAULT_COLUMN_SIZE,
      minSize: MIN_COLUMN_SIZE,
      cell: ({ row }: any) => {
        return String(row.original[col] ?? "");
      },
    }));

    return [
      {
        id: "__index",
        header: "#",
        size: 70,
        minSize: 50,
        maxSize: 70,
        enableResizing: false, // Disable resizing of index column.  Consider making this configurable
        cell: (info) => (
          <span className="font-mono tabular-nums">{info.row.index + 1}</span>
        ),
      },
      ...baseColumns,
    ];
  }, [columns, columnSizing]);

  // Table instance
  const table = useReactTable({
    data: data || [],
    columns: memoizedColumns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      globalFilter, // Use globalFilter state
      pagination,
      columnSizing,
    },
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      onSortingChange?.(newSorting);
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter, // Use setGlobalFilter
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      setPagination(newPagination);
    },
    onColumnSizingChange: (updater) => {
      const newSizing =
        typeof updater === "function" ? updater(columnSizing) : updater;
      setColumnSizing(newSizing);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    globalFilterFn: (row, columnId, filterValue) => {
      const searchValue = String(filterValue).toLowerCase().trim();
      if (!searchValue) return true;

      const cellValue = row.getValue(columnId);
      if (cellValue == null) return false;

      return String(cellValue).toLowerCase().includes(searchValue);
    },
  });

  // Virtual scrolling setup
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: OVERSCAN_COUNT,
  });

  const virtualRows = virtualScrolling
    ? rowVirtualizer.getVirtualItems()
    : rows.map((_, index) => ({
        index,
        start: index * ROW_HEIGHT,
        size: ROW_HEIGHT,
      }));

  // Column auto-sizing
  const calculateAutoSize = useCallback(
    (columnId: string) => {
      if (sizeCache.current[columnId]) return sizeCache.current[columnId];

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return DEFAULT_COLUMN_SIZE;

      context.font = getComputedStyle(document.body).font || "12px sans-serif";
      const headerWidth = context.measureText(columnId).width + 24;
      let maxWidth = headerWidth;

      const sampleRows = rows.slice(0, 200);
      for (const row of sampleRows) {
        const value = row.getValue(columnId);
        const width = context.measureText(String(value ?? "")).width + 24;
        maxWidth = Math.max(maxWidth, width);
      }

      const finalSize = Math.max(maxWidth, MIN_COLUMN_SIZE);
      sizeCache.current[columnId] = finalSize;
      return finalSize;
    },
    [rows]
  );

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterValue(value); // Update the filterValue state (optional, for debugging)
      setGlobalFilter(value); // Update globalFilter state, which triggers filtering
    },
    [setGlobalFilter]
  );

  // Load more effect (Corrected)
  useEffect(() => {
    // Disconnect previous observer if it exists
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!onLoadMore || !loadMoreRef.current || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.8 }
    );

    observerRef.current = observer; // Store the observer in the ref
    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect(); // Disconnect observer on unmount
      observerRef.current = null;
    };
  }, [
    onLoadMore,
    isLoading,
    globalFilter,
    table.getState().pagination.pageSize,
  ]);

  // Effects
  useEffect(() => {
    table.setPageSize(DEFAULT_PAGE_SIZE);
  }, [table]);

  // Render methods
  const renderCell = useCallback((cell: any) => {
    return flexRender(cell.column.columnDef.cell, cell.getContext());
  }, []);

  const TableRow = ({ row }: { row: Row<T> }) => (
    <tr
      key={row.id}
      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-xs"
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          style={{ width: cell.column.getSize() }}
          className="p-2 border dark:border-gray-700 truncate"
        >
          {renderCell(cell)}
        </td>
      ))}
    </tr>
  );

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualRows[virtualRows.length - 1].start || 0) -
        virtualRows[virtualRows.length - 1].size
      : 0;

  return (
    <div className={`w-full h-full flex min-h-[200px] flex-col ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between p-2 border-b dark:border-gray-700">
        <div className="flex items-center space-x-2 flex-1">
          {/* Simple Filter */}
          <div className="flex-1">
            <SimpleFilter
              onFilterChange={handleFilterChange}
              className="w-full"
            />
          </div>

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="max-h-64 overflow-auto">
                {table
                  .getAllColumns()
                  .filter((col) => col.id !== "__index")
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      className="text-sm"
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DownloadDialog data={data || []} query={query} />

          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-8"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" /> // Show loader when refreshing
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Pagination controls */}
        <div className="flex items-center space-x-2">
          {/* First Page Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 p-0"
                >
                  <ChevronsLeft size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>First Page</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Previous Page Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous Page</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Page Number Display */}
          <span className="text-gray-600 dark:text-gray-300 min-w-[100px] text-center text-xs">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>

          {/* Next Page Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next Page</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Last Page Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 p-0"
                >
                  <ChevronsRight size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Last Page</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Page Size Selector */}
          <div className="flex items-center space-x-2">
            <Label htmlFor="page-size" className="text-xs text-gray-500">
              Rows:
            </Label>
            <Select onValueChange={(value) => table.setPageSize(Number(value))}>
              <SelectTrigger className="w-[70px] h-8 text-xs">
                <SelectValue
                  placeholder={String(table.getState().pagination.pageSize)}
                />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table content */}
      <div
        ref={tableContainerRef}
        className="relative flex-1 overflow-auto w-full"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          <table className="w-full table-fixed">
            <colgroup>
              {table.getAllColumns().map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
            </colgroup>

            <thead className="sticky top-0 z-1 bg-gray-50 dark:bg-gray-800">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={`
                        relative p-2 text-left font-medium text-gray-600 dark:text-gray-200
                        border-b dark:border-gray-700 text-xs select-none
                        ${header.column.getCanSort() ? "cursor-pointer" : ""}
                    `}
                      onClick={
                        header.column.getCanSort()
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        {header.column.getIsSorted() && (
                          <span className="text-primary">
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                      </div>

                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => {
                            const newSize = calculateAutoSize(header.column.id);
                            handleColumnResize(newSize, header.column.id);
                          }}
                          className={`
                        absolute right-0 top-0 h-full w-1
                        cursor-col-resize select-none touch-none
                        bg-gray-300 dark:bg-gray-600
                        hover:bg-primary/50
                         ${
                           header.column.getIsResizing() ? "bg-primary w-1" : ""
                         }
                         transition-colors
                     `}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody>
              {paddingTop > 0 && (
                <tr>
                  <td
                    style={{ height: `${paddingTop}px` }}
                    colSpan={memoizedColumns.length}
                  />
                </tr>
              )}

              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return <TableRow key={row.id} row={row} />;
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td
                    style={{ height: `${paddingBottom}px` }}
                    colSpan={memoizedColumns.length}
                  />
                </tr>
              )}
              {onLoadMore && (
                <tr ref={loadMoreRef}>
                  <td
                    colSpan={memoizedColumns.length}
                    className="text-center p-4"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading more...</span>
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">
                        Scroll to load more
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer with stats */}
      <div className="p-2 border-t dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {table.getFilteredRowModel().rows.length.toLocaleString()} of{" "}
            {table.getPreFilteredRowModel().rows.length.toLocaleString()} rows
          </span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(DuckUiTable) as typeof DuckUiTable;

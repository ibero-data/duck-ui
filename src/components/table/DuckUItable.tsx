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
  Loader2,
  BarChart,
  LineChart,
  PieChart,
} from "lucide-react";
import DownloadDialog from "@/components/table/DownloadDialog";
import { SimpleFilter } from "@/components/table/SimpleFilter";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactECharts from "echarts-for-react";

// Constants
const DEFAULT_COLUMN_SIZE = 150;
const MIN_COLUMN_SIZE = 50;
const OVERSCAN_COUNT = 5;
const ROW_HEIGHT = 35;
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 400];

// Chart types
const CHART_TYPES = [
  { value: "bar", label: "Bar Chart", icon: BarChart },
  { value: "line", label: "Line Chart", icon: LineChart },
  { value: "pie", label: "Pie Chart", icon: PieChart },
];

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
  const [globalFilter, setGlobalFilter] = useState("");
  const [, setFilterValue] = useState("");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [activeTab, setActiveTab] = useState<string>("table");
  const [chartType, setChartType] = useState<string>("bar");
  const [chartColumns, setChartColumns] = useState<{
    category: string;
    values: string[];
  }>({ category: "", values: [] });

  // Refs
  const sizeCache = useRef<Record<string, number>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  const resizeTimeout = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { columns, data, message, query_id } = result;

  // Error handling
  if (message) {
    useEffect(() => {
      toast.error(`Error: ${message}`);
    }, [message]);

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

  // Initialize chart columns when data is available
  useEffect(() => {
    if (columns && columns.length > 0) {
      // Default to first column as category and second column as value
      setChartColumns({
        category: columns[1] || "",
        values: columns.length > 2 ? [columns[2]] : [],
      });
    }
  }, [columns]);

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
        enableResizing: false,
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
      globalFilter,
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
    onGlobalFilterChange: setGlobalFilter,
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

  // Handle filter change
  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterValue(value);
      setGlobalFilter(value);
    },
    [setGlobalFilter]
  );

  // Handle chart column selection
  const handleChartColumnChange = useCallback(
    (type: "category" | "values", value: string | string[]) => {
      setChartColumns((prev) => ({
        ...prev,
        [type]: value,
      }));
    },
    []
  );

  // Load more effect
  useEffect(() => {
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

    observerRef.current = observer;
    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
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

  // Chart data processing
  const getChartOptions = useMemo(() => {
    if (!data || !chartColumns.category || chartColumns.values.length === 0) {
      return {};
    }

    const filteredData = table.getFilteredRowModel().rows.map((row) => row.original);
    
    // Process data based on chart type
    if (chartType === "pie") {
      return {
        title: {
          text: `Distribution by ${chartColumns.category}`,
          left: 'center',
        },
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          data: filteredData.map((item: any) => String(item[chartColumns.category] || 'Undefined'))
        },
        series: [
          {
            name: chartColumns.values[0],
            type: 'pie',
            radius: '60%',
            center: ['50%', '50%'],
            data: filteredData.map((item: any) => ({
              name: String(item[chartColumns.category] || 'Undefined'),
              value: Number(item[chartColumns.values[0]]) || 0
            })),
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }
        ]
      };
    }
    
    // Bar and line charts
    const categories = Array.from(new Set(filteredData.map((item: any) => 
      String(item[chartColumns.category] || 'Undefined'))));
    
    const series = chartColumns.values.map(valueCol => ({
      name: valueCol,
      type: chartType,
      data: categories.map(cat => {
        const items = filteredData.filter((item: any) => 
          String(item[chartColumns.category]) === cat);
        // Sum values for this category
        return items.reduce((sum, item: any) => 
          sum + (Number(item[valueCol]) || 0), 0);
      })
    }));

    return {
      title: {
        text: `${chartType === 'bar' ? 'Bar' : 'Line'} Chart by ${chartColumns.category}`,
        left: 'center'
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: chartColumns.values,
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          rotate: categories.length > 10 ? 45 : 0,
          interval: 0
        }
      },
      yAxis: {
        type: 'value'
      },
      series
    };
  }, [data, chartType, chartColumns, table]);

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
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Pagination controls */}
        <div className="flex items-center space-x-2">
          {activeTab === "table" && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b dark:border-gray-700">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 max-w-[200px] mx-2 my-1">
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* Table View */}
        <div className={`h-full ${activeTab !== "table" ? "hidden" : ""}`}>
          <div
            ref={tableContainerRef}
            className="relative flex-1 overflow-auto w-full h-full"
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
        </div>

        {/* Chart View */}
        <div className={`flex flex-col h-full ${activeTab !== "charts" ? "hidden" : ""}`}>
          <div className="p-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Chart Type Selection */}
              <div>
                <Label htmlFor="chart-type" className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                  Chart Type
                </Label>
                <Select value={chartType} onValueChange={setChartType}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select chart type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHART_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="flex items-center">
                        <span className="flex items-center">
                          {React.createElement(type.icon, { className: "h-4 w-4 mr-2" })}
                          {type.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category Selection */}
              <div>
                <Label htmlFor="category-column" className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                  Category Column
                </Label>
                <Select 
                  value={chartColumns.category} 
                  onValueChange={(value) => handleChartColumnChange("category", value)}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select category column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns
                      .filter(col => col !== "__index") // Exclude index column
                      .map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value Selection */}
              <div>
                <Label htmlFor="value-column" className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                  Value Column
                </Label>
                <Select 
                  value={chartColumns.values[0] || ""} 
                  onValueChange={(value) => handleChartColumnChange("values", [value])}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select value column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns
                      .filter(col => col !== "__index" && col !== chartColumns.category) // Exclude index and category
                      .map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Chart Display */}
          <div className="flex-1 overflow-auto p-4">
            {Object.keys(getChartOptions).length > 0 ? (
              <ReactECharts 
                option={getChartOptions} 
                style={{ height: '100%', minHeight: '300px', width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
                <p>Select chart options to visualize data</p>
              </div>
            )}
          </div>
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

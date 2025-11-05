// file: src/components/table/ColumnStatsPanel.tsx
// description: Table component
// reference: https://tanstack.com/table

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTheme } from "@/components/theme/theme-provider";

type DataRow = Record<string, any>;

interface ColumnStats {
  columnName: string;
  totalCount: number;
  nullCount: number;
  uniqueCount: number;
  dataType: string;
  min?: number | string;
  max?: number | string;
  avg?: number;
  topValues?: { value: any; count: number }[];
}

interface ColumnStatsPanelProps {
  data: DataRow[];
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

const calculateColumnStats = (data: DataRow[], columnName: string): ColumnStats => {
  const values = data.map((row) => row[columnName]);
  const totalCount = values.length;
  const nullCount = values.filter((v) => v === null || v === undefined).length;
  const nonNullValues = values.filter((v) => v !== null && v !== undefined);
  const uniqueValues = new Set(nonNullValues);
  const uniqueCount = uniqueValues.size;

  // Determine data type
  let dataType = "mixed";
  if (nonNullValues.length > 0) {
    const firstValue = nonNullValues[0];
    if (typeof firstValue === "number" || typeof firstValue === "bigint") {
      dataType = "number";
    } else if (typeof firstValue === "string") {
      dataType = "string";
    } else if (typeof firstValue === "boolean") {
      dataType = "boolean";
    } else if (firstValue instanceof Date) {
      dataType = "date";
    }
  }

  const stats: ColumnStats = {
    columnName,
    totalCount,
    nullCount,
    uniqueCount,
    dataType,
  };

  // Calculate stats for numeric columns
  if (dataType === "number") {
    const numericValues = nonNullValues.map((v) =>
      typeof v === "bigint" ? Number(v) : v
    ) as number[];
    if (numericValues.length > 0) {
      stats.min = Math.min(...numericValues);
      stats.max = Math.max(...numericValues);
      stats.avg =
        numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;
    }
  }

  // Calculate top values (for categorical data)
  if (dataType === "string" || dataType === "boolean" || uniqueCount <= 20) {
    const valueCounts = new Map<any, number>();
    nonNullValues.forEach((value) => {
      const key = String(value);
      valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
    });

    stats.topValues = Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  return stats;
};

const MiniChart: React.FC<{ stats: ColumnStats }> = ({ stats }) => {
  const { theme } = useTheme();

  if (!stats.topValues || stats.topValues.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No chart data available
      </div>
    );
  }

  const chartData = stats.topValues.slice(0, 8).map((item) => ({
    name:
      String(item.value).length > 15
        ? String(item.value).substring(0, 15) + "..."
        : String(item.value),
    value: item.count,
  }));

  const colors = theme === "dark"
    ? ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"]
    : ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ top: 15, right: 15, bottom: 20, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10 }}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            fontSize: "12px",
            color: theme === "dark" ? "#65fc2eff" : "#0f172a",
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const ColumnStatCard: React.FC<{ stats: ColumnStats }> = ({ stats }) => {
  return (
    <Card className="w-full">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-medium truncate" title={stats.columnName}>
          {stats.columnName}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{stats.dataType}</p>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Total:</span>{" "}
            <span className="font-medium">{stats.totalCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Unique:</span>{" "}
            <span className="font-medium">{stats.uniqueCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Nulls:</span>{" "}
            <span className="font-medium">{stats.nullCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Fill:</span>{" "}
            <span className="font-medium">
              {((((stats.totalCount - stats.nullCount) / stats.totalCount) * 100) || 0).toFixed(1)}%
            </span>
          </div>
        </div>

        {stats.dataType === "number" && stats.min !== undefined && (
          <div className="text-xs space-y-1 pt-1 border-t">
            <div>
              <span className="text-muted-foreground">Min:</span>{" "}
              <span className="font-mono">{Number(stats.min).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Max:</span>{" "}
              <span className="font-mono">{Number(stats.max).toLocaleString()}</span>
            </div>
            {stats.avg !== undefined && (
              <div>
                <span className="text-muted-foreground">Avg:</span>{" "}
                <span className="font-mono">{stats.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <MiniChart stats={stats} />
        </div>
      </CardContent>
    </Card>
  );
};

export const ColumnStatsPanel: React.FC<ColumnStatsPanelProps> = ({
  data,
  onClose,
  isMinimized,
  onToggleMinimize,
}) => {
  const columnStats = useMemo(() => {
    if (!data || data.length === 0 || !data[0]) return [];

    const columns = Object.keys(data[0]).filter((key) => key !== "__row_number__");
    return columns.map((col) => calculateColumnStats(data, col));
  }, [data]);

  if (isMinimized) {
    return (
      <Card className="fixed bottom-4 left-4 z-30 w-[300px] shadow-lg border">
        <CardHeader className="p-3 cursor-pointer" onClick={onToggleMinimize}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Column Statistics ({columnStats.length} columns)
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMinimize();
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
    <Card className="fixed bottom-4 left-4 z-30 w-7xl shadow-lg border">
      <CardHeader className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Column Statistics</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {columnStats.length} columns • {data.length.toLocaleString()} rows
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onToggleMinimize}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-auto">
          {columnStats.map((stats) => (
            <ColumnStatCard key={stats.columnName} stats={stats} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ColumnStatsPanel;

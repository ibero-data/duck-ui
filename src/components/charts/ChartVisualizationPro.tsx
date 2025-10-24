/**
 * Professional Chart Visualization Component
 * Features: Multi-series, advanced chart types, customization, export
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Download,
  Settings2,
  X,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import { CustomChartTooltip } from "./CustomChartTooltip";
import { formatNumber, shortenLabel } from "@/lib/chartUtils";
import { transformData, isNumericColumn, suggestChartTypes } from "@/lib/chartDataTransform";
import { exportChartAsPNG } from "@/lib/chartExport";
import type { QueryResult, ChartConfig, ChartType } from "@/store";

interface ChartVisualizationProProps {
  result: QueryResult;
  chartConfig?: ChartConfig;
  onConfigChange: (config: ChartConfig | undefined) => void;
}

// Enhanced color palette
const DEFAULT_COLORS = [
  "#D99B43",
  "#8B5CF6",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
  "#F97316",
];

export const ChartVisualizationPro: React.FC<ChartVisualizationProProps> = ({
  result,
  chartConfig,
  onConfigChange,
}) => {
  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  const [localConfig, setLocalConfig] = useState<ChartConfig>(
    chartConfig || {
      type: "bar",
      xAxis: "",
      yAxis: "",
      colors: DEFAULT_COLORS,
      showGrid: true,
      enableAnimations: false,
      legend: { show: true, position: "top" },
    }
  );

  const [showCustomization, setShowCustomization] = useState(false);
  const [selectedYColumns, setSelectedYColumns] = useState<string[]>([]);

  // Auto-select first columns if not set
  useEffect(() => {
    if (result.columns.length > 0 && !localConfig.xAxis) {
      const numericColumns = result.columns.filter((col) =>
        isNumericColumn(result.data, col)
      );

      setLocalConfig({
        ...localConfig,
        xAxis: result.columns[0] || "",
        yAxis: numericColumns[0] || result.columns[1] || "",
      });
    }
  }, [result.columns]);

  // Transform data based on configuration
  const transformedData = useMemo(() => {
    return transformData(
      result,
      localConfig.transform,
      localConfig.xAxis,
      localConfig.yAxis || localConfig.series
    );
  }, [result, localConfig.transform, localConfig.xAxis, localConfig.yAxis, localConfig.series]);

  const handleConfigChange = (updates: Partial<ChartConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
  };

  const applyConfig = () => {
    // Build series configuration from selected Y columns
    const series = selectedYColumns.map((col, idx) => ({
      column: col,
      label: col,
      color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    }));

    // Update config with selected Y columns as series
    const updatedConfig = {
      ...localConfig,
      series: series.length > 0 ? series : undefined,
      yAxis: series.length === 1 ? selectedYColumns[0] : undefined,
    };

    onConfigChange(updatedConfig);
    toast.success("Chart configuration applied");
  };

  const clearChart = () => {
    onConfigChange(undefined);
    setLocalConfig({
      type: "bar",
      xAxis: "",
      yAxis: "",
      colors: DEFAULT_COLORS,
      showGrid: true,
      enableAnimations: false,
      legend: { show: true, position: "top" },
    });
    setSelectedYColumns([]);
    toast.info("Chart cleared");
  };

  const handleExportPNG = async () => {
    if (!chartRef.current) {
      toast.error("No chart to export");
      return;
    }

    try {
      const fileName = `chart-${Date.now()}.png`;
      await exportChartAsPNG(chartRef.current, fileName);
      toast.success("Chart exported as PNG");
    } catch (error) {
      toast.error(`Failed to export chart: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Commented out unused function - may be needed for future multi-column selection feature
  // const handleYColumnToggle = (column: string) => {
  //   setSelectedYColumns((prev) => {
  //     const newSelection = prev.includes(column)
  //       ? prev.filter((c) => c !== column)
  //       : prev.length < 3
  //       ? [...prev, column]
  //       : prev;

  //     // Update config with series
  //     if (newSelection.length > 0) {
  //       const series: SeriesConfig[] = newSelection.map((col, idx) => ({
  //         column: col,
  //         label: col,
  //         color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
  //       }));
  //       handleConfigChange({ series, yAxis: undefined });
  //     } else {
  //       handleConfigChange({ series: undefined, yAxis: undefined });
  //     }

  //     return newSelection;
  //   });
  // };

  // Get numeric columns for Y-axis
  const numericColumns = result.columns.filter((col) =>
    isNumericColumn(result.data, col)
  );

  // Suggested chart types
  const suggestedTypes = useMemo(() => {
    return suggestChartTypes(result, localConfig.xAxis, localConfig.yAxis || localConfig.series);
  }, [result, localConfig.xAxis, localConfig.yAxis, localConfig.series]);

  const renderChart = () => {
    if (!chartConfig || !chartConfig.xAxis || (!chartConfig.yAxis && (!chartConfig.series || chartConfig.series.length === 0))) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6">
          <BarChart3 className="w-16 h-16 text-muted-foreground opacity-20" />
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-lg font-semibold">Create Your Chart</h3>
            <p className="text-muted-foreground text-sm">
              Configure chart settings above to visualize your data. Choose a
              chart type, select your axes, and customize to your needs.
            </p>
            {suggestedTypes.length > 0 && (
              <div className="pt-4">
                <p className="text-xs text-muted-foreground mb-2">Suggested chart types:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedTypes.slice(0, 4).map((type) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfigChange({ type: type as ChartType })}
                    >
                      {type.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    const chartData = transformedData.map((row) => {
      const newRow: Record<string, any> = {
        ...row,
        [chartConfig.xAxis]: String(row[chartConfig.xAxis]),
      };

      // Handle single series
      if (chartConfig.yAxis) {
        newRow[chartConfig.yAxis] = Number(row[chartConfig.yAxis]) || 0;
      }

      // Handle multiple series
      if (chartConfig.series) {
        chartConfig.series.forEach((series) => {
          newRow[series.column] = Number(row[series.column]) || 0;
        });
      }

      return newRow;
    });

    // Common chart properties
    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 60 },
    };

    // Axis styling
    const axisStyle = {
      fontSize: 12,
      fill: "hsl(var(--muted-foreground))",
      fontFamily: "var(--font-sans)",
    };

    // Grid styling
    const gridStyle = {
      stroke: "hsl(var(--border))",
      strokeOpacity: theme === "dark" ? 0.2 : 0.15,
      strokeDasharray: "3 3",
    };

    // Legend styling
    const legendStyle = {
      fontSize: 12,
      fontFamily: "var(--font-sans)",
    };

    const colors = chartConfig.colors || DEFAULT_COLORS;

    // Helper to render series based on config
    const renderSeries = () => {
      if (chartConfig.series && chartConfig.series.length > 0) {
        return chartConfig.series.map((series, idx) => {
          const color = series.color || colors[idx % colors.length];

          if (chartConfig.type === "bar" || chartConfig.type === "stacked_bar" || chartConfig.type === "grouped_bar") {
            return (
              <Bar
                key={series.column}
                dataKey={series.column}
                fill={color}
                radius={[8, 8, 0, 0]}
                stackId={chartConfig.stacked ? "stack" : undefined}
                name={series.label || series.column}
              />
            );
          }

          if (chartConfig.type === "line" || chartConfig.type === "area" || chartConfig.type === "stacked_area") {
            return chartConfig.type.includes("area") ? (
              <Area
                key={series.column}
                type={chartConfig.smooth ? "monotone" : "linear"}
                dataKey={series.column}
                stroke={color}
                fill={color}
                fillOpacity={0.6}
                stackId={chartConfig.stacked ? "stack" : undefined}
                name={series.label || series.column}
              />
            ) : (
              <Line
                key={series.column}
                type={chartConfig.smooth ? "monotone" : "linear"}
                dataKey={series.column}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 4 }}
                name={series.label || series.column}
              />
            );
          }

          return null;
        });
      }

      // Single series fallback
      if (chartConfig.yAxis) {
        const color = colors[0];

        if (chartConfig.type === "bar" || chartConfig.type === "stacked_bar" || chartConfig.type === "grouped_bar") {
          return (
            <Bar
              dataKey={chartConfig.yAxis}
              fill={color}
              radius={[8, 8, 0, 0]}
              name={chartConfig.yAxis}
            />
          );
        }

        if (chartConfig.type === "line" || chartConfig.type === "area" || chartConfig.type === "stacked_area") {
          return chartConfig.type.includes("area") ? (
            <Area
              type={chartConfig.smooth ? "monotone" : "linear"}
              dataKey={chartConfig.yAxis}
              stroke={color}
              fill={color}
              fillOpacity={0.6}
              name={chartConfig.yAxis}
            />
          ) : (
            <Line
              type={chartConfig.smooth ? "monotone" : "linear"}
              dataKey={chartConfig.yAxis}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4 }}
              name={chartConfig.yAxis}
            />
          );
        }
      }

      return null;
    };

    // Render appropriate chart type
    switch (chartConfig.type) {
      case "bar":
      case "stacked_bar":
      case "grouped_bar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart {...commonProps}>
              {chartConfig.showGrid && <CartesianGrid {...gridStyle} />}
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                height={60}
                angle={chartData.length > 10 ? -45 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
              />
              <YAxis
                {...axisStyle}
                tickFormatter={formatNumber}
                width={80}
                label={chartConfig.yAxisConfig?.label ? {
                  value: chartConfig.yAxisConfig.label,
                  angle: -90,
                  position: "insideLeft",
                  style: axisStyle,
                } : undefined}
              />
              <Tooltip content={<CustomChartTooltip formatter={formatNumber} />} />
              {chartConfig.legend?.show && (
                <Legend wrapperStyle={legendStyle} iconType="circle" />
              )}
              {renderSeries()}
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart {...commonProps}>
              {chartConfig.showGrid && <CartesianGrid {...gridStyle} />}
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                tickFormatter={shortenLabel}
                height={60}
                angle={chartData.length > 10 ? -45 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
              />
              <YAxis {...axisStyle} tickFormatter={formatNumber} width={80} />
              <Tooltip content={<CustomChartTooltip formatter={formatNumber} />} />
              {chartConfig.legend?.show && (
                <Legend wrapperStyle={legendStyle} iconType="line" />
              )}
              {renderSeries()}
            </LineChart>
          </ResponsiveContainer>
        );

      case "area":
      case "stacked_area":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart {...commonProps}>
              {chartConfig.showGrid && <CartesianGrid {...gridStyle} />}
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                tickFormatter={shortenLabel}
                height={60}
                angle={chartData.length > 10 ? -45 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
              />
              <YAxis {...axisStyle} tickFormatter={formatNumber} width={80} />
              <Tooltip content={<CustomChartTooltip formatter={formatNumber} />} />
              {chartConfig.legend?.show && (
                <Legend wrapperStyle={legendStyle} iconType="rect" />
              )}
              {renderSeries()}
            </AreaChart>
          </ResponsiveContainer>
        );

      case "scatter":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart {...commonProps}>
              {chartConfig.showGrid && <CartesianGrid {...gridStyle} />}
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                type="number"
                tickFormatter={formatNumber}
              />
              <YAxis {...axisStyle} type="number" tickFormatter={formatNumber} width={80} />
              <Tooltip content={<CustomChartTooltip formatter={formatNumber} />} />
              {chartConfig.legend?.show && (
                <Legend wrapperStyle={legendStyle} iconType="circle" />
              )}
              <Scatter
                dataKey={chartConfig.yAxis || chartConfig.series?.[0]?.column}
                fill={colors[0]}
                name={chartConfig.yAxis || chartConfig.series?.[0]?.column}
              />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case "pie":
      case "donut":
        const RADIAN = Math.PI / 180;
        const renderLabel = ({
          cx,
          cy,
          midAngle,
          innerRadius,
          outerRadius,
          percent,
        }: any) => {
          const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
          const x = cx + radius * Math.cos(-midAngle * RADIAN);
          const y = cy + radius * Math.sin(-midAngle * RADIAN);

          return (
            <text
              x={x}
              y={y}
              fill="white"
              textAnchor={x > cx ? "start" : "end"}
              dominantBaseline="central"
              fontSize={12}
              fontWeight={600}
            >
              {`${(percent * 100).toFixed(0)}%`}
            </text>
          );
        };

        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey={chartConfig.yAxis || chartConfig.series?.[0]?.column}
                nameKey={chartConfig.xAxis}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={chartConfig.showValues ? renderLabel : false}
                outerRadius={120}
                innerRadius={chartConfig.type === "donut" ? (chartConfig.innerRadius || 60) : 0}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                    stroke={theme === "dark" ? "#1a1a1a" : "#fff"}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomChartTooltip formatter={formatNumber} />} />
              {chartConfig.legend?.show && (
                <Legend
                  wrapperStyle={legendStyle}
                  iconType="circle"
                  verticalAlign="bottom"
                  height={36}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Chart type "{chartConfig.type}" not yet implemented
          </div>
        );
    }
  };

  if (!result || !result.data || result.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="text-muted-foreground text-sm">
            No data available for visualization
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Configuration Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Main Configuration Row */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Chart Type */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Chart Type</label>
                <Select
                  value={localConfig.type}
                  onValueChange={(value) =>
                    handleConfigChange({ type: value as ChartType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar Chart</SelectItem>
                    <SelectItem value="grouped_bar">Grouped Bar</SelectItem>
                    <SelectItem value="stacked_bar">Stacked Bar</SelectItem>
                    <SelectItem value="line">Line Chart</SelectItem>
                    <SelectItem value="area">Area Chart</SelectItem>
                    <SelectItem value="stacked_area">Stacked Area</SelectItem>
                    <SelectItem value="pie">Pie Chart</SelectItem>
                    <SelectItem value="donut">Donut Chart</SelectItem>
                    <SelectItem value="scatter">Scatter Plot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* X-Axis */}
              <div className="space-y-2">
                <label className="text-xs font-medium">X-Axis</label>
                <Select
                  value={localConfig.xAxis || ""}
                  onValueChange={(value) => handleConfigChange({ xAxis: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {result.columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Y-Axis (Multi-select 2-3 columns) */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Y-Axis (Select 2-3)</label>
                <MultiSelect
                  options={numericColumns.map((col, idx) => ({
                    label: col,
                    value: col,
                    color: selectedYColumns.includes(col)
                      ? DEFAULT_COLORS[selectedYColumns.indexOf(col) % DEFAULT_COLORS.length]
                      : DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
                  }))}
                  selected={selectedYColumns}
                  onChange={setSelectedYColumns}
                  placeholder="Select columns..."
                  maxSelected={3}
                  className="w-full"
                />
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <label className="text-xs font-medium invisible">Actions</label>
                <div className="flex gap-2">
                  <Button onClick={applyConfig} className="flex-1">
                    Apply
                  </Button>
                  <Button onClick={clearChart} variant="outline" className="flex-1">
                    Clear
                  </Button>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="space-y-2">
                <label className="text-xs font-medium invisible">Options</label>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={handleExportPNG}>
                    <Download className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowCustomization(!showCustomization)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Customization Panel */}
            {showCustomization && (
              <Card className="border-2 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Chart Customization
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCustomization(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Show Grid</label>
                      <Select
                        value={localConfig.showGrid ? "yes" : "no"}
                        onValueChange={(value) =>
                          handleConfigChange({ showGrid: value === "yes" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium">Show Values</label>
                      <Select
                        value={localConfig.showValues ? "yes" : "no"}
                        onValueChange={(value) =>
                          handleConfigChange({ showValues: value === "yes" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium">Animations</label>
                      <Select
                        value={localConfig.enableAnimations ? "yes" : "no"}
                        onValueChange={(value) =>
                          handleConfigChange({ enableAnimations: value === "yes" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chart Display */}
      <div className="flex-1 min-h-0">
        <Card className="h-full">
          <CardContent className="p-4 h-full" ref={chartRef}>
            {renderChart()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChartVisualizationPro;

/**
 * Professional Chart Visualization Component
 * Features: Multi-series, advanced chart types, customization, export
 * Powered by uPlot (canvas-based, lightweight)
 */

import { useState, useRef, useMemo } from "react";
import uPlot from "uplot";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { Download, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import { formatNumber, shortenLabel } from "@/lib/chartUtils";
import { transformData, isNumericColumn, suggestChartTypes } from "@/lib/chartDataTransform";
import { exportChartAsPNG } from "@/lib/chartExport";
import UPlotChart from "./UPlotChart";
import { tooltipPlugin } from "./tooltipPlugin";
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

// Chart type display labels
const CHART_TYPE_LABELS: Record<string, string> = {
  bar: "Bar Chart",
  grouped_bar: "Grouped Bar",
  stacked_bar: "Stacked Bar",
  line: "Line Chart",
  area: "Area Chart",
  stacked_area: "Stacked Area",
  pie: "Pie Chart",
  donut: "Donut Chart",
  scatter: "Scatter Plot",
};

// ── SVG Pie/Donut Chart ──────────────────────────────────────────────────────

function PieChart({
  data,
  xKey,
  yKey,
  colors,
  isDonut,
  innerRadius = 0.45,
  showValues,
  theme,
  legendShow,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  colors: string[];
  isDonut: boolean;
  innerRadius?: number;
  showValues?: boolean;
  theme: string;
  legendShow?: boolean;
}) {
  const total = data.reduce((sum, row) => sum + (Number(row[yKey]) || 0), 0);
  if (total === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No data</div>;

  const slices: { label: string; value: number; pct: number; color: string }[] = [];
  let cumAngle = -Math.PI / 2;
  const arcs: { d: string; color: string; midAngle: number; pct: number; label: string }[] = [];

  data.forEach((row, i) => {
    const value = Number(row[yKey]) || 0;
    const pct = value / total;
    const angle = pct * 2 * Math.PI;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    const midAngle = startAngle + angle / 2;
    const color = colors[i % colors.length];

    slices.push({ label: String(row[xKey]), value, pct, color });

    const outerR = 1;
    const innerR = isDonut ? innerRadius : 0;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = Math.cos(startAngle) * outerR;
    const y1 = Math.sin(startAngle) * outerR;
    const x2 = Math.cos(endAngle) * outerR;
    const y2 = Math.sin(endAngle) * outerR;
    const ix1 = Math.cos(endAngle) * innerR;
    const iy1 = Math.sin(endAngle) * innerR;
    const ix2 = Math.cos(startAngle) * innerR;
    const iy2 = Math.sin(startAngle) * innerR;

    const d = isDonut
      ? `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`
      : `M 0 0 L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    arcs.push({ d, color, midAngle, pct, label: String(row[xKey]) });
    cumAngle = endAngle;
  });

  const strokeColor = theme === "dark" ? "#1a1a1a" : "#fff";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full max-w-[280px] max-h-[280px] flex-shrink-0">
        {arcs.map((arc, i) => (
          <g key={i}>
            <path d={arc.d} fill={arc.color} stroke={strokeColor} strokeWidth={0.02} />
            {showValues && arc.pct >= 0.05 && (
              <text
                x={Math.cos(arc.midAngle) * (isDonut ? 0.72 : 0.6)}
                y={Math.sin(arc.midAngle) * (isDonut ? 0.72 : 0.6)}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="0.12"
                fontWeight="600"
              >
                {`${(arc.pct * 100).toFixed(0)}%`}
              </text>
            )}
          </g>
        ))}
      </svg>
      {legendShow && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground truncate max-w-[120px]">{s.label}</span>
              <span className="font-medium">{formatNumber(s.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export const ChartVisualizationPro: React.FC<ChartVisualizationProProps> = ({
  result,
  chartConfig,
  onConfigChange,
}) => {
  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  const [localConfig, setLocalConfig] = useState<ChartConfig>(() => {
    if (chartConfig) return chartConfig;
    const numCols = result.columns.filter((col) => isNumericColumn(result.data, col));
    return {
      type: "bar",
      xAxis: result.columns[0] || "",
      yAxis: numCols[0] || result.columns[1] || "",
      colors: DEFAULT_COLORS,
      showGrid: true,
      enableAnimations: false,
      legend: { show: true, position: "top" },
    };
  });

  const [selectedYColumns, setSelectedYColumns] = useState<string[]>([]);

  // Transform data based on configuration
  const transformedData = useMemo(() => {
    return transformData(result, localConfig.transform, localConfig.xAxis, localConfig.yAxis || localConfig.series);
  }, [result, localConfig.transform, localConfig.xAxis, localConfig.yAxis, localConfig.series]);

  const handleConfigChange = (updates: Partial<ChartConfig>) => {
    setLocalConfig({ ...localConfig, ...updates });
  };

  const applyConfig = () => {
    const series = selectedYColumns.map((col, idx) => ({
      column: col,
      label: col,
      color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    }));

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
      const bg = theme === "dark" ? "#1a1a1a" : "#ffffff";
      await exportChartAsPNG(chartRef.current, fileName, bg);
      toast.success("Chart exported as PNG");
    } catch (error) {
      toast.error(`Failed to export chart: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Get numeric columns for Y-axis
  const numericColumns = result.columns.filter((col) => isNumericColumn(result.data, col));

  // Suggested chart types
  const suggestedTypes = useMemo(() => {
    return suggestChartTypes(result, localConfig.xAxis, localConfig.yAxis || localConfig.series);
  }, [result, localConfig.xAxis, localConfig.yAxis, localConfig.series]);

  // ── Build uPlot options + data ──────────────────────────────────────────────

  const { uPlotOptions, uPlotData } = useMemo(() => {
    if (
      !chartConfig ||
      !chartConfig.xAxis ||
      (!chartConfig.yAxis && (!chartConfig.series || chartConfig.series.length === 0))
    ) {
      return { uPlotOptions: null, uPlotData: null };
    }

    // Prepare row-based chart data
    const chartData = transformedData.map((row) => {
      const newRow: Record<string, unknown> = { ...row };
      if (chartConfig.yAxis) newRow[chartConfig.yAxis] = Number(row[chartConfig.yAxis]) || 0;
      if (chartConfig.series) {
        chartConfig.series.forEach((s) => {
          newRow[s.column] = Number(row[s.column]) || 0;
        });
      }
      return newRow;
    });

    // Determine Y keys
    const yKeys: string[] = chartConfig.series?.map((s) => s.column) ?? (chartConfig.yAxis ? [chartConfig.yAxis] : []);
    const colors = chartConfig.colors || DEFAULT_COLORS;
    const isDark = theme === "dark";

    // Convert to uPlot columnar data: [xs, ...series]
    const xs = chartData.map((_, i) => i);
    const seriesData = yKeys.map((key) => chartData.map((row) => (Number(row[key]) || 0) as number));

    // For stacked charts, compute stacked values
    const isStacked = chartConfig.type === "stacked_bar" || chartConfig.type === "stacked_area";
    const stackedData = isStacked
      ? seriesData.reduce<number[][]>((acc, curr) => {
          if (acc.length === 0) return [curr];
          const prev = acc[acc.length - 1];
          acc.push(curr.map((v, i) => v + prev[i]));
          return acc;
        }, [])
      : seriesData;

    const finalSeriesData = isStacked ? stackedData : seriesData;

    const isBarType = ["bar", "stacked_bar", "grouped_bar"].includes(chartConfig.type);
    const isAreaType = ["area", "stacked_area"].includes(chartConfig.type);
    const isScatter = chartConfig.type === "scatter";

    // X-axis labels
    const xLabels = chartData.map((row) => shortenLabel(String(row[chartConfig.xAxis])));

    // Build bars path builder
    const barsBuilder = isBarType
      ? uPlot.paths.bars!({
          size: [0.6, 100],
          radius: 0.2,
          gap: yKeys.length > 1 && chartConfig.type === "grouped_bar" ? 2 : 0,
        })
      : undefined;

    // Build series config
    const uSeries: uPlot.Series[] = [
      { label: chartConfig.xAxis },
      ...yKeys.map((key, i) => {
        const color = chartConfig.series?.[i]?.color || colors[i % colors.length];
        const seriesLabel = chartConfig.series?.[i]?.label || key;

        const s: uPlot.Series = {
          label: seriesLabel,
          stroke: color,
          width: isBarType ? 0 : 2,
          fill: isBarType || isAreaType ? color + (isAreaType ? "66" : "cc") : undefined,
          points: { show: isScatter, size: isScatter ? 8 : 4 },
          paths: isBarType ? barsBuilder : isScatter ? () => null : undefined,
        };

        // For grouped bars, need per-series bar offset
        if (chartConfig.type === "grouped_bar" && yKeys.length > 1) {
          const groupBars = uPlot.paths.bars!({
            size: [0.6 / yKeys.length, 100],
            radius: 0.2,
            align: i === 0 ? -1 : i === yKeys.length - 1 ? 1 : 0,
          });
          s.paths = groupBars;
        }

        return s;
      }),
    ];

    // Build axes config
    const needsRotation = chartData.length > 10;
    const maxLabelLen = Math.max(...xLabels.map((l) => l.length), 1);
    const xAxisSize = needsRotation ? Math.min(120, 40 + maxLabelLen * 5) : 60;

    const uAxes: uPlot.Axis[] = [
      {
        stroke: isDark ? "#888" : "#666",
        grid: { stroke: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", width: 1 },
        ticks: { stroke: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", width: 1 },
        values: (_u: uPlot, vals: number[]) => vals.map((v) => xLabels[v] ?? ""),
        gap: 8,
        size: xAxisSize,
        font: "12px system-ui, sans-serif",
        labelFont: "12px system-ui, sans-serif",
        rotate: needsRotation ? -45 : 0,
      },
      {
        stroke: isDark ? "#888" : "#666",
        grid: chartConfig.showGrid
          ? { stroke: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", width: 1, dash: [4, 4] }
          : { show: false },
        ticks: { stroke: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", width: 1 },
        values: (_u: uPlot, vals: number[]) => vals.map((v) => formatNumber(v)),
        gap: 8,
        size: 70,
        font: "12px system-ui, sans-serif",
        labelFont: "12px system-ui, sans-serif",
      },
    ];

    const opts: Omit<uPlot.Options, "width" | "height"> = {
      scales: {
        x: { time: false },
      },
      series: uSeries,
      axes: uAxes,
      cursor: {
        drag: { x: false, y: false },
        points: {
          size: 6,
          fill: (u: uPlot, i: number) =>
            (typeof u.series[i].stroke === "function"
              ? (u.series[i].stroke as (self: uPlot, seriesIdx: number) => string)(u, i)
              : u.series[i].stroke) as string,
          stroke: "transparent",
          width: 0,
        },
      },
      legend: { show: false },
      plugins: [tooltipPlugin(xLabels)],
      padding: [16, 16, 8, 0],
    };

    // Stacked: render in reverse order so first series is on top visually
    const data: uPlot.AlignedData = isStacked
      ? [xs, ...finalSeriesData.reverse()] as uPlot.AlignedData
      : [xs, ...finalSeriesData] as uPlot.AlignedData;

    return { uPlotOptions: opts, uPlotData: data };
  }, [chartConfig, transformedData, theme]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderChart = () => {
    if (
      !chartConfig ||
      !chartConfig.xAxis ||
      (!chartConfig.yAxis && (!chartConfig.series || chartConfig.series.length === 0))
    ) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6">
          <BarChart3 className="w-16 h-16 text-muted-foreground opacity-20" />
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-lg font-semibold">Create Your Chart</h3>
            <p className="text-muted-foreground text-sm">
              Configure chart settings above to visualize your data. Choose a chart type, select your axes, and
              customize to your needs.
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
                      {CHART_TYPE_LABELS[type] || type}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Pie/Donut — SVG-based (uPlot is XY only)
    if (chartConfig.type === "pie" || chartConfig.type === "donut") {
      const chartData = transformedData.map((row) => ({
        ...row,
        [chartConfig.xAxis]: String(row[chartConfig.xAxis]),
        [chartConfig.yAxis || chartConfig.series?.[0]?.column || ""]:
          Number(row[chartConfig.yAxis || chartConfig.series?.[0]?.column || ""]) || 0,
      }));
      return (
        <PieChart
          data={chartData}
          xKey={chartConfig.xAxis}
          yKey={chartConfig.yAxis || chartConfig.series?.[0]?.column || ""}
          colors={chartConfig.colors || DEFAULT_COLORS}
          isDonut={chartConfig.type === "donut"}
          innerRadius={chartConfig.innerRadius ? chartConfig.innerRadius / 120 : 0.45}
          showValues={chartConfig.showValues}
          theme={theme}
          legendShow={chartConfig.legend?.show}
        />
      );
    }

    // XY charts via uPlot
    if (!uPlotOptions || !uPlotData) return null;

    return <UPlotChart options={uPlotOptions} data={uPlotData} className="w-full h-full" />;
  };

  if (!result || !result.data || result.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="text-muted-foreground text-sm">No data available for visualization</div>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Chart Type */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Chart Type</label>
                <Select
                  value={localConfig.type}
                  onValueChange={(value) => handleConfigChange({ type: value as ChartType })}
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
                <Select value={localConfig.xAxis || ""} onValueChange={(value) => handleConfigChange({ xAxis: value })}>
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

              {/* Y-Axis */}
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

              {/* Export */}
              <div className="space-y-2">
                <label className="text-xs font-medium invisible">Export</label>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" onClick={handleExportPNG}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
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

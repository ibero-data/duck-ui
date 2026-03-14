/**
 * Professional Chart Visualization Component
 * Features: Auto-chart, live preview, multi-series, customization, export
 * Powered by uPlot (canvas-based, lightweight)
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import uPlot from "uplot";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Download,
  BarChart3,
  LineChart,
  PieChart as PieChartIcon,
  ScatterChart,
  AreaChart,
  Settings2,
  RotateCcw,
  Layers,
  TrendingUp,
  CircleDot,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import { formatNumber, formatNumberWithSuffix, shortenLabel } from "@/lib/chartUtils";
import { transformData, isNumericColumn, suggestChartTypes } from "@/lib/chartDataTransform";
import { exportChartAsPNG } from "@/lib/chartExport";
import UPlotChart from "./UPlotChart";
import { tooltipPlugin } from "./tooltipPlugin";
import type { QueryResult, ChartConfig, ChartType, DataTransform } from "@/store";

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

// Chart type display labels with icons
const CHART_TYPE_INFO: Record<string, { label: string; icon: React.ElementType }> = {
  bar: { label: "Bar", icon: BarChart3 },
  grouped_bar: { label: "Grouped Bar", icon: Layers },
  stacked_bar: { label: "Stacked Bar", icon: Layers },
  line: { label: "Line", icon: LineChart },
  area: { label: "Area", icon: AreaChart },
  stacked_area: { label: "Stacked Area", icon: TrendingUp },
  pie: { label: "Pie", icon: PieChartIcon },
  donut: { label: "Donut", icon: CircleDot },
  scatter: { label: "Scatter", icon: ScatterChart },
};

// ── SVG Pie/Donut Chart ──────────────────────────────────────────────────────

function PieChartDisplay({
  data,
  xKey,
  yKey,
  colors,
  isDonut,
  innerRadius = 0.45,
  theme,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  colors: string[];
  isDonut: boolean;
  innerRadius?: number;
  theme: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((sum, row) => sum + (Number(row[yKey]) || 0), 0);

  if (total === 0)
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">No data</div>
    );

  const slices: { label: string; value: number; pct: number; color: string }[] = [];
  let cumAngle = -Math.PI / 2;
  const arcs: {
    d: string;
    color: string;
    midAngle: number;
    pct: number;
    label: string;
    value: number;
  }[] = [];

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

    arcs.push({ d, color, midAngle, pct, label: String(row[xKey]), value });
    cumAngle = endAngle;
  });

  const strokeColor = theme === "dark" ? "#1a1a1a" : "#fff";

  return (
    <div className="flex items-center justify-center h-full gap-6">
      {/* Chart */}
      <div className="relative flex-shrink-0">
        <svg
          viewBox="-1.3 -1.3 2.6 2.6"
          className="w-full max-w-[360px] max-h-[360px]"
          style={{ minWidth: 200 }}
        >
          {arcs.map((arc, i) => {
            const isHovered = hoveredIdx === i;
            const tx = isHovered ? Math.cos(arc.midAngle) * 0.06 : 0;
            const ty = isHovered ? Math.sin(arc.midAngle) * 0.06 : 0;
            return (
              <g key={i}>
                <path
                  d={arc.d}
                  fill={arc.color}
                  stroke={strokeColor}
                  strokeWidth={0.02}
                  opacity={hoveredIdx !== null && !isHovered ? 0.4 : 1}
                  transform={`translate(${tx}, ${ty})`}
                  style={{ transition: "opacity 0.2s, transform 0.2s" }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                {arc.pct >= 0.05 && (
                  <text
                    x={Math.cos(arc.midAngle) * (isDonut ? 0.72 : 0.6) + tx}
                    y={Math.sin(arc.midAngle) * (isDonut ? 0.72 : 0.6) + ty}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize="0.11"
                    fontWeight="600"
                    pointerEvents="none"
                    style={{ transition: "all 0.2s" }}
                  >
                    {`${(arc.pct * 100).toFixed(0)}%`}
                  </text>
                )}
              </g>
            );
          })}
          {/* Donut center total */}
          {isDonut && (
            <g>
              <text
                x="0"
                y="-0.06"
                textAnchor="middle"
                dominantBaseline="central"
                fill={theme === "dark" ? "#999" : "#666"}
                fontSize="0.12"
              >
                Total
              </text>
              <text
                x="0"
                y="0.12"
                textAnchor="middle"
                dominantBaseline="central"
                fill={theme === "dark" ? "#e5e5e5" : "#1a1a1a"}
                fontSize="0.18"
                fontWeight="700"
              >
                {formatNumberWithSuffix(total)}
              </text>
            </g>
          )}
        </svg>
        {/* Hover tooltip */}
        {hoveredIdx !== null && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none z-10">
            <div className="font-medium">{slices[hoveredIdx].label}</div>
            <div className="text-muted-foreground">
              {formatNumber(slices[hoveredIdx].value)} ({(slices[hoveredIdx].pct * 100).toFixed(1)}
              %)
            </div>
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-col gap-1.5 text-xs max-h-[320px] overflow-y-auto pr-2">
        {slices.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 cursor-default"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground truncate max-w-[140px]" title={s.label}>
              {s.label}
            </span>
            <span className="font-medium ml-auto tabular-nums pl-2">
              {formatNumberWithSuffix(s.value)}
            </span>
            <span className="text-muted-foreground tabular-nums w-[3.5em] text-right">
              {(s.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── XY Chart Legend ──────────────────────────────────────────────────────────

function ChartLegend({
  series,
  colors,
  onToggle,
}: {
  series: { label: string; show: boolean }[];
  colors: string[];
  onToggle: (idx: number) => void;
}) {
  if (series.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center py-1 text-xs">
      {series.map((s, i) => (
        <button
          key={i}
          className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
          style={{ opacity: s.show ? 1 : 0.35 }}
          onClick={() => onToggle(i)}
          type="button"
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors[i % colors.length] }}
          />
          <span className="text-muted-foreground">{s.label}</span>
        </button>
      ))}
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
  const uPlotRef = useRef<uPlot | null>(null);
  const [legendState, setLegendState] = useState<{ label: string; show: boolean }[]>([]);

  // Get numeric columns for Y-axis
  const numericColumns = useMemo(
    () => result.columns.filter((col) => isNumericColumn(result.data, col)),
    [result]
  );

  // Auto-chart: detect best config when no config exists
  const autoDetect = useCallback((): ChartConfig => {
    const xAxis =
      result.columns.find((col) => !isNumericColumn(result.data, col)) || result.columns[0] || "";
    const yCol = numericColumns[0] || result.columns[1] || "";
    const suggested = suggestChartTypes(result, xAxis, yCol);
    const type = (suggested[0] || "bar") as ChartType;
    return {
      type,
      xAxis,
      yAxis: yCol,
      colors: DEFAULT_COLORS,
      showGrid: true,
      showValues: false,
      smooth: false,
      legend: { show: true, position: "bottom" },
    };
  }, [result, numericColumns]);

  // On mount: auto-generate config if none provided
  useEffect(() => {
    if (!chartConfig && result.data.length > 0) {
      onConfigChange(autoDetect());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live config update helper
  const updateConfig = useCallback(
    (updates: Partial<ChartConfig>) => {
      const base = chartConfig || autoDetect();
      onConfigChange({ ...base, ...updates });
    },
    [chartConfig, autoDetect, onConfigChange]
  );

  const updateTransform = useCallback(
    (updates: Partial<DataTransform>) => {
      const base = chartConfig || autoDetect();
      onConfigChange({ ...base, transform: { ...base.transform, ...updates } });
    },
    [chartConfig, autoDetect, onConfigChange]
  );

  // Current effective config
  const config = chartConfig || autoDetect();

  // Selected Y columns (from series or single yAxis)
  const selectedYColumns = useMemo(() => {
    if (config.series?.length) return config.series.map((s) => s.column);
    if (config.yAxis) return [config.yAxis];
    return [];
  }, [config]);

  const handleYColumnsChange = useCallback(
    (cols: string[]) => {
      const series = cols.map((col, idx) => ({
        column: col,
        label: col,
        color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      }));
      updateConfig({
        series: series.length > 1 ? series : undefined,
        yAxis: series.length === 1 ? cols[0] : undefined,
      });
    },
    [updateConfig]
  );

  // Transform data based on configuration
  const transformedData = useMemo(() => {
    return transformData(result, config.transform, config.xAxis, config.yAxis || config.series);
  }, [result, config.transform, config.xAxis, config.yAxis, config.series]);

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
      toast.error(
        `Failed to export chart: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  // ── Build uPlot options + data ──────────────────────────────────────────────

  const { uPlotOptions, uPlotData, seriesInfo } = useMemo(() => {
    if (!config.xAxis || (!config.yAxis && (!config.series || config.series.length === 0))) {
      return { uPlotOptions: null, uPlotData: null, seriesInfo: [] };
    }

    const chartData = transformedData.map((row) => {
      const newRow: Record<string, unknown> = { ...row };
      if (config.yAxis) newRow[config.yAxis] = Number(row[config.yAxis]) || 0;
      if (config.series) {
        config.series.forEach((s) => {
          newRow[s.column] = Number(row[s.column]) || 0;
        });
      }
      return newRow;
    });

    const yKeys: string[] =
      config.series?.map((s) => s.column) ?? (config.yAxis ? [config.yAxis] : []);
    const colors = config.colors || DEFAULT_COLORS;
    const isDark = theme === "dark";

    const xs = chartData.map((_, i) => i);
    const seriesData = yKeys.map((key) =>
      chartData.map((row) => (Number(row[key]) || 0) as number)
    );

    const isStacked = config.type === "stacked_bar" || config.type === "stacked_area";
    const stackedData = isStacked
      ? seriesData.reduce<number[][]>((acc, curr) => {
          if (acc.length === 0) return [curr];
          const prev = acc[acc.length - 1];
          acc.push(curr.map((v, i) => v + prev[i]));
          return acc;
        }, [])
      : seriesData;

    const finalSeriesData = isStacked ? stackedData : seriesData;

    const isBarType = ["bar", "stacked_bar", "grouped_bar"].includes(config.type);
    const isAreaType = ["area", "stacked_area"].includes(config.type);
    const isLineType = config.type === "line";
    const isScatter = config.type === "scatter";
    const useSmooth = config.smooth && (isLineType || isAreaType);

    const xLabels = chartData.map((row) => shortenLabel(String(row[config.xAxis])));

    const barsBuilder = isBarType
      ? uPlot.paths.bars!({
          size: [0.6, 100],
          radius: 0.2,
          gap: yKeys.length > 1 && config.type === "grouped_bar" ? 2 : 0,
        })
      : undefined;

    const splineBuilder = useSmooth ? uPlot.paths.spline!() : undefined;

    // Build series config
    const sInfo: { label: string; color: string }[] = [];
    const uSeries: uPlot.Series[] = [
      { label: config.xAxis },
      ...yKeys.map((key, i) => {
        const color = config.series?.[i]?.color || colors[i % colors.length];
        const seriesLabel = config.series?.[i]?.label || key;
        sInfo.push({ label: seriesLabel, color });

        const s: uPlot.Series = {
          label: seriesLabel,
          stroke: color,
          width: isBarType ? 0 : 2,
          fill: isBarType || isAreaType ? color + (isAreaType ? "66" : "cc") : undefined,
          points: { show: isScatter, size: isScatter ? 8 : 4 },
          paths: isBarType
            ? barsBuilder
            : useSmooth
              ? splineBuilder
              : isScatter
                ? () => null
                : undefined,
        };

        if (config.type === "grouped_bar" && yKeys.length > 1) {
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
        grid: config.showGrid
          ? {
              stroke: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
              width: 1,
              dash: [4, 4],
            }
          : { show: false },
        ticks: { stroke: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", width: 1 },
        values: (_u: uPlot, vals: number[]) => vals.map((v) => formatNumberWithSuffix(v)),
        gap: 8,
        size: 70,
        font: "12px system-ui, sans-serif",
        labelFont: "12px system-ui, sans-serif",
      },
    ];

    // Data labels hook for bar charts
    const hooks: uPlot.Plugin["hooks"] = {};
    if (config.showValues && isBarType) {
      hooks.draw = [
        (u: uPlot) => {
          const ctx = u.ctx;
          ctx.save();
          ctx.font = "10px system-ui, sans-serif";
          ctx.fillStyle = isDark ? "#ccc" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          for (let si = 1; si < u.series.length; si++) {
            if (!u.series[si].show) continue;
            for (let di = 0; di < u.data[si].length; di++) {
              const val = u.data[si][di];
              if (val == null) continue;
              const cx = u.valToPos(u.data[0][di]!, "x", true);
              const cy = u.valToPos(val, "y", true);
              ctx.fillText(formatNumberWithSuffix(val as number), cx, cy - 4);
            }
          }
          ctx.restore();
        },
      ];
    }

    const opts: Omit<uPlot.Options, "width" | "height"> = {
      scales: { x: { time: false } },
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
      plugins: [tooltipPlugin(xLabels, { stacked: isStacked }), { hooks }],
      padding: [16, 16, 8, 0],
    };

    const data: uPlot.AlignedData = isStacked
      ? ([xs, ...finalSeriesData.reverse()] as uPlot.AlignedData)
      : ([xs, ...finalSeriesData] as uPlot.AlignedData);

    return { uPlotOptions: opts, uPlotData: data, seriesInfo: sInfo };
  }, [config, transformedData, theme]);

  // Sync legend state when series change
  useEffect(() => {
    if (seriesInfo.length > 0) {
      setLegendState(seriesInfo.map((s) => ({ label: s.label, show: true })));
    }
  }, [seriesInfo]);

  const handleLegendToggle = useCallback((idx: number) => {
    setLegendState((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, show: !s.show } : s));
      // Toggle series visibility on the uPlot instance
      if (uPlotRef.current) {
        uPlotRef.current.setSeries(idx + 1, { show: next[idx].show });
      }
      return next;
    });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderChart = () => {
    if (config.type === "pie" || config.type === "donut") {
      const chartData = transformedData.map((row) => ({
        ...row,
        [config.xAxis]: String(row[config.xAxis]),
        [config.yAxis || config.series?.[0]?.column || ""]:
          Number(row[config.yAxis || config.series?.[0]?.column || ""]) || 0,
      }));
      return (
        <PieChartDisplay
          data={chartData}
          xKey={config.xAxis}
          yKey={config.yAxis || config.series?.[0]?.column || ""}
          colors={config.colors || DEFAULT_COLORS}
          isDonut={config.type === "donut"}
          innerRadius={config.innerRadius ? config.innerRadius / 120 : 0.45}
          theme={theme}
        />
      );
    }

    if (!uPlotOptions || !uPlotData) return null;

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0">
          <UPlotChart
            options={uPlotOptions}
            data={uPlotData}
            className="w-full h-full"
            onInit={(u) => {
              uPlotRef.current = u;
            }}
          />
        </div>
        <ChartLegend
          series={legendState}
          colors={seriesInfo.map((s) => s.color)}
          onToggle={handleLegendToggle}
        />
      </div>
    );
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

  const isLineOrArea = ["line", "area", "stacked_area"].includes(config.type);

  return (
    <div className="flex flex-col h-full">
      {/* Compact Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30">
        {/* Chart Type */}
        <Select
          value={config.type}
          onValueChange={(value) => updateConfig({ type: value as ChartType })}
        >
          <SelectTrigger className="w-[150px] shrink-0 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CHART_TYPE_INFO).map(([value, info]) => {
              const Icon = info.icon;
              return (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 opacity-60" />
                    {info.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* X-Axis */}
        <Select value={config.xAxis} onValueChange={(value) => updateConfig({ xAxis: value })}>
          <SelectTrigger className="w-[140px] shrink-0 h-8 text-xs">
            <span className="text-muted-foreground mr-1">X:</span>
            <SelectValue placeholder="Column" />
          </SelectTrigger>
          <SelectContent>
            {result.columns.map((col) => (
              <SelectItem key={col} value={col}>
                {col}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Y-Axis */}
        <div className="w-[200px] shrink-0">
          <MultiSelect
            options={numericColumns.map((col, idx) => ({
              label: col,
              value: col,
              color: selectedYColumns.includes(col)
                ? DEFAULT_COLORS[selectedYColumns.indexOf(col) % DEFAULT_COLORS.length]
                : DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
            }))}
            selected={selectedYColumns}
            onChange={handleYColumnsChange}
            placeholder="Values..."
            className="h-8 text-xs"
          />
        </div>

        {/* Settings Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px]" align="end">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Chart Settings</h4>

              {/* Sort */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Sort by
                </label>
                <div className="flex gap-1.5">
                  <Select
                    value={config.transform?.sortBy || "__none__"}
                    onValueChange={(v) =>
                      updateTransform({ sortBy: v === "__none__" ? undefined : v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {result.columns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {config.transform?.sortBy && (
                    <Select
                      value={config.transform?.sortOrder || "asc"}
                      onValueChange={(v) => updateTransform({ sortOrder: v as "asc" | "desc" })}
                    >
                      <SelectTrigger className="h-8 text-xs w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">Asc</SelectItem>
                        <SelectItem value="desc">Desc</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Limit */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Limit rows</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="No limit"
                  className="h-8 text-xs"
                  value={config.transform?.limit ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    updateTransform({ limit: v });
                  }}
                />
              </div>

              {/* Aggregation */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Aggregation</label>
                <Select
                  value={config.transform?.aggregation || "none"}
                  onValueChange={(v) =>
                    updateTransform({
                      aggregation: v as "sum" | "avg" | "count" | "min" | "max" | "none",
                      groupBy: v !== "none" ? config.xAxis : undefined,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="avg">Average</SelectItem>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="min">Min</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <label className="text-xs">Show values</label>
                  <Switch
                    checked={config.showValues ?? false}
                    onCheckedChange={(v) => updateConfig({ showValues: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs">Show grid</label>
                  <Switch
                    checked={config.showGrid ?? true}
                    onCheckedChange={(v) => updateConfig({ showGrid: v })}
                  />
                </div>
                {isLineOrArea && (
                  <div className="flex items-center justify-between">
                    <label className="text-xs">Smooth lines</label>
                    <Switch
                      checked={config.smooth ?? false}
                      onCheckedChange={(v) => updateConfig({ smooth: v })}
                    />
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Export */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExportPNG}>
          <Download className="h-4 w-4" />
        </Button>

        {/* Clear / Reset */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            onConfigChange(undefined);
            // Will auto-detect on next render
            setTimeout(() => onConfigChange(autoDetect()), 0);
          }}
          title="Reset chart"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Chart Display */}
      <div className="flex-1 min-h-0 p-2" ref={chartRef}>
        {renderChart()}
      </div>
    </div>
  );
};

export default React.memo(ChartVisualizationPro);

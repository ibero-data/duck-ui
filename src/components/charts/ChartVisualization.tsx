import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
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
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Activity, TrendingUp } from "lucide-react";
import { QueryResult, ChartConfig } from "@/store";
import { CustomChartTooltip } from "./CustomChartTooltip";
import { formatNumber, shortenLabel } from "@/lib/chartUtils";
import { useTheme } from "@/components/theme/theme-provider";

interface ChartVisualizationProps {
  result: QueryResult;
  chartConfig?: ChartConfig;
  onConfigChange: (config: ChartConfig | undefined) => void;
}

// Chart colors for visualizations
const HEX_COLORS = [
  "#D99B43",
  "#8B5CF6",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#6366F1",
];

export const ChartVisualization: React.FC<ChartVisualizationProps> = ({
  result,
  chartConfig,
  onConfigChange,
}) => {
  const { theme } = useTheme();
  const [localConfig, setLocalConfig] = useState<ChartConfig>(
    chartConfig || {
      type: "bar",
      xAxis: "",
      yAxis: "",
      series: undefined,
    }
  );

  // Auto-select first columns if not set
  useEffect(() => {
    if (result.columns.length > 0 && !localConfig.xAxis) {
      const numericColumns = result.columns.filter((_, idx) => {
        const type = result.columnTypes[idx]?.toLowerCase() || "";
        return (
          type.includes("int") ||
          type.includes("float") ||
          type.includes("double") ||
          type.includes("decimal") ||
          type.includes("numeric")
        );
      });

      setLocalConfig({
        ...localConfig,
        xAxis: result.columns[0] || "",
        yAxis: numericColumns[0] || result.columns[1] || "",
      });
    }
  }, [result.columns]);

  const handleConfigChange = (
    key: keyof ChartConfig,
    value: string | undefined
  ) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
  };

  const applyConfig = () => {
    onConfigChange(localConfig);
  };

  const clearChart = () => {
    onConfigChange(undefined);
    setLocalConfig({
      type: "bar",
      xAxis: "",
      yAxis: "",
      series: undefined,
    });
  };

  // Get numeric columns for Y-axis
  const numericColumns = result.columns.filter((_, idx) => {
    const type = result.columnTypes[idx]?.toLowerCase() || "";
    return (
      type.includes("int") ||
      type.includes("float") ||
      type.includes("double") ||
      type.includes("decimal") ||
      type.includes("numeric")
    );
  });

  const renderChart = () => {
    if (!chartConfig || !chartConfig.xAxis || !chartConfig.yAxis) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <TrendingUp className="w-16 h-16 mx-auto text-muted-foreground opacity-20" />
            <div className="text-muted-foreground text-sm max-w-xs mx-auto">
              Configure chart settings above to visualize your data
            </div>
          </div>
        </div>
      );
    }

    const chartData = result.data.map((row) => ({
      ...row,
      [chartConfig.xAxis]: String(row[chartConfig.xAxis]),
      [chartConfig.yAxis]: Number(row[chartConfig.yAxis]) || 0,
    }));

    // Common chart properties
    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 },
    };

    // Common axis styling
    const axisStyle = {
      fontSize: 12,
      fill: 'hsl(var(--muted-foreground))',
      fontFamily: 'var(--font-sans)',
    };

    // Grid styling
    const gridStyle = {
      stroke: 'hsl(var(--border))',
      strokeOpacity: theme === 'dark' ? 0.2 : 0.15,
      strokeDasharray: '3 3',
    };

    // Legend styling
    const legendStyle = {
      fontSize: 12,
      fontFamily: 'var(--font-sans)',
    };

    switch (chartConfig.type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart {...commonProps}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={HEX_COLORS[0]} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={HEX_COLORS[0]} stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                tickFormatter={shortenLabel}
                height={60}
                angle={chartData.length > 10 ? -45 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
              />
              <YAxis
                {...axisStyle}
                tickFormatter={formatNumber}
                width={80}
              />
              <Tooltip
                content={<CustomChartTooltip formatter={formatNumber} />}
                cursor={{ fill: 'hsl(var(--accent))', opacity: 0.1 }}
              />
              <Legend
                wrapperStyle={legendStyle}
                iconType="circle"
              />
              <Bar
                dataKey={chartConfig.yAxis}
                fill="url(#barGradient)"
                radius={[8, 8, 0, 0]}
                animationDuration={800}
                animationBegin={0}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart {...commonProps}>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                tickFormatter={shortenLabel}
                height={60}
                angle={chartData.length > 10 ? -45 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
              />
              <YAxis
                {...axisStyle}
                tickFormatter={formatNumber}
                width={80}
              />
              <Tooltip
                content={<CustomChartTooltip formatter={formatNumber} />}
                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '5 5' }}
              />
              <Legend
                wrapperStyle={legendStyle}
                iconType="line"
              />
              <Line
                type="monotone"
                dataKey={chartConfig.yAxis}
                stroke={HEX_COLORS[0]}
                strokeWidth={3}
                dot={{ r: 4, fill: HEX_COLORS[0], strokeWidth: 2, stroke: '#fff' }}
                activeDot={{
                  r: 6,
                  strokeWidth: 2,
                  stroke: '#fff',
                  fill: HEX_COLORS[0],
                }}
                animationDuration={800}
                animationBegin={0}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case "pie":
        const RADIAN = Math.PI / 180;
        const renderCustomizedLabel = ({
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
              textAnchor={x > cx ? 'start' : 'end'}
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
                dataKey={chartConfig.yAxis}
                nameKey={chartConfig.xAxis}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={120}
                animationDuration={800}
                animationBegin={0}
                animationEasing="ease-out"
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={HEX_COLORS[index % HEX_COLORS.length]}
                    stroke={theme === 'dark' ? '#1a1a1a' : '#fff'}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomChartTooltip formatter={formatNumber} />} />
              <Legend
                wrapperStyle={legendStyle}
                iconType="circle"
                verticalAlign="bottom"
                height={36}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart {...commonProps}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={HEX_COLORS[0]} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={HEX_COLORS[0]} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey={chartConfig.xAxis}
                {...axisStyle}
                tickFormatter={shortenLabel}
                height={60}
                angle={chartData.length > 10 ? -45 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
              />
              <YAxis
                {...axisStyle}
                tickFormatter={formatNumber}
                width={80}
              />
              <Tooltip
                content={<CustomChartTooltip formatter={formatNumber} />}
                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '5 5' }}
              />
              <Legend
                wrapperStyle={legendStyle}
                iconType="rect"
              />
              <Area
                type="monotone"
                dataKey={chartConfig.yAxis}
                stroke={HEX_COLORS[0]}
                strokeWidth={2}
                fill="url(#areaGradient)"
                animationDuration={800}
                animationBegin={0}
                animationEasing="ease-out"
                dot={{ r: 3, fill: HEX_COLORS[0] }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      default:
        return null;
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
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Chart Type */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Chart Type</label>
              <Select
                value={localConfig.type}
                onValueChange={(value) =>
                  handleConfigChange("type", value as ChartConfig["type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Bar Chart
                    </div>
                  </SelectItem>
                  <SelectItem value="line">
                    <div className="flex items-center gap-2">
                      <LineChartIcon className="w-4 h-4" />
                      Line Chart
                    </div>
                  </SelectItem>
                  <SelectItem value="pie">
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="w-4 h-4" />
                      Pie Chart
                    </div>
                  </SelectItem>
                  <SelectItem value="area">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Area Chart
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* X-Axis */}
            <div className="space-y-2">
              <label className="text-xs font-medium">X-Axis</label>
              <Select
                value={localConfig.xAxis || ""}
                onValueChange={(value) => handleConfigChange("xAxis", value)}
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

            {/* Y-Axis */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Y-Axis (Numeric)</label>
              <Select
                value={localConfig.yAxis || ""}
                onValueChange={(value) => handleConfigChange("yAxis", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {numericColumns.length > 0 ? (
                    numericColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No numeric columns found
                    </div>
                  )}
                </SelectContent>
              </Select>
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
          </div>
        </CardContent>
      </Card>

      {/* Chart Display */}
      <div className="flex-1 min-h-0">
        <Card className="h-full">
          <CardContent className="p-4 h-full">{renderChart()}</CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChartVisualization;

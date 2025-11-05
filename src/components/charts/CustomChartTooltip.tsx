// file: src/components/charts/CustomChartTooltip.tsx
// description: Chart visualization component
// reference: https://echarts.apache.org

import { useTheme } from "@/components/theme/theme-provider";

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: number) => string;
}

export const CustomChartTooltip: React.FC<CustomChartTooltipProps> = ({
  active,
  payload,
  label,
  formatter,
}) => {
  const { theme } = useTheme();

  if (!active || !payload || !payload.length) {
    return null;
  }

  const formatValue = (value: number): string => {
    if (formatter) return formatter(value);

    // Default formatting with thousand separators
    if (typeof value === 'number') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    }
    return String(value);
  };

  return (
    <div
      className="rounded-lg border p-3 shadow-lg backdrop-blur-sm"
      style={{
        borderColor: 'hsl(var(--border))',
        backgroundColor: theme === 'dark'
          ? 'rgba(9, 9, 11, 0.92)'  // Semi-transparent dark
          : 'rgba(255, 255, 255, 0.92)',  // Semi-transparent white
      }}
    >
      {label && (
        <div className="mb-2 pb-2 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground">
            {label}
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`tooltip-item-${index}`} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{
                backgroundColor: entry.color || entry.fill || entry.stroke,
              }}
            />
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-xs text-muted-foreground truncate">
                {entry.name || entry.dataKey}:
              </span>
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {formatValue(entry.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomChartTooltip;

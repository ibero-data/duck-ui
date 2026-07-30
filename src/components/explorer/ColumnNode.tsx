import React, { useState, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown, Hash, Type, Calendar, ToggleLeft } from "lucide-react";
import { useDuckStore, type ColumnStats } from "@/store";
import type { ColumnDistribution } from "@/store/types";

interface ColumnNodeProps {
  stats: ColumnStats;
  /** Context to fetch the value distribution lazily on expand. */
  databaseName?: string;
  tableName?: string;
  schema?: string;
}

const getTypeIcon = (type: string) => {
  const upperType = type.toUpperCase();
  if (
    upperType.includes("INT") ||
    upperType.includes("DOUBLE") ||
    upperType.includes("FLOAT") ||
    upperType.includes("DECIMAL")
  ) {
    return <Hash className="w-3 h-3" />;
  } else if (upperType.includes("DATE") || upperType.includes("TIME")) {
    return <Calendar className="w-3 h-3" />;
  } else if (upperType.includes("BOOL")) {
    return <ToggleLeft className="w-3 h-3" />;
  }
  return <Type className="w-3 h-3" />;
};

const getTypeColor = (type: string) => {
  const upperType = type.toUpperCase();
  if (
    upperType.includes("INT") ||
    upperType.includes("DOUBLE") ||
    upperType.includes("FLOAT") ||
    upperType.includes("DECIMAL")
  ) {
    return "text-purple-500 bg-purple-500/10";
  } else if (upperType.includes("DATE") || upperType.includes("TIME")) {
    return "text-green-500 bg-green-500/10";
  } else if (upperType.includes("BOOL")) {
    return "text-yellow-500 bg-yellow-500/10";
  }
  return "text-blue-500 bg-blue-500/10";
};

const getFillColor = (percentage: number) => {
  if (percentage >= 90) return "bg-green-500";
  if (percentage >= 50) return "bg-yellow-500";
  return "bg-red-500";
};

export const ColumnNode: React.FC<ColumnNodeProps> = ({
  stats,
  databaseName,
  tableName,
  schema,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [distribution, setDistribution] = useState<ColumnDistribution | null>(null);
  // Ref, not state: it only gates the one-shot fetch and never drives rendering.
  const distributionRequested = useRef(false);
  const fetchColumnDistribution = useDuckStore((s) => s.fetchColumnDistribution);

  // Fetch the value distribution once, when the column is first expanded.
  useEffect(() => {
    if (!isExpanded || distributionRequested.current || !databaseName || !tableName) return;
    let stale = false;
    distributionRequested.current = true;
    fetchColumnDistribution(
      databaseName,
      tableName,
      stats.column_name,
      stats.column_type,
      schema
    ).then((dist) => {
      if (!stale) setDistribution(dist);
    });
    return () => {
      stale = true;
    };
  }, [
    isExpanded,
    databaseName,
    tableName,
    schema,
    stats.column_name,
    stats.column_type,
    fetchColumnDistribution,
  ]);

  // Safe parsing function that handles both string and number types
  const parseValue = (value: string | number): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      // Remove quotes if present
      const cleaned = value.replace(/"/g, "");
      return parseFloat(cleaned) || 0;
    }
    return 0;
  };

  const nullPercentage = parseValue(stats.null_percentage);
  const fillPercentage = 100 - nullPercentage;
  const uniqueCount = stats.approx_unique ? parseValue(stats.approx_unique) : 0;
  const totalCount = parseValue(stats.count);

  const isNumeric =
    stats.column_type.toUpperCase().includes("INT") ||
    stats.column_type.toUpperCase().includes("DOUBLE") ||
    stats.column_type.toUpperCase().includes("FLOAT") ||
    stats.column_type.toUpperCase().includes("DECIMAL");

  return (
    <div className="ml-8">
      <div
        className="flex items-center py-1.5 px-2 hover:bg-secondary/50 rounded-md cursor-pointer group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          )}

          <div className={`flex-shrink-0 p-1 rounded ${getTypeColor(stats.column_type)}`}>
            {getTypeIcon(stats.column_type)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium truncate">{stats.column_name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {stats.column_type}
              </span>
            </div>

            {!isExpanded && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 max-w-[120px]">
                  <div className="flex items-center gap-1">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getFillColor(fillPercentage)} transition-all`}
                        style={{ width: `${fillPercentage}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {fillPercentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {uniqueCount.toLocaleString()} unique
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="ml-6 mt-1 mb-2 p-2 bg-muted/30 rounded-md space-y-2">
          {/* Value distribution */}
          {distribution?.kind === "histogram" && distribution.bins.some((b) => b > 0) && (
            <div className="space-y-1">
              <div className="text-[9px] text-muted-foreground font-medium">Distribution</div>
              <div className="flex items-end gap-px h-8">
                {distribution.bins.map((count, i) => {
                  const maxCount = Math.max(...distribution.bins);
                  const height =
                    maxCount > 0 ? Math.max(count > 0 ? 8 : 0, (count / maxCount) * 100) : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-primary/60 rounded-t-[1px] min-w-[2px]"
                      style={{ height: `${height}%` }}
                      title={`${count.toLocaleString()} rows`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground font-mono">
                <span className="truncate max-w-[45%]" title={stats.min ?? ""}>
                  {stats.min}
                </span>
                <span className="truncate max-w-[45%] text-right" title={stats.max ?? ""}>
                  {stats.max}
                </span>
              </div>
            </div>
          )}
          {distribution?.kind === "topk" && distribution.values.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-muted-foreground font-medium">Top values</div>
              {distribution.values.map(({ value, count }) => {
                const maxCount = distribution.values[0]?.count || 1;
                return (
                  <div key={value} className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-mono truncate w-[45%] text-muted-foreground"
                      title={value}
                    >
                      {value}
                    </span>
                    <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] font-mono text-muted-foreground">
                      {count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fill Percentage */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Data Fill</span>
              <span className="font-medium">{fillPercentage.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full ${getFillColor(fillPercentage)} transition-all`}
                style={{ width: `${fillPercentage}%` }}
              />
            </div>
          </div>

          {/* Basic Stats */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-mono">{totalCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unique:</span>
              <span className="font-mono">{uniqueCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nulls:</span>
              <span className="font-mono">{((nullPercentage / 100) * totalCount).toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cardinality:</span>
              <span className="font-mono">
                {isNaN((uniqueCount / totalCount) * 100)
                  ? "0.0"
                  : ((uniqueCount / totalCount) * 100).toFixed(1)}
                %
              </span>
            </div>
          </div>

          {/* Numeric Stats */}
          {isNumeric && stats.avg && (
            <>
              <div className="border-t border-border/50 my-1" />
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min:</span>
                  <span className="font-mono">{parseValue(stats.min!).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max:</span>
                  <span className="font-mono">{parseValue(stats.max!).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg:</span>
                  <span className="font-mono">
                    {parseValue(stats.avg).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {stats.std && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Std Dev:</span>
                    <span className="font-mono">
                      {parseValue(stats.std).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>

              {stats.q25 && stats.q50 && stats.q75 && (
                <>
                  <div className="border-t border-border/50 my-1" />
                  <div className="space-y-1 text-[10px]">
                    <div className="text-[9px] text-muted-foreground font-medium mb-1">
                      Quartiles
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Q1 (25%):</span>
                      <span className="font-mono text-[9px]">
                        {parseValue(stats.q25).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Q2 (50%):</span>
                      <span className="font-mono text-[9px]">
                        {parseValue(stats.q50).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Q3 (75%):</span>
                      <span className="font-mono text-[9px]">
                        {parseValue(stats.q75).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* String Stats */}
          {!isNumeric && stats.min && stats.max && (
            <>
              <div className="border-t border-border/50 my-1" />
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">Min:</span>
                  <span className="font-mono truncate text-right" title={stats.min}>
                    {stats.min}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">Max:</span>
                  <span className="font-mono truncate text-right" title={stats.max}>
                    {stats.max}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ColumnNode;

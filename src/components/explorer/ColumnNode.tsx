import React, { useState } from "react";
import { ChevronRight, ChevronDown, Hash, Type, Calendar, ToggleLeft } from "lucide-react";
import { type ColumnStats } from "@/store";

interface ColumnNodeProps {
  stats: ColumnStats;
}

const getTypeIcon = (type: string) => {
  const upperType = type.toUpperCase();
  if (upperType.includes("INT") || upperType.includes("DOUBLE") || upperType.includes("FLOAT") || upperType.includes("DECIMAL")) {
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
  if (upperType.includes("INT") || upperType.includes("DOUBLE") || upperType.includes("FLOAT") || upperType.includes("DECIMAL")) {
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

export const ColumnNode: React.FC<ColumnNodeProps> = ({ stats }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const nullPercentage = parseFloat(stats.null_percentage.replace(/"/g, ''));
  const fillPercentage = 100 - nullPercentage;
  const uniqueCount = stats.approx_unique ? parseInt(stats.approx_unique) : 0;
  const totalCount = parseInt(stats.count);

  const isNumeric = stats.column_type.toUpperCase().includes("INT") ||
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
              <span className="font-mono">{((uniqueCount / totalCount) * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Numeric Stats */}
          {isNumeric && stats.avg && (
            <>
              <div className="border-t border-border/50 my-1" />
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min:</span>
                  <span className="font-mono">{parseFloat(stats.min!).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max:</span>
                  <span className="font-mono">{parseFloat(stats.max!).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg:</span>
                  <span className="font-mono">{parseFloat(stats.avg).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                {stats.std && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Std Dev:</span>
                    <span className="font-mono">{parseFloat(stats.std).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              {stats.q25 && stats.q50 && stats.q75 && (
                <>
                  <div className="border-t border-border/50 my-1" />
                  <div className="space-y-1 text-[10px]">
                    <div className="text-[9px] text-muted-foreground font-medium mb-1">Quartiles</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Q1 (25%):</span>
                      <span className="font-mono text-[9px]">{parseFloat(stats.q25).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Q2 (50%):</span>
                      <span className="font-mono text-[9px]">{parseFloat(stats.q50).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Q3 (75%):</span>
                      <span className="font-mono text-[9px]">{parseFloat(stats.q75).toLocaleString()}</span>
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
                  <span className="font-mono truncate text-right" title={stats.min}>{stats.min}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">Max:</span>
                  <span className="font-mono truncate text-right" title={stats.max}>{stats.max}</span>
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

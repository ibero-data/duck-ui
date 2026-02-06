import { useRef, useEffect, useCallback } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface UPlotChartProps {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  className?: string;
}

export default function UPlotChart({ options, data, className }: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const create = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const { width, height } = el.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    chartRef.current?.destroy();
    chartRef.current = new uPlot({ ...options, width, height }, data, el);
  }, [options, data]);

  useEffect(() => {
    create();

    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        chartRef.current?.setSize({ width: w, height: h });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [create]);

  return <div ref={containerRef} className={className} style={{ minHeight: 0 }} />;
}

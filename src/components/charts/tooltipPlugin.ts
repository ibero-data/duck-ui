import uPlot from "uplot";
import { formatNumberWithSuffix } from "@/lib/chartUtils";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface TooltipPluginOptions {
  stacked?: boolean;
}

export function tooltipPlugin(xLabels: string[], opts?: TooltipPluginOptions): uPlot.Plugin {
  let tooltip: HTMLDivElement;
  let over: HTMLElement;
  const isStacked = opts?.stacked ?? false;

  return {
    hooks: {
      init(u: uPlot) {
        over = u.over;

        tooltip = document.createElement("div");
        tooltip.className = "uplot-tooltip";
        tooltip.style.display = "none";
        tooltip.style.position = "absolute";
        tooltip.style.pointerEvents = "none";
        tooltip.style.zIndex = "100";
        over.appendChild(tooltip);

        over.addEventListener("mouseenter", () => {
          tooltip.style.display = "block";
        });
        over.addEventListener("mouseleave", () => {
          tooltip.style.display = "none";
        });
      },

      setSize() {
        // bounds recalculated in setCursor via over.clientWidth/Height
      },

      setCursor(u: uPlot) {
        const { idx, left, top } = u.cursor;
        if (idx == null || left == null || top == null) {
          tooltip.style.display = "none";
          return;
        }

        const xLabel = escapeHtml(xLabels[idx] ?? String(u.data[0][idx]));
        let html = `<div class="uplot-tooltip-title">${xLabel}</div>`;

        let total = 0;
        const rows: { label: string; color: string; val: number | null }[] = [];

        for (let i = 1; i < u.series.length; i++) {
          const s = u.series[i];
          if (!s.show) continue;
          const rawVal = u.data[i][idx];
          const val = rawVal != null ? (rawVal as number) : null;
          const color =
            typeof s.stroke === "function"
              ? (s.stroke as (self: uPlot, seriesIdx: number) => string)(u, i)
              : s.stroke;
          const safeLabel = typeof s.label === "string" ? escapeHtml(s.label) : "";
          const safeColor = typeof color === "string" ? escapeHtml(color) : "";

          if (val != null) total += val;
          rows.push({ label: safeLabel, color: safeColor, val });
        }

        for (const row of rows) {
          const formatted = row.val != null ? formatNumberWithSuffix(row.val) : "\u2014";
          const pct =
            isStacked && row.val != null && total > 0
              ? ` <span class="uplot-tooltip-pct">(${((row.val / total) * 100).toFixed(1)}%)</span>`
              : "";
          html += `<div class="uplot-tooltip-row">
            <span class="uplot-tooltip-dot" style="background:${row.color}"></span>
            <span class="uplot-tooltip-label">${row.label}</span>
            <span class="uplot-tooltip-value">${formatted}${pct}</span>
          </div>`;
        }

        if (isStacked && rows.length > 1) {
          html += `<div class="uplot-tooltip-total">
            <span class="uplot-tooltip-label">Total</span>
            <span class="uplot-tooltip-value">${formatNumberWithSuffix(total)}</span>
          </div>`;
        }

        tooltip.innerHTML = html;

        const tooltipW = tooltip.offsetWidth;
        const tooltipH = tooltip.offsetHeight;
        const overW = over.clientWidth;
        const overH = over.clientHeight;
        const pad = 12;

        let posLeft = left + pad;
        let posTop = top - tooltipH / 2;

        if (posLeft + tooltipW > overW) posLeft = left - tooltipW - pad;
        if (posTop < 0) posTop = 0;
        if (posTop + tooltipH > overH) posTop = overH - tooltipH;

        tooltip.style.left = posLeft + "px";
        tooltip.style.top = posTop + "px";
        tooltip.style.display = "block";
      },
    },
  };
}

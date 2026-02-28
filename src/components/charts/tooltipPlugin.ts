import uPlot from "uplot";
import { formatNumber } from "@/lib/chartUtils";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function tooltipPlugin(xLabels: string[]): uPlot.Plugin {
  let tooltip: HTMLDivElement;
  let over: HTMLElement;

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

        for (let i = 1; i < u.series.length; i++) {
          const s = u.series[i];
          if (!s.show) continue;
          const val = u.data[i][idx];
          const color =
            typeof s.stroke === "function"
              ? (s.stroke as (self: uPlot, seriesIdx: number) => string)(u, i)
              : s.stroke;
          const safeLabel = typeof s.label === "string" ? escapeHtml(s.label) : "";
          const safeColor = typeof color === "string" ? escapeHtml(color) : "";
          html += `<div class="uplot-tooltip-row">
            <span class="uplot-tooltip-dot" style="background:${safeColor}"></span>
            <span class="uplot-tooltip-label">${safeLabel}</span>
            <span class="uplot-tooltip-value">${val != null ? formatNumber(val as number) : "\u2014"}</span>
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

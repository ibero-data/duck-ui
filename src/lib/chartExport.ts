/**
 * Chart export utilities for PNG, SVG formats
 * Uses html2canvas and SVG manipulation for high-quality exports
 */

/**
 * Helper to trigger a blob download
 */
const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export chart as PNG image.
 * For canvas-based charts (uPlot), captures the canvas directly.
 * For SVG-based charts (pie/donut), falls back to html2canvas.
 */
export const exportChartAsPNG = async (
  chartElement: HTMLElement,
  fileName: string = "chart.png",
  backgroundColor: string = "#ffffff"
): Promise<void> => {
  try {
    // Direct canvas capture (uPlot renders to <canvas>)
    const sourceCanvas = chartElement.querySelector("canvas");
    if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const offscreen = document.createElement("canvas");
      offscreen.width = sourceCanvas.width;
      offscreen.height = sourceCanvas.height;
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(sourceCanvas, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))), "image/png");
      });
      downloadBlob(blob, fileName);
      return;
    }

    // Fallback: html2canvas for SVG-based charts (pie/donut)
    const html2canvas = (await import("html2canvas")).default;
    const rendered = await html2canvas(chartElement, {
      backgroundColor,
      scale: 2,
      logging: false,
      useCORS: true,
    });

    rendered.toBlob((blob) => {
      if (!blob) throw new Error("Failed to create image blob");
      downloadBlob(blob, fileName);
    }, "image/png");
  } catch (error) {
    console.error("Failed to export chart as PNG:", error);
    throw new Error("Failed to export chart as PNG. Please try again.");
  }
};

/**
 * Export chart as SVG (works for SVG-based charts like pie/donut)
 * For canvas-based charts (uPlot), falls back to PNG export.
 */
export const exportChartAsSVG = async (
  chartElement: HTMLElement,
  fileName: string = "chart.svg"
): Promise<void> => {
  try {
    // Find SVG element in the chart
    const svgElement = chartElement.querySelector("svg");
    if (!svgElement) {
      // Canvas-based chart (uPlot) — fall back to PNG
      await exportChartAsPNG(chartElement, fileName.replace(/\.svg$/, ".png"));
      return;
    }

    // Clone SVG to avoid modifying original
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;

    // Add XML namespace if not present
    if (!clonedSvg.hasAttribute("xmlns")) {
      clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    // Get SVG string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);

    // Create blob and download
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export chart as SVG:", error);
    throw new Error("Failed to export chart as SVG. Please try again.");
  }
};

/**
 * Copy chart as image to clipboard
 */
export const copyChartToClipboard = async (
  chartElement: HTMLElement,
  backgroundColor: string = "#ffffff"
): Promise<void> => {
  try {
    let blob: Blob;

    // Direct canvas capture (uPlot)
    const sourceCanvas = chartElement.querySelector("canvas");
    if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const offscreen = document.createElement("canvas");
      offscreen.width = sourceCanvas.width;
      offscreen.height = sourceCanvas.height;
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(sourceCanvas, 0, 0);

      blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))), "image/png");
      });
    } else {
      // Fallback: html2canvas for SVG-based charts
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(chartElement, {
        backgroundColor,
        scale: 2,
        logging: false,
        useCORS: true,
      });

      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))), "image/png");
      });
    }

    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (error) {
    console.error("Failed to copy chart to clipboard:", error);
    throw new Error("Failed to copy chart to clipboard. Please try again.");
  }
};

/**
 * Print chart
 */
export const printChart = (chartElement: HTMLElement): void => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Failed to open print window. Please allow popups.");
  }

  // Try SVG first, then canvas (uPlot)
  const svgElement = chartElement.querySelector("svg");
  const canvasElement = chartElement.querySelector("canvas");

  if (!svgElement && !canvasElement) {
    printWindow.close();
    throw new Error("No chart found to print");
  }

  let chartContent: string;
  if (svgElement) {
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;
    const serializer = new XMLSerializer();
    chartContent = serializer.serializeToString(clonedSvg);
  } else {
    const dataUrl = canvasElement!.toDataURL("image/png");
    chartContent = `<img src="${dataUrl}" style="max-width:100%;height:auto;" />`;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Chart</title>
        <style>
          @media print {
            body {
              margin: 0;
              padding: 20px;
            }
            svg, img {
              max-width: 100%;
              height: auto;
            }
          }
        </style>
      </head>
      <body>
        ${chartContent}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
};

/**
 * Generate shareable URL with chart configuration
 */
export const generateShareableURL = (
  chartConfig: Record<string, any>,
  querySQL?: string
): string => {
  const params = new URLSearchParams();

  // Encode chart configuration
  params.set("chart", btoa(JSON.stringify(chartConfig)));

  // Optionally include query
  if (querySQL) {
    params.set("query", btoa(querySQL));
  }

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
};

/**
 * Parse chart configuration from URL
 */
export const parseChartFromURL = (): {
  chartConfig?: Record<string, any>;
  query?: string;
} | null => {
  try {
    const params = new URLSearchParams(window.location.search);

    const chartParam = params.get("chart");
    const queryParam = params.get("query");

    if (!chartParam) return null;

    return {
      chartConfig: JSON.parse(atob(chartParam)),
      query: queryParam ? atob(queryParam) : undefined,
    };
  } catch (error) {
    console.error("Failed to parse chart from URL:", error);
    return null;
  }
};

/**
 * Get chart element dimensions for export
 */
export const getChartDimensions = (
  chartElement: HTMLElement
): { width: number; height: number } => {
  const rect = chartElement.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
};

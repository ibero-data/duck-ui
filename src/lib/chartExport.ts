/**
 * Chart export utilities for PNG, SVG formats
 * Uses html2canvas and SVG manipulation for high-quality exports
 */

/**
 * Export chart as PNG image
 */
export const exportChartAsPNG = async (
  chartElement: HTMLElement,
  fileName: string = "chart.png",
  backgroundColor: string = "#ffffff"
): Promise<void> => {
  try {
    // Dynamic import to reduce bundle size
    const html2canvas = (await import("html2canvas")).default;

    const canvas = await html2canvas(chartElement, {
      backgroundColor,
      scale: 2, // Higher resolution
      logging: false,
      useCORS: true,
    });

    // Convert canvas to blob and download
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error("Failed to create image blob");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  } catch (error) {
    console.error("Failed to export chart as PNG:", error);
    throw new Error("Failed to export chart as PNG. Please try again.");
  }
};

/**
 * Export chart as SVG
 */
export const exportChartAsSVG = async (
  chartElement: HTMLElement,
  fileName: string = "chart.svg"
): Promise<void> => {
  try {
    // Find SVG element in the chart
    const svgElement = chartElement.querySelector("svg");
    if (!svgElement) {
      throw new Error("No SVG element found in chart");
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
  chartElement: HTMLElement
): Promise<void> => {
  try {
    const html2canvas = (await import("html2canvas")).default;

    const canvas = await html2canvas(chartElement, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      useCORS: true,
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob"));
        }
      }, "image/png");
    });

    // Copy to clipboard
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
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

  const svgElement = chartElement.querySelector("svg");
  if (!svgElement) {
    printWindow.close();
    throw new Error("No chart found to print");
  }

  const clonedSvg = svgElement.cloneNode(true) as SVGElement;
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);

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
            svg {
              max-width: 100%;
              height: auto;
            }
          }
        </style>
      </head>
      <body>
        ${svgString}
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

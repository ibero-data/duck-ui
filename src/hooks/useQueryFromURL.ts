import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useDuckStore } from "@/store";
import { toast } from "sonner";
import { decodeShare, readShareParam, clearShareHash, serializeShareCells } from "@/lib/share";

/**
 * Hook to load an analysis from the URL.
 *
 * Two formats are supported:
 *  - `#s=<payload>`  — full-tab share (SQL or notebook + chart config), the
 *    rich format produced by the Share button. See `src/lib/share`.
 *  - `?query=<base64>&execute=true` — legacy query-only links.
 */
// Module-level, not a ref: the workspace remounts when the profile gate
// resolves, and a per-mount ref would process the URL once per mount —
// duplicating the shared tab.
let hasProcessedQueryFromURL = false;

export function useQueryFromURL() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { createTab, executeQuery, updateTabChartConfig, isInitialized } = useDuckStore();

  useEffect(() => {
    // Only process once and after DuckDB is initialized.
    if (hasProcessedQueryFromURL || !isInitialized) return;

    const shareParam = readShareParam();
    const queryParam = searchParams.get("query");
    if (!shareParam && !queryParam) return;

    hasProcessedQueryFromURL = true;
    console.debug("[share] processing analysis from URL");

    // Rich full-tab share takes precedence.
    if (shareParam) {
      void (async () => {
        const payload = await decodeShare(shareParam);
        clearShareHash();

        if (!payload) {
          toast.error("This shared link is invalid or corrupted.");
          return;
        }

        if (payload.type === "notebook") {
          const content = payload.cells ? serializeShareCells(payload.cells) : "";
          createTab("notebook", content, payload.title);
          toast.success("Shared notebook loaded");
          return;
        }

        // SQL share
        const sql = payload.sql ?? "";
        const tabId = createTab("sql", sql, payload.title);
        if (payload.chartConfig && tabId) {
          updateTabChartConfig(tabId, payload.chartConfig);
        }
        toast.success("Shared analysis loaded");

        if (payload.autoRun && sql.trim() && tabId) {
          // Small delay to ensure the tab is mounted before executing.
          setTimeout(() => {
            executeQuery(sql, tabId).catch(() => {
              toast.error(
                "Couldn't run the shared query automatically — it may need data that isn't loaded yet."
              );
            });
          }, 100);
        }
      })();
      return;
    }

    // Legacy query-only link.
    try {
      const decodedQuery = atob(queryParam as string);
      if (!decodedQuery.trim()) {
        toast.error("Empty query in URL");
        return;
      }

      const tabId = createTab("sql", decodedQuery);
      toast.success("Query loaded from URL");

      if (searchParams.get("execute") === "true" && tabId) {
        console.debug("[share] scheduling auto-run for tab", tabId);
        setTimeout(() => {
          console.debug("[share] auto-running query for tab", tabId);
          executeQuery(decodedQuery, tabId);
        }, 100);
      }

      setSearchParams({}, { replace: true });
    } catch (error) {
      console.error("Failed to decode query from URL:", error);
      toast.error("Failed to decode query from URL. Invalid base64 encoding.");
    }
  }, [searchParams, setSearchParams, createTab, executeQuery, updateTabChartConfig, isInitialized]);
}

/**
 * Generate a shareable URL with the query encoded in base64 (legacy format).
 * Prefer `buildTabShareUrl` from `src/lib/share` for full-tab shares.
 */
export function generateQueryURL(query: string, autoExecute = false): string {
  const base64Query = btoa(query);
  const params = new URLSearchParams();
  params.set("query", base64Query);
  if (autoExecute) {
    params.set("execute", "true");
  }
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/**
 * Copy the shareable query URL to clipboard (legacy format).
 */
export async function copyQueryURL(query: string, autoExecute = false): Promise<boolean> {
  try {
    const url = generateQueryURL(query, autoExecute);
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    console.error("Failed to copy URL to clipboard:", error);
    return false;
  }
}

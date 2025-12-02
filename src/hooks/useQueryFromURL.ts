import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useDuckStore } from "@/store";
import { toast } from "sonner";

/**
 * Hook to handle loading queries from URL parameters.
 * Supports base64-encoded queries via ?query=<base64>&execute=true
 */
export function useQueryFromURL() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { createTab, executeQuery, isInitialized } = useDuckStore();
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Only process once and after DuckDB is initialized
    if (hasProcessedRef.current || !isInitialized) return;

    const queryParam = searchParams.get("query");
    const executeParam = searchParams.get("execute");

    if (!queryParam) return;

    try {
      // Decode the base64 query
      const decodedQuery = atob(queryParam);

      if (!decodedQuery.trim()) {
        toast.error("Empty query in URL");
        return;
      }

      // Create a new SQL tab with the decoded query
      const tabId = createTab("sql", decodedQuery);
      hasProcessedRef.current = true;

      toast.success("Query loaded from URL");

      // Auto-execute if requested
      if (executeParam === "true" && tabId) {
        // Small delay to ensure tab is created
        setTimeout(() => {
          executeQuery(decodedQuery, tabId);
        }, 100);
      }

      // Clear the URL params after processing
      setSearchParams({}, { replace: true });
    } catch (error) {
      console.error("Failed to decode query from URL:", error);
      toast.error("Failed to decode query from URL. Invalid base64 encoding.");
      hasProcessedRef.current = true;
    }
  }, [searchParams, setSearchParams, createTab, executeQuery, isInitialized]);
}

/**
 * Generate a shareable URL with the query encoded in base64
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
 * Copy the shareable query URL to clipboard
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

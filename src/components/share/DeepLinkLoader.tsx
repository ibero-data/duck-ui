import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router";
import { Database, ExternalLink, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useDuckStore } from "@/store";
import { getUiConfig } from "@/lib/appConfig";
import {
  parseDeepLink,
  buildSourceSQL,
  defaultDeepLinkQuery,
  isLikelyCorsError,
  type DeepLinkRequest,
} from "@/lib/deepLink";

const HOSTING_GUIDE_URL = "https://github.com/caioricciuti/duck-ui/blob/main/docs/hosting-data.md";

/**
 * Handles "Open in Duck-UI" links (`?load=<url>&sql=...`).
 *
 * Deep links arrive from strangers' READMEs, so nothing runs on arrival:
 * a confirmation lists every remote host and the SQL, and only after the
 * user accepts do we attach the sources and open/run the query. Kiosk
 * deployments with imports hidden ignore these links entirely.
 */
export function DeepLinkLoader() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialized = useDuckStore((s) => s.isInitialized);
  const createTab = useDuckStore((s) => s.createTab);
  const executeQuery = useDuckStore((s) => s.executeQuery);
  const fetchDatabasesAndTablesInfo = useDuckStore((s) => s.fetchDatabasesAndTablesInfo);

  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Derived during render — no effect, no sync setState. The dialog shows as
  // long as the URL carries a valid load request the user hasn't dismissed.
  // Kiosk publishers pin their own data; links can't add more there.
  const request: DeepLinkRequest | null = useMemo(() => {
    if (!isInitialized || dismissed || getUiConfig().hideImport) return null;
    // No deep links inside iframes: an embedding page could overlay bait on
    // top of the confirm dialog (clickjacking), and embeds have their own
    // share-payload mechanism anyway.
    if (window.top !== window.self) return null;
    return parseDeepLink(searchParams);
  }, [isInitialized, dismissed, searchParams]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const handleLoad = useCallback(
    async (run: boolean) => {
      if (!request) return;
      const { connection, currentSession } = useDuckStore.getState();
      // Deep links attach into the in-browser engine; on a connection that
      // executes elsewhere the loaded sources would be invisible. Keep the
      // dialog open so the link isn't consumed.
      if (!connection || !currentSession?.capabilities.supportsFileImport) {
        toast.error("Shared data loads into the in-browser DuckDB engine", {
          description: "Switch to a WASM or OPFS connection, then open this link again.",
        });
        return;
      }
      setIsLoading(true);

      try {
        for (const source of request.sources) {
          if (!connection) throw new Error("DuckDB connection not initialized");
          try {
            await connection.query(buildSourceSQL(source));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (isLikelyCorsError(message)) {
              toast.error(`Couldn't reach ${new URL(source.url.replace(/^ducklake:/, "")).host}`, {
                description:
                  "The host must allow cross-origin (CORS) requests for browsers to read it. See the hosting guide for a free setup that works.",
                action: {
                  label: "Hosting guide",
                  onClick: () => window.open(HOSTING_GUIDE_URL, "_blank", "noopener"),
                },
                duration: 15000,
              });
            } else {
              toast.error(`Failed to load ${source.name}: ${message}`);
            }
            throw error;
          }
        }

        await fetchDatabasesAndTablesInfo();

        const sql = request.sql ?? defaultDeepLinkQuery(request.sources);
        const tabId = createTab("sql", sql, request.sources[0]?.name ?? "Shared data");
        toast.success(
          request.sources.length === 1
            ? `Loaded ${request.sources[0].name}`
            : `Loaded ${request.sources.length} sources`
        );

        if (run && sql.trim() && tabId) {
          setTimeout(() => {
            void executeQuery(sql, tabId);
          }, 100);
        }
      } catch {
        // Source-level errors already surfaced above.
      } finally {
        setIsLoading(false);
        dismiss();
      }
    },
    [request, createTab, executeQuery, fetchDatabasesAndTablesInfo, dismiss]
  );

  if (!request) return null;

  const hosts = [
    ...new Set(
      request.sources.map((s) => {
        try {
          return new URL(s.url.replace(/^ducklake:/, "")).host;
        } catch {
          return s.url;
        }
      })
    ),
  ];

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Open shared data?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>This link wants to load remote data into your Duck-UI session:</p>
              <ul className="space-y-1">
                {request.sources.map((source) => (
                  <li key={source.url} className="flex items-start gap-2 font-mono text-xs">
                    <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="break-all">
                      {source.url}{" "}
                      <span className="text-muted-foreground">→ attaches as {source.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {request.sql && (
                <>
                  <p>
                    and run this SQL ({request.sql.split("\n").length}{" "}
                    {request.sql.split("\n").length === 1 ? "line" : "lines"} — scroll to read all
                    of it):
                  </p>
                  <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs font-mono whitespace-pre-wrap">
                    {request.sql}
                  </pre>
                </>
              )}
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Everything runs in your browser only — no data leaves this tab. Sources from{" "}
                  {hosts.join(", ")} are attached read-only, but the SQL runs with full access to
                  your local session, so only open links from people you trust.
                </span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={dismiss} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleLoad(false)} disabled={isLoading}>
            Load only
          </Button>
          <Button onClick={() => handleLoad(request.autoRun)} disabled={isLoading}>
            {isLoading ? "Loading..." : request.autoRun ? "Load & run" : "Load"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

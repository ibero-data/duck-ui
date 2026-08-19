import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  BarChart3,
  Play,
  Info,
  Code2,
  SlidersHorizontal,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildShareLinks,
  queryReproducesForViewers,
  type ShareLinks,
  type SharedParam,
} from "@/lib/share";
import {
  buildDeepLink,
  buildBadgeMarkdown,
  extractRemoteSources,
  inferFormat,
  type SourceFormat,
} from "@/lib/deepLink";
import { Input } from "@/components/ui/input";
import type { EditorTab } from "@/store/types";

const NUMERIC_TYPE = /int|float|double|decimal|hugeint|numeric|real/i;
type ParamType = SharedParam["type"];

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tab to share. Null while nothing is selected. */
  tab: EditorTab | null;
}

/**
 * Visible share experience: builds the link + embed snippet, shows exactly what
 * travels (query + chart config, encoded in the URL — nothing is uploaded), and
 * lets the user copy either. Flags when the analysis reads local-only data and
 * therefore won't reproduce for a viewer.
 */
export function ShareDialog({ open, onOpenChange, tab }: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLinks | null>(null);
  const [building, setBuilding] = useState(open && !!tab);
  const [copied, setCopied] = useState<
    "link" | "iframe" | "webcomponent" | "deep" | "badge" | null
  >(null);
  const [params, setParams] = useState<SharedParam[]>([]);
  const [badgeDataUrl, setBadgeDataUrl] = useState<string | null>(null);
  const [badgeFormat, setBadgeFormat] = useState<SourceFormat>("parquet");

  const hasChart = !!tab?.chartConfig;
  const sql = typeof tab?.content === "string" ? tab.content : "";
  const remoteSource = sql ? queryReproducesForViewers(sql) : true;

  // "Open in Duck-UI" badge: prefill data URLs from the query itself.
  const detectedSources = useMemo(() => extractRemoteSources(sql), [sql]);
  const effectiveDataUrls = (badgeDataUrl ?? detectedSources.join(", "))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  // Derive from the build base, not the current route — /a share links would
  // otherwise produce /a/badge.svg and /a/?load=... URLs.
  const appOrigin = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;
  // Extension-less URLs (common on R2) need an explicit format or openers
  // get a link that silently does nothing.
  const needsFormat = effectiveDataUrls.some((url) => !inferFormat(url));
  const deepLink =
    effectiveDataUrls.length > 0
      ? buildDeepLink(`${appOrigin}/`, effectiveDataUrls, sql, {
          format: needsFormat ? badgeFormat : undefined,
        })
      : null;
  const badgeMarkdown = deepLink ? buildBadgeMarkdown(deepLink, appOrigin) : null;

  // Result columns available to expose as interactive embed filters.
  const columns = useMemo(() => {
    const cols = tab?.result?.columns ?? [];
    const types = tab?.result?.columnTypes ?? [];
    return cols.map((name, i) => ({ name, type: types[i] ?? "" }));
  }, [tab?.result]);

  // Reset dialog state whenever the share target changes (state adjustment
  // during render, per react.dev — avoids setState inside an effect).
  const shareKey = `${tab?.id}|${open}`;
  const [prevShareKey, setPrevShareKey] = useState(shareKey);
  if (shareKey !== prevShareKey) {
    setPrevShareKey(shareKey);
    setParams([]);
    setLinks(null);
    setCopied(null);
    setBadgeDataUrl(null);
    setBuilding(open && !!tab);
  }

  useEffect(() => {
    if (!open || !tab) return;
    let cancelled = false;
    buildShareLinks(tab, true, params)
      .then((built) => {
        if (!cancelled) setLinks(built);
      })
      .catch((err) => {
        console.error("Failed to build share link:", err);
        if (!cancelled) toast.error("Failed to build share link");
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, params]);

  const toggleParam = (column: string, type: string) => {
    setBuilding(true);
    setParams((prev) => {
      if (prev.some((p) => p.column === column)) {
        return prev.filter((p) => p.column !== column);
      }
      const defaultType: ParamType = NUMERIC_TYPE.test(type) ? "range" : "select";
      return [...prev, { column, type: defaultType }];
    });
  };

  const setParamType = (column: string, type: ParamType) => {
    setBuilding(true);
    setParams((prev) => prev.map((p) => (p.column === column ? { ...p, type } : p)));
  };

  const copy = async (
    text: string,
    which: "link" | "iframe" | "webcomponent" | "deep" | "badge"
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.success(which === "link" ? "Link copied to clipboard" : "Embed snippet copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Share this analysis
          </SheetTitle>
          <SheetDescription>
            Anyone who opens this gets the query and chart, reconstructed in their browser — no
            server, no signup.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* What's included */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip icon={<Check className="h-3 w-3" />}>SQL query</Chip>
            {hasChart && <Chip icon={<BarChart3 className="h-3 w-3" />}>Chart config</Chip>}
            <Chip icon={<Play className="h-3 w-3" />}>Auto-runs on open</Chip>
            {params.length > 0 && (
              <Chip icon={<SlidersHorizontal className="h-3 w-3" />}>
                {params.length} filter{params.length > 1 ? "s" : ""}
              </Chip>
            )}
          </div>

          <Tabs defaultValue="link">
            <TabsList>
              <TabsTrigger value="link" className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5" /> Link
              </TabsTrigger>
              <TabsTrigger value="embed" className="flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5" /> Embed
              </TabsTrigger>
              <TabsTrigger value="badge" className="flex items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5" /> Badge
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-2">
              <CopyField
                value={building ? "Building link…" : (links?.appUrl ?? "")}
                disabled={building || !links}
                copied={copied === "link"}
                onCopy={() => links && copy(links.appUrl, "link")}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Share in chat or social — it opens the full Duck-UI editor.
              </p>
            </TabsContent>

            <TabsContent value="embed" className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium">iframe — works anywhere</p>
                <CopyField
                  value={building ? "Building snippet…" : (links?.iframeSnippet ?? "")}
                  disabled={building || !links}
                  copied={copied === "iframe"}
                  onCopy={() => links && copy(links.iframeSnippet, "iframe")}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Paste into any HTML page, Notion, or Ghost — a live, read-only DuckDB chart that
                  runs entirely in the viewer's browser.
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  Web Component — one line, cross-origin-isolated hosts
                </p>
                <CopyField
                  value={building ? "Building snippet…" : (links?.webComponentSnippet ?? "")}
                  disabled={building || !links}
                  copied={copied === "webcomponent"}
                  onCopy={() => links && copy(links.webComponentSnippet, "webcomponent")}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Native <code className="mx-0.5">&lt;duck-embed&gt;</code> element. Needs a
                  cross-origin-isolated page (COOP/COEP); otherwise use the iframe above.
                </p>
              </div>

              {/* Interactive filters — turn result columns into embed controls */}
              {columns.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium">Interactive filters (optional)</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Let viewers filter the embed live. Pick result columns to expose as controls.
                  </p>
                  <div className="max-h-40 overflow-auto rounded-md border divide-y">
                    {columns.map((col) => {
                      const active = params.find((p) => p.column === col.name);
                      return (
                        <div
                          key={col.name}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                        >
                          <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!active}
                              onChange={() => toggleParam(col.name, col.type)}
                            />
                            <span className="truncate font-mono">{col.name}</span>
                          </label>
                          {active && (
                            <select
                              value={active.type}
                              onChange={(e) => setParamType(col.name, e.target.value as ParamType)}
                              className="text-xs border rounded px-1.5 py-0.5 bg-background shrink-0"
                            >
                              <option value="select">Dropdown</option>
                              <option value="search">Search</option>
                              <option value="range">Range</option>
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="badge" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                An <strong>Open in Duck-UI</strong> link loads remote data and this query in one
                click — paste the badge into a dataset README or blog post. Openers see a
                confirmation before anything runs.
              </p>
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Data URL(s) — comma separated</p>
                <Input
                  value={badgeDataUrl ?? detectedSources.join(", ")}
                  onChange={(e) => setBadgeDataUrl(e.target.value)}
                  placeholder="https://example.com/data.parquet"
                  className="font-mono text-xs h-8"
                />
                {detectedSources.length === 0 && !badgeDataUrl && (
                  <p className="text-xs text-muted-foreground">
                    This query doesn't read from a URL yet. Point it at hosted data (with CORS
                    enabled) so the link reproduces for anyone.
                  </p>
                )}
                {needsFormat && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      A URL has no file extension — pick its format so the link works:
                    </span>
                    <select
                      value={badgeFormat}
                      onChange={(e) => setBadgeFormat(e.target.value as SourceFormat)}
                      className="text-xs border rounded px-1.5 py-0.5 bg-background"
                    >
                      <option value="parquet">Parquet</option>
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                      <option value="duckdb">DuckDB</option>
                    </select>
                  </div>
                )}
              </div>
              {deepLink && badgeMarkdown && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Deep link</p>
                    <CopyField
                      value={deepLink}
                      disabled={false}
                      copied={copied === "deep"}
                      onCopy={() => copy(deepLink, "deep")}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Markdown badge</p>
                    <CopyField
                      value={badgeMarkdown}
                      disabled={false}
                      copied={copied === "badge"}
                      onCopy={() => copy(badgeMarkdown, "badge")}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Renders as{" "}
                      <img
                        src={`${import.meta.env.BASE_URL}badge.svg`}
                        alt="Open in Duck-UI"
                        className="inline h-4 align-text-bottom"
                      />
                    </p>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {/* Data caveat — strong warning when the query reads local-only data */}
          {remoteSource ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                The link carries the query, not the data. This one reads from a URL, so it
                reproduces fully for anyone who opens it.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Heads up: this query reads a <strong>locally-imported table</strong>, so it won't
                reproduce for viewers. To make a shareable/embeddable analysis, read from a URL
                instead — e.g. <code className="mx-0.5">read_parquet('https://…')</code>.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1">
      {icon}
      {children}
    </span>
  );
}

function CopyField({
  value,
  disabled,
  copied,
  onCopy,
  rows,
}: {
  value: string;
  disabled: boolean;
  copied: boolean;
  onCopy: () => void;
  rows: number;
}) {
  return (
    <div className="flex gap-2">
      <Textarea
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs resize-none"
        style={{ height: `${rows * 1.5 + 1}rem` }}
      />
      <Button
        onClick={onCopy}
        disabled={disabled}
        size="icon"
        className="w-12 shrink-0"
        style={{ height: `${rows * 1.5 + 1}rem` }}
        aria-label="Copy"
      >
        {disabled ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : copied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

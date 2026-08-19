import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDuckStore } from "@/store";
import { datasetsFor, getDashboardInputs, getDashboardRunner } from "@/store/slices/dashboardSlice";
import { datasetCacheKey } from "@/services/dashboard/queryRunner";
import { parseDashboardSource } from "@/services/dashboard/markdown";
import type { DatasetResult } from "@/services/dashboard/queryRunner";
import type { InputValue } from "@/services/dashboard/inputs";
import { enableDashboardCompletions } from "./dashboardCompletions";
import {
  createCellEditor,
  useMonacoConfig,
  type EditorInstance,
} from "@/components/editor/monacoConfig";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Copy, Eye, Loader2, Pencil, RefreshCw, Share2 } from "lucide-react";
import ShareDashboardDialog from "./ShareDashboardDialog";
import ShareLiveDialog from "@/components/collaboration/ShareLiveDialog";
import MarkdownDashboard from "./MarkdownDashboard";
import { getCollaboration } from "@/store/slices/sessionSlice";
import {
  bindCollaborativeEditor,
  type CollaborativeBinding,
} from "@/components/editor/collaborativeBinding";
import type * as Y from "yjs";

interface DashboardTabProps {
  tabId: string;
}

/** Shared empty snapshots — a fresh Map per read would loop the subscription. */
const EMPTY_RESULTS: ReadonlyMap<string, DatasetResult> = new Map();
const EMPTY_INPUTS: ReadonlyMap<string, InputValue> = new Map();

/**
 * A dashboard document, as a workspace tab.
 *
 * View renders the document like a report. Edit is a split pane: markdown
 * source on the left, the live document on the right, re-rendered as you type.
 * The source is what persists and what a live session shares — the document IS
 * the dashboard.
 */
export default function DashboardTab({ tabId }: DashboardTabProps) {
  const tabs = useDuckStore((s) => s.tabs);
  const dashboards = useDuckStore((s) => s.dashboards);
  const isEditing = useDuckStore((s) => s.isDashboardEditing);
  const setEditing = useDuckStore((s) => s.setDashboardEditing);
  const updateDashboard = useDuckStore((s) => s.updateDashboard);
  const runDashboard = useDuckStore((s) => s.runDashboard);
  const duplicateDashboard = useDuckStore((s) => s.duplicateDashboard);
  const openDashboardTab = useDuckStore((s) => s.openDashboardTab);
  const engineReady = useDuckStore((s) => s.isInitialized);
  const sessionStatus = useDuckStore((s) => s.session.status);

  const tab = tabs.find((entry) => entry.id === tabId);
  const dashboardId = typeof tab?.content === "string" ? tab.content : "";
  const dashboard = dashboards.find((entry) => entry.id === dashboardId);

  const [refreshing, setRefreshing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  // The draft leads while typing; the store catches up on a debounce. Null
  // means "no local edits pending" and the stored source is authoritative.
  const [draft, setDraft] = useState<string | null>(null);
  const source = draft ?? dashboard?.source ?? "";

  const parsed = useMemo(() => parseDashboardSource(source), [source]);

  // Results come from the runner, not the store — a refresh must not push
  // every batch through a Zustand subscription.
  const subscribe = useCallback(
    (onChange: () => void) =>
      dashboardId ? getDashboardRunner(dashboardId).onChange(onChange) : () => {},
    [dashboardId]
  );
  const getSnapshot = useCallback(
    () => (dashboardId ? getDashboardRunner(dashboardId).snapshot() : EMPTY_RESULTS),
    [dashboardId]
  );
  const results = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Input values, same pattern: view state living beside the runner.
  const subscribeInputs = useCallback(
    (onChange: () => void) =>
      dashboardId ? getDashboardInputs(dashboardId).subscribe(onChange) : () => {},
    [dashboardId]
  );
  const getInputsSnapshot = useCallback(
    () => (dashboardId ? getDashboardInputs(dashboardId).snapshot() : EMPTY_INPUTS),
    [dashboardId]
  );
  const inputValues = useSyncExternalStore(subscribeInputs, getInputsSnapshot, getInputsSnapshot);

  // Debounced persistence of edits.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSourceChange = useCallback(
    (value: string) => {
      setDraft(value);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const current = useDuckStore.getState().dashboards.find((d) => d.id === dashboardId);
        if (current) void updateDashboard({ ...current, source: value });
      }, 600);
    },
    [dashboardId, updateDashboard]
  );
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Run whatever the document declares, whenever the set of queries changes.
  // Keyed on name+sql: editing a query re-runs it, editing prose does not.
  // `engineReady` is a dependency for the reload path: a restored dashboard
  // tab renders BEFORE the WASM engine finishes booting, so the first run
  // fails with "connection not available" — and without re-running when the
  // engine arrives, it would stay failed forever.
  const querySignature = parsed.queries.map((query) => `${query.name}:${query.sql}`).join(" ");
  const lastRunKeys = useRef(new Map<string, string>());
  useEffect(() => {
    if (!engineReady || !dashboardId || !dashboard || parsed.queries.length === 0) return;
    const runner = getDashboardRunner(dashboardId);
    // Only datasets whose FINAL SQL changed re-run. Turning a date picker must
    // re-run the queries that reference it and leave the rest untouched.
    for (const dataset of datasetsFor({ ...dashboard, source }, inputValues)) {
      const key = datasetCacheKey(dataset);
      if (lastRunKeys.current.get(dataset.id) === key) continue;
      lastRunKeys.current.set(dataset.id, key);
      void runner.run(dataset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, querySignature, engineReady, inputValues]);

  if (!dashboard) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <p className="text-sm text-muted-foreground">This dashboard is not available.</p>
        <p className="text-xs text-muted-foreground">It may still be loading, or it was deleted.</p>
      </div>
    );
  }

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await runDashboard(dashboard.id, true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <Input
              value={dashboard.name}
              onChange={(event) => updateDashboard({ ...dashboard, name: event.target.value })}
              className="h-7 max-w-xs text-sm font-medium"
              aria-label="Dashboard name"
            />
          ) : (
            <p className="truncate text-sm font-medium">{parsed.title ?? dashboard.name}</p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleRefreshAll}
          disabled={refreshing || parsed.queries.length === 0}
          className="h-7 gap-1.5 text-xs"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh all
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShareOpen(true)}
          className="h-7 gap-1.5 text-xs"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>

        {dashboard.role === "viewer" ? (
          // Read-only is a workflow signal, not a lock — the document lives in
          // this browser. Offer the honest path to editing: an owned copy.
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={async () => {
              const copy = await duplicateDashboard(dashboard.id);
              if (copy) openDashboardTab(copy.id, copy.name);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Save editable copy
          </Button>
        ) : (
          <Button
            size="sm"
            variant={isEditing ? "default" : "outline"}
            onClick={() => setEditing(!isEditing)}
            className="h-7 gap-1.5 text-xs"
          >
            {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {isEditing ? "Done" : "Edit"}
          </Button>
        )}
      </div>

      <ShareDashboardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dashboard={dashboard}
        onShareLive={() => {
          setShareOpen(false);
          setLiveOpen(true);
        }}
      />
      <ShareLiveDialog open={liveOpen} onOpenChange={setLiveOpen} />

      <div className="min-h-0 flex-1">
        {isEditing && dashboard.role !== "viewer" ? (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={50} minSize={25}>
              <SourceEditor
                tabId={tabId}
                initial={source}
                onChange={handleSourceChange}
                collabText={
                  sessionStatus === "connected"
                    ? (() => {
                        const collaboration = getCollaboration();
                        if (!collaboration) return null;
                        // Register on first edit in a session, so a dashboard
                        // opened mid-session becomes co-editable too.
                        collaboration.document.ensureDashboard(
                          dashboard.id,
                          dashboard.name,
                          source
                        );
                        return collaboration.document.dashboardText(dashboard.id);
                      })()
                    : null
                }
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="h-full overflow-auto border-l">
                <MarkdownDashboard
                  blocks={parsed.blocks}
                  results={results}
                  inputs={dashboardId ? getDashboardInputs(dashboardId) : undefined}
                  inputValues={inputValues}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full overflow-auto">
            <MarkdownDashboard
              blocks={parsed.blocks}
              results={results}
              inputs={dashboardId ? getDashboardInputs(dashboardId) : undefined}
              inputValues={inputValues}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Monaco, in markdown mode.
 *
 * Uncontrolled on purpose: the editor owns the text while it is open, and
 * pushing debounced store updates back in as `setValue` would fight the caret
 * (the same rule the SQL editor learned the hard way).
 */
function SourceEditor({
  tabId,
  initial,
  onChange,
  collabText,
}: {
  tabId: string;
  initial: string;
  onChange: (value: string) => void;
  /** Shared Y.Text when a live session is running; edits then merge. */
  collabText?: Y.Text | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EditorInstance | null>(null);
  const { theme } = useTheme();
  const sqlConfig = useMonacoConfig(theme);
  const config = useMemo(
    // quickSuggestions ON: the whole point of the authoring experience is
    // that components, props, query names and input variables offer
    // themselves as you type (Ctrl+Space works everywhere regardless).
    // The full object, not `true`: markdown tokenizes component tags as
    // string-ish content, and boolean `true` leaves strings/comments off —
    // which silently kills suggestions exactly where this dialect needs them.
    () => ({
      ...sqlConfig,
      language: "markdown",
      quickSuggestions: { other: true, comments: true, strings: true },
    }),
    [sqlConfig]
  );

  const initialRef = useRef(initial);
  const onChangeRef = useRef(onChange);
  // Assigned in an effect, not during render — the lint rule is right that a
  // render-time ref write can tear under concurrent rendering.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    instanceRef.current = createCellEditor(
      containerRef.current,
      config,
      initialRef.current,
      async () => {},
      (value) => onChangeRef.current(value)
    );

    // In a live session the source merges character-by-character through the
    // same binding the SQL editor uses. Store persistence still flows through
    // onChange, because remote edits arrive as model changes too.
    let binding: CollaborativeBinding | null = null;
    const editor = instanceRef.current.editor;
    const model = editor.getModel();
    // Dashboard-specific autocomplete: component tags, props, query names,
    // ${inputs.…} variables. Enrolled per model so notebook markdown and any
    // other markdown surface stay plain.
    const disableCompletions = model ? enableDashboardCompletions(model) : null;
    if (collabText && model) {
      const presence = getCollaboration()?.presence;
      binding = bindCollaborativeEditor({
        text: collabText,
        model,
        editor,
        presence: presence ?? undefined,
        tabId: `dashboard:${tabId}`,
      });
    }

    return () => {
      disableCompletions?.();
      binding?.destroy();
      // Flush before dispose: the cell editor debounces content changes, and
      // unmounting inside that window (typing, then immediately clicking
      // Done) would silently drop the last ~300ms of edits.
      const editor = instanceRef.current?.editor;
      if (editor) onChangeRef.current(editor.getValue());
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, config, collabText]);

  return <div ref={containerRef} className="h-full w-full" />;
}

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useDuckStore } from "@/store";
import DuckBrainPanel from "./DuckBrainPanel";

/**
 * Duck Brain as a global slide-over.
 *
 * One mount for the whole app, driven by the store's `isPanelOpen`, so the
 * assistant opens from anywhere — Home card, SQL editor button, command
 * palette — instead of existing only inside SQL tabs. "Insert SQL" targets
 * the active SQL tab; the panel says so when there isn't one.
 */
export default function DuckBrainSheet() {
  const isPanelOpen = useDuckStore((s) => s.duckBrain.isPanelOpen);
  const toggleBrainPanel = useDuckStore((s) => s.toggleBrainPanel);
  const activeTabId = useDuckStore((s) => s.activeTabId);
  const activeTabType = useDuckStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.type);

  const sqlTabId = activeTabType === "sql" && activeTabId ? activeTabId : "";

  return (
    <Sheet open={isPanelOpen} onOpenChange={(open) => !open && toggleBrainPanel()}>
      <SheetContent
        side="right"
        // p-0 + hidden built-in close: the panel brings its own header with a
        // close button; two X's a centimeter apart is a bug, not affordance.
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl [&>button]:hidden"
      >
        <SheetTitle className="sr-only">Duck Brain</SheetTitle>
        <DuckBrainPanel tabId={sqlTabId} />
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useState, useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useDuckStore } from "@/store";
import { useTheme } from "@/components/theme/theme-provider";
import {
  Terminal,
  Home,
  Cable,
  Brain,
  Settings,
  Sun,
  Moon,
  Database,
  Table,
  Bookmark,
} from "lucide-react";
import type { EditorTabType } from "@/store";
import {
  getSavedQueries,
  type SavedQuery,
} from "@/services/persistence/repositories/savedQueryRepository";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const tabs = useDuckStore((s) => s.tabs);
  const activeTabId = useDuckStore((s) => s.activeTabId);
  const createTab = useDuckStore((s) => s.createTab);
  const setActiveTab = useDuckStore((s) => s.setActiveTab);
  const toggleBrainPanel = useDuckStore((s) => s.toggleBrainPanel);
  const databases = useDuckStore((s) => s.databases);
  const connectionList = useDuckStore((s) => s.connectionList);
  const currentConnection = useDuckStore((s) => s.currentConnection);
  const setCurrentConnection = useDuckStore((s) => s.setCurrentConnection);
  const currentProfileId = useDuckStore((s) => s.currentProfileId);
  const savedQueriesVersion = useDuckStore((s) => s.savedQueriesVersion);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  // Load saved queries when palette opens
  useEffect(() => {
    if (open && currentProfileId) {
      getSavedQueries(currentProfileId).then(setSavedQueries).catch(() => {});
    }
  }, [open, currentProfileId, savedQueriesVersion]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openOrFocusTab = (type: EditorTabType, title: string) => {
    const existing = tabs.find((t) => t.type === type);
    if (existing) {
      setActiveTab(existing.id);
    } else {
      createTab(type, "", title);
    }
    setOpen(false);
  };

  const openTabs = useMemo(
    () => tabs.filter((t) => t.id !== activeTabId),
    [tabs, activeTabId]
  );

  const tableEntries = useMemo(() => {
    const entries: { database: string; table: string }[] = [];
    for (const db of databases) {
      for (const table of db.tables) {
        entries.push({ database: db.name, table: table.name });
      }
    }
    return entries;
  }, [databases]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search commands, tabs, tables..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => {
              createTab("sql", "");
              setOpen(false);
            }}
          >
            <Terminal className="mr-2 h-4 w-4" />
            New SQL Tab
          </CommandItem>
          <CommandItem onSelect={() => openOrFocusTab("home", "Home")}>
            <Home className="mr-2 h-4 w-4" />
            Home
          </CommandItem>
          <CommandItem onSelect={() => openOrFocusTab("connections", "Connections")}>
            <Cable className="mr-2 h-4 w-4" />
            Connections
          </CommandItem>
          <CommandItem onSelect={() => openOrFocusTab("brain", "Duck Brain")}>
            <Brain className="mr-2 h-4 w-4" />
            Duck Brain
          </CommandItem>
          <CommandItem onSelect={() => openOrFocusTab("settings", "Settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
          <CommandItem
            onSelect={() => {
              toggleBrainPanel();
              setOpen(false);
            }}
          >
            <Brain className="mr-2 h-4 w-4" />
            Toggle AI Panel
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            {theme === "dark" ? "Light Theme" : "Dark Theme"}
          </CommandItem>
        </CommandGroup>

        {/* Open Tabs */}
        {openTabs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Open Tabs">
              {openTabs.map((tab) => (
                <CommandItem
                  key={tab.id}
                  onSelect={() => {
                    setActiveTab(tab.id);
                    setOpen(false);
                  }}
                >
                  <Terminal className="mr-2 h-4 w-4" />
                  {tab.title || tab.type}
                  <CommandShortcut>{tab.type}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Connections */}
        {connectionList.connections.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Connections">
              {connectionList.connections
                .filter((c) => c.id !== currentConnection?.id)
                .map((conn) => (
                  <CommandItem
                    key={conn.id}
                    onSelect={async () => {
                      await setCurrentConnection(conn.id);
                      setOpen(false);
                    }}
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Switch to {conn.name}
                    <CommandShortcut>{conn.scope}</CommandShortcut>
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}

        {/* Saved Queries */}
        {savedQueries.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Saved Queries">
              {savedQueries.map((query) => (
                <CommandItem
                  key={query.id}
                  onSelect={() => {
                    createTab("sql", query.sql_text, query.name);
                    setOpen(false);
                  }}
                >
                  <Bookmark className="mr-2 h-4 w-4" />
                  {query.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Tables */}
        {tableEntries.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tables">
              {tableEntries.map(({ database, table }) => (
                <CommandItem
                  key={`${database}.${table}`}
                  onSelect={() => {
                    const query = `SELECT * FROM "${database}"."${table}" LIMIT 100`;
                    createTab("sql", query, table);
                    setOpen(false);
                  }}
                >
                  <Table className="mr-2 h-4 w-4" />
                  {database}.{table}
                  <CommandShortcut>SELECT</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

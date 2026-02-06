/**
 * Sidebar Component
 * Minimalist icon-only sidebar with tooltips
 */

import { useState, useEffect } from "react";
import {
  Home,
  Database,
  Cable,
  Brain,
  Moon,
  Sun,
  HelpCircle,
  Github,
  BookOpen,
  Search,
  History,
  ExternalLink,
  Circle,
  Settings,
  Bookmark,
  ChevronRight,
} from "lucide-react";
import { useDuckStore, type EditorTabType } from "@/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTheme } from "@/components/theme/theme-provider";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import QueryHistory from "../workspace/QueryHistory";
import SavedQueriesPanel from "@/components/saved-queries/SavedQueriesPanel";
import PasswordDialog from "@/components/profile/PasswordDialog";
import ProfileAvatar from "@/components/profile/ProfileAvatar";

interface SidebarProps {
  isExplorerOpen: boolean;
  onToggleExplorer: () => void;
}

export default function Sidebar({ isExplorerOpen, onToggleExplorer }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const {
    tabs,
    activeTabId,
    createTab,
    setActiveTab,
    currentConnection,
    currentProfile,
    profiles,
    switchProfile,
  } = useDuckStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedQueriesOpen, setSavedQueriesOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<(typeof profiles)[0] | null>(null);

  // Get connection status color
  const getConnectionColor = (scope?: string) => {
    switch (scope) {
      case "WASM":
        return "text-green-500";
      case "External":
        return "text-blue-500";
      case "OPFS":
        return "text-purple-500";
      default:
        return "text-gray-500";
    }
  };

  // Helper to open or focus a singleton tab
  const openOrFocusTab = (type: EditorTabType, title: string) => {
    const existing = tabs.find((t) => t.type === type);
    if (existing) {
      setActiveTab(existing.id);
    } else {
      createTab(type, "", title);
    }
  };

  // Check if a tab type is active
  const isTabActive = (type: EditorTabType) => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    return activeTab?.type === type;
  };

  // Mutual exclusion for right panels
  const openHistory = () => {
    setSavedQueriesOpen(false);
    setHistoryOpen(!historyOpen);
  };

  const openSavedQueries = () => {
    setHistoryOpen(false);
    setSavedQueriesOpen(!savedQueriesOpen);
  };

  // Profile switching
  const handleSwitchProfile = (profile: (typeof profiles)[0]) => {
    if (profile.hasPassword) {
      setSwitchTarget(profile);
    } else {
      switchProfile(profile.id);
    }
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navItems = [
    { type: "home" as EditorTabType, label: "Home" },
    { type: "connections" as EditorTabType, label: "Connections" },
    { type: "brain" as EditorTabType, label: "Duck Brain" },
    { type: "settings" as EditorTabType, label: "Settings" },
  ];

  const externalLinks = [
    { to: "https://github.com/ibero-data/duck-ui", label: "GitHub", icon: Github },
    { to: "https://duckui.com", label: "Documentation", icon: BookOpen },
  ];

  const otherProfiles = profiles.filter((p) => p.id !== currentProfile?.id);

  return (
    <>
      <div className="flex flex-col h-full w-16 border-r bg-background shrink-0">
        {/* Profile Avatar */}
        <div className="flex items-center justify-center w-16 h-10 border-b">
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1.5 rounded-md hover:bg-muted transition-colors">
                      <ProfileAvatar
                        avatarEmoji={currentProfile?.avatarEmoji || "logo"}
                        size="md"
                      />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">{currentProfile?.name || "Duck-UI"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuLabel className="flex items-center gap-2">
                <ProfileAvatar avatarEmoji={currentProfile?.avatarEmoji || "logo"} size="md" />
                <div>
                  <div className="font-medium">{currentProfile?.name}</div>
                  <div className="text-xs text-muted-foreground font-normal">Active</div>
                </div>
              </DropdownMenuLabel>
              {otherProfiles.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    Switch Profile
                  </DropdownMenuLabel>
                  {otherProfiles.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => handleSwitchProfile(p)}>
                      <ProfileAvatar avatarEmoji={p.avatarEmoji} size="sm" className="mr-2" />
                      {p.name}
                      <ChevronRight className="ml-auto h-3 w-3" />
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openOrFocusTab("settings", "Settings")}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main Navigation */}
        <div className="flex-1 flex flex-col py-2 gap-1">
          {/* Home */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isTabActive("home") ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={() => openOrFocusTab("home", "Home")}
                >
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Home</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Explorer Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isExplorerOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={onToggleExplorer}
                >
                  <Database className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isExplorerOpen ? "Hide Explorer" : "Show Explorer"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Separator className="my-2 mx-2" />

          {/* Connections */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isTabActive("connections") ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={() => openOrFocusTab("connections", "Connections")}
                >
                  <Cable className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Connections</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Brain */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isTabActive("brain") ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={() => openOrFocusTab("brain", "Duck Brain")}
                >
                  <Brain className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Duck Brain</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Separator className="my-2 mx-2" />

          {/* Search */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (⌘K)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Saved Queries */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={savedQueriesOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={openSavedQueries}
                >
                  <Bookmark className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Saved Queries</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Query History */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={historyOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={openHistory}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Query History</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col py-2 gap-1 border-t">
          {/* Connection Status Pill */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto h-9 w-9 relative"
                  onClick={() => openOrFocusTab("connections", "Connections")}
                >
                  <Circle
                    className={`h-3 w-3 ${getConnectionColor(currentConnection?.scope)}`}
                    fill="currentColor"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <div className="font-medium">{currentConnection?.name || "No connection"}</div>
                  <div className="text-muted-foreground">
                    {currentConnection?.scope || "Click to manage"}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Settings */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isTabActive("settings") ? "secondary" : "ghost"}
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={() => openOrFocusTab("settings", "Settings")}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Theme Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto h-9 w-9"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Help Dropdown */}
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="mx-auto h-9 w-9">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">Help</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent side="right" align="end">
              <DropdownMenuItem
                onClick={() => window.open("https://github.com/ibero-data/duck-ui", "_blank")}
              >
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("https://duckui.com", "_blank")}>
                <BookOpen className="h-4 w-4 mr-2" />
                Documentation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Command Dialog */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navItems.map((item) => (
              <CommandItem
                key={item.type}
                onSelect={() => {
                  openOrFocusTab(item.type, item.label);
                  setSearchOpen(false);
                }}
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="External Links">
            {externalLinks.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() => {
                  window.open(item.to, "_blank");
                  setSearchOpen(false);
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
                <ExternalLink className="ml-auto h-3 w-3" />
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                setTheme(theme === "dark" ? "light" : "dark");
                toast.info(`Theme changed to ${theme === "dark" ? "light" : "dark"}`);
                setSearchOpen(false);
              }}
            >
              {theme === "dark" ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : (
                <Moon className="mr-2 h-4 w-4" />
              )}
              {theme === "dark" ? "Light Theme" : "Dark Theme"}
            </CommandItem>
            <CommandItem
              onSelect={() => {
                openOrFocusTab("connections", "Connections");
                setSearchOpen(false);
              }}
            >
              <Cable className="mr-2 h-4 w-4" />
              Manage Connections
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Query History Panel */}
      {historyOpen && (
        <div className="fixed right-0 top-0 h-full w-96 border-l bg-background z-40 shadow-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-sm font-medium">Query History</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setHistoryOpen(false)}
            >
              <span className="sr-only">Close</span>×
            </Button>
          </div>
          <div className="h-[calc(100%-41px)] overflow-auto">
            <QueryHistory isExpanded={true} mode="inline" />
          </div>
        </div>
      )}

      {/* Saved Queries Panel */}
      {savedQueriesOpen && (
        <div className="fixed right-0 top-0 h-full w-96 border-l bg-background z-40 shadow-lg">
          <SavedQueriesPanel onClose={() => setSavedQueriesOpen(false)} />
        </div>
      )}

      {/* Password Dialog for Profile Switching */}
      {switchTarget && (
        <PasswordDialog
          open={!!switchTarget}
          onOpenChange={(open) => {
            if (!open) setSwitchTarget(null);
          }}
          profile={switchTarget}
          onSubmit={async (password) => {
            await switchProfile(switchTarget.id, password);
            setSwitchTarget(null);
          }}
        />
      )}
    </>
  );
}

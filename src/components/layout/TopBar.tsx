import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "@/components/theme/theme-provider";
import {
  Sun,
  Moon,
  Search,
  Github,
  BookText,
  ExternalLink,
  Settings,
  Cable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import QueryHistory from "../workspace/QueryHistory";
import ConnectionSwitcher from "./ConnectionSwitcher";

const TopBar = () => {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navItems = [{ to: "/", label: "Home" }];

  const externalLinks = [
    {
      to: "https://github.com/ibero-data/duck-ui?utm_source=duck-ui&utm_medium=topbar",
      label: "GitHub",
      icon: Github,
    },
    {
      to: "https://duckui.com/docs?utm_source=duck-ui&utm_medium=topbar",
      label: "Documentation",
      icon: BookText,
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          {/* Connection Switcher */}
          <div className="hidden md:block">
            <ConnectionSwitcher />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Query History */}
          <QueryHistory isExpanded={false} />

          {/* Theme Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">Toggle theme</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/connections")}>
                <Cable className="mr-2 h-4 w-4" />
                Manage Connections
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Help Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <ExternalLink className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {externalLinks.map((link) => (
                <DropdownMenuItem key={link.to} asChild>
                  <a
                    href={link.to}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center"
                  >
                    <link.icon className="mr-2 h-4 w-4" />
                    {link.label}
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(true)}
                >
                  <Search className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">Search (Cmd/Ctrl + K)</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Command Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() => {
                  navigate(item.to);
                  setOpen(false);
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
                  setOpen(false);
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
                toggleTheme();
                toast.info(
                  `Theme changed to ${theme === "dark" ? "light" : "dark"}`
                );
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
            <CommandItem
              onSelect={() => {
                navigate("/connections");
                setOpen(false);
              }}
            >
              <Cable className="mr-2 h-4 w-4" />
              Manage Connections
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default TopBar;

import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTheme } from "@/components/theme/theme-provider";
import {
  SquareTerminal,
  Github,
  Sun,
  Moon,
  Search,
  ChevronRight,
  ChevronLeft,
  LineChart,
  BookText,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import Logo from "/logo.png";
import LogoLight from "/logo-light.png";
import QueryHistory from "../workspace/QueryHistory";
import ConnectionSwitcher from "./ConnectionSwitcher";

const Sidebar = () => {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      // Toogle sidebar when pressing Cmd/Ctrl + B
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsExpanded((isExpanded) => !isExpanded);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navItems = [
    { to: "/", label: "Home", icon: SquareTerminal, isNewWindow: false },
    { to: "/metrics", label: "Metrics", icon: LineChart, isNewWindow: false },
  ];

  const bottomNavLinks = [
    {
      to: "https://github.com/caioricciuti/duck-ui?utm_source=duck-ui&utm_medium=sidebar",
      label: "GitHub",
      icon: Github,
      isNewWindow: true,
    },
    {
      to: "https://duckui.com/docs?utm_source=duck-ui&utm_medium=sidebar",
      label: "Documentation",
      icon: BookText,
      isNewWindow: true,
    },
  ];

  return (
    <div
      ref={sidebarRef}
      className={`flex flex-col h-screen bg-background border-r transition-all duration-300 bg-muted ${
        isExpanded ? "w-64" : "w-16"
      }`}
    >
      <div className="p-2 ml-2 mt-2 flex items-center justify-between w-full">
        <Link to="/" className="flex items-center space-x-2">
          <img
            src={theme === "dark" ? Logo : LogoLight}
            alt="Logo"
            className="h-6 w-8"
          />
          {isExpanded && (
            <span className="font-bold text-lg truncate">duck-ui</span>
          )}
        </Link>
        {isExpanded && (
          <Button
            variant="link"
            size="icon"
            onClick={() => setIsExpanded(false)}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
          </Button>
        )}
      </div>

      <Separator className="w-full" />
      <div className="p-3">
        <ConnectionSwitcher expanded={isExpanded} />
      </div>

      <ScrollArea className="flex-grow">
        <nav className="space-y-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              target={item.isNewWindow ? "_blank" : "_self"}
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === item.to
                  ? "bg-[#ffe814] text-black"
                  : "hover:bg-[#ffe814]/20"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isExpanded ? "mr-2" : ""}`} />
              {isExpanded && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
      </ScrollArea>

      <div className="w-full">
        <ScrollArea className="flex-grow">
          <nav className="space-y-1 p-2">
            <QueryHistory isExpanded={isExpanded} />
            {bottomNavLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                target={item.isNewWindow ? "_blank" : "_self"}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.to
                    ? "bg-secondary text-secondary-foreground"
                    : "hover:bg-secondary/80"
                }`}
              >
                <item.icon className={`h-5 w-5 ${isExpanded ? "mr-2" : ""}`} />
                {isExpanded && <span>{item.label}</span>}
              </Link>
            ))}
          </nav>
        </ScrollArea>
        <Separator className="w-full mb-2" />
        <div
          className={`${isExpanded ? "flex justify-around" : "block p-2.5"}`}
        >
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

          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {!isExpanded && (
        <Button
          variant="ghost"
          size="icon"
          className="m-2"
          onClick={() => setIsExpanded(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() => {
                  if (item.isNewWindow) {
                    window.open(item.to, "_blank");
                    setOpen(false);
                    return;
                  }
                  navigate(item.to);
                  setOpen(false);
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup>
            {bottomNavLinks.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() => {
                  if (item.isNewWindow) {
                    window.open(item.to, "_blank");
                    setOpen(false);
                    return;
                  }
                  navigate(item.to);
                  setOpen(false);
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
                {item.isNewWindow && (
                  <ExternalLink
                    className="p-1 
                  "
                  />
                )}
              </CommandItem>
            ))}
            <CommandSeparator />
          </CommandGroup>
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
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
};

export default Sidebar;

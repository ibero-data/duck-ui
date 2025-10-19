import { useState } from "react";
import { Menu, Github, BookText, Cable, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/theme/theme-provider";
import { useNavigate } from "react-router";
import ConnectionSwitcher from "./ConnectionSwitcher";

export const MobileNavDrawer = () => {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleExternalLink = (url: string) => {
    window.open(url, "_blank");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle className="text-left flex items-center gap-2">
            <img src="/logo.png" alt="Duck-UI" className="h-8 w-8" />
            Duck-UI
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Connection Switcher */}
          <div>
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Connection
            </p>
            <ConnectionSwitcher />
          </div>

          <Separator />

          {/* Navigation */}
          <div className="space-y-2">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Navigate
            </p>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => handleNavigation("/")}
            >
              Home
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => handleNavigation("/connections")}
            >
              <Cable className="mr-2 h-4 w-4" />
              Manage Connections
            </Button>
          </div>

          <Separator />

          {/* External Links */}
          <div className="space-y-2">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Resources
            </p>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() =>
                handleExternalLink(
                  "https://github.com/ibero-data/duck-ui?utm_source=duck-ui&utm_medium=mobile-nav"
                )
              }
            >
              <Github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() =>
                handleExternalLink(
                  "https://duckui.com?utm_source=duck-ui&utm_medium=mobile-nav"
                )
              }
            >
              <BookText className="mr-2 h-4 w-4" />
              Documentation
            </Button>
          </div>

          <Separator />

          {/* Theme Toggle */}
          <div className="space-y-2">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Appearance
            </p>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <>
                  <Sun className="mr-2 h-4 w-4" />
                  Switch to Light Mode
                </>
              ) : (
                <>
                  <Moon className="mr-2 h-4 w-4" />
                  Switch to Dark Mode
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNavDrawer;

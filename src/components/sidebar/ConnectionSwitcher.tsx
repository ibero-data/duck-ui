import * as React from "react";
import { ChevronsUpDown, ServerCog, Loader2, Cable } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router";
import { useDuckStore } from "@/store"; // Adjust path

interface ConnectionSwitcherProps {
  expanded: boolean;
  className?: string;
}

// Reusable button component with proper types
interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

const SidebarMenuButton: React.FC<SidebarMenuButtonProps> = ({
  children,
  className,
  isLoading,
  ...props
}) => {
  return (
    <Button
      className={cn(
        "flex items-center justify-between w-full text-left",
        isLoading && "opacity-70 cursor-not-allowed",
        className,
        "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/30 hover:text-sidebar-accent-foreground gap-3 p-3"
      )}
      disabled={isLoading}
      {...props}
    >
      {children}
    </Button>
  );
};

export default function ConnectionSwitcher({
  expanded,
  className,
}: ConnectionSwitcherProps) {
  const navigate = useNavigate();
  const {
    connectionList,
    currentConnection,
    setCurrentConnection,
    isLoading,
    fetchDatabasesAndTablesInfo,
  } = useDuckStore();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleConnectionChange = async (connectionId: string) => {
    setCurrentConnection(connectionId);
    await fetchDatabasesAndTablesInfo();

    setIsOpen(false);
  };

  // Use a fallback in case currentConnection is null/undefined during initialization
  const activeConnection =
    currentConnection || connectionList.connections[0] || null;

  return (
    <div className={cn("w-full ", className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          {expanded ? (
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              isLoading={isLoading}
            >
              <div className="flex aspect-square size-6 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ServerCog className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight ml-3">
                <span className="truncate font-semibold">
                  {activeConnection?.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeConnection?.scope}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          ) : (
            <Button
              size="icon"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground bg-sidebar-primary text-sidebar-primary-foreground hover:bg-muted-foreground/10"
              disabled={isLoading}
            >
              <div className="flex aspect-square size-6 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ServerCog className="size-4" />
                )}
              </div>
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
          align="start"
          sideOffset={4}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground mb-2">
            Connections{" "}
            <span
              className="
            text-xs text-purple-500 px-1 py-0.5 rounded-md bg-purple-100/20 ml-1 text-xs font-medium 
            border border-purple-500 rounded-md
            
            "
            >
              Alpha
            </span>
          </DropdownMenuLabel>
          {connectionList.connections.map((connection) => (
            <DropdownMenuItem
              key={connection.id}
              onClick={() => handleConnectionChange(connection.id)}
              className={cn(
                "gap-2 p-2 cursor-pointer gap-2 mb-1",
                activeConnection?.id === connection.id &&
                  "bg-muted-foreground/10"
              )}
            >
              <div className="flex items-center">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{connection.name}</span>
                  <span className="text-xs font-thin text-muted-foreground">
                    {connection.scope}
                  </span>
                </div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 p-2 cursor-pointer"
            onClick={() => {
              navigate("/connections");
              setIsOpen(false);
            }}
          >
            <div className="flex size-6 items-center justify-center">
              <Cable className="" />
            </div>
            <div className="font-semibold text-sm">Manage Connections</div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

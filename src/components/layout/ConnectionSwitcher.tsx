import * as React from "react";
import { ChevronDown, Circle, Loader2, Cable } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router";
import { useDuckStore } from "@/store";

interface ConnectionSwitcherProps {
  className?: string;
}

export default function ConnectionSwitcher({
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

  const activeConnection = currentConnection || connectionList.connections[0];

  const handleConnectionChange = async (connectionId: string) => {
    try {
      await setCurrentConnection(connectionId);
      await fetchDatabasesAndTablesInfo();
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to switch connection:", error);
    }
  };

  const getStatusColor = (scope: string) => {
    switch (scope) {
      case "WASM":
        return "bg-green-500";
      case "External":
        return "bg-blue-500";
      case "OPFS":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className={cn(className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "flex items-center gap-2 h-9 px-3",
              "hover:bg-accent transition-colors",
              isLoading && "opacity-70 cursor-not-allowed"
            )}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Circle className={cn("h-2 w-2", getStatusColor(activeConnection?.scope || "WASM"))} fill="currentColor" />
            )}
            <span className="font-medium text-sm truncate max-w-[120px]">
              {activeConnection?.name}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {activeConnection?.scope}
            </Badge>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-[240px]"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Switch Connection
          </DropdownMenuLabel>

          {connectionList.connections.map((connection) => (
            <DropdownMenuItem
              key={connection.id}
              onClick={() => handleConnectionChange(connection.id)}
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                activeConnection?.id === connection.id && "bg-accent"
              )}
            >
              <Circle
                className={cn("h-2 w-2", getStatusColor(connection.scope))}
                fill="currentColor"
              />
              <span className="flex-1 font-medium">{connection.name}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {connection.scope}
              </Badge>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              navigate("/connections");
              setIsOpen(false);
            }}
          >
            <Cable className="h-4 w-4 mr-2" />
            <span>Manage Connections</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

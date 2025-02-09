import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Database, ExternalLink } from "lucide-react";
import { ConnectionProvider } from "@/store"; // Import ConnectionProvider

interface ConnectionPillProps {
  connection: ConnectionProvider | null;
}

const ConnectionPill: React.FC<ConnectionPillProps> = ({ connection }) => {
  const isExternal = connection?.scope === "External";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={`
                px-3 py-1 gap-2 cursor-pointer hover:bg-accent transition-colors
                ${isExternal ? "border-orange-500/50" : "border-green-500/50"}
              `}
          >
            {isExternal ? (
              <ExternalLink size={14} className="text-orange-500" />
            ) : (
              <Database size={14} className="text-green-500" />
            )}
            <span
              className={`
                  text-sm font-mono truncate text-xs
                  ${isExternal ? "text-orange-500" : "text-green-500"}
                `}
            >
              {connection?.name || "No Connection"}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className=" p-0" sideOffset={5}>
          <div className="bg-card px-3 py-2 rounded-t-sm border-b">
            <h4 className="font-medium flex items-center gap-2 justify-between">
              Connection Details
              {isExternal ? (
                <ExternalLink size={14} className="text-orange-500" />
              ) : (
                <Database size={14} className="text-green-500" />
              )}
            </h4>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Name</span>
              <span className="text-sm font-mono">
                {connection?.name || "-"}
              </span>
            </div>
            <hr />
            <div className="flex items-center justify-between">
              <span className="text-sm">Type</span>
              <span className="text-sm font-mono">
                {connection?.scope || "-"}
              </span>
            </div>
            <hr />
            <div className="flex items-center justify-between">
              <span className="text-sm">Host</span>
              <span className="text-sm font-mono ml-4">
                {connection?.host ||
                  (connection?.scope === "WASM" ? "Local" : "-")}
              </span>
            </div>
            <hr />
            <div className="flex items-center justify-between">
              <span className="text-sm">Database</span>
              <span className="text-sm font-mono">
                {connection?.database ||
                  (connection?.scope === "WASM" ? "memory" : "-")}
              </span>
            </div>
            <hr />
            {connection?.port && (
              <div className="flex items-center justify-between">
                <span className="text-sm">Port</span>
                <span className="text-sm font-mono">{connection.port}</span>
              </div>
            )}
            <hr />
            {connection?.user && (
              <div className="flex items-center justify-between">
                <span className="text-sm">User</span>
                <span className="text-sm font-mono">{connection.user}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ConnectionPill;

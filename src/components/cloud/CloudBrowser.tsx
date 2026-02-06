/**
 * Cloud Browser Component
 * Displays cloud storage connections and allows browsing/importing files
 */

import { useState, useEffect } from "react";
import { useDuckStore } from "@/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Cloud,
  CloudOff,
  Plus,
  MoreVertical,
  Trash2,
  Link,
  Unlink,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { CloudConnectionModal } from "./CloudConnectionModal";
import type { CloudConnection } from "@/store";

// Provider icons/colors
const PROVIDER_CONFIG = {
  s3: { label: "S3", color: "text-orange-500", bgColor: "bg-orange-500/10" },
  gcs: { label: "GCS", color: "text-blue-500", bgColor: "bg-blue-500/10" },
  azure: { label: "Azure", color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
};

interface CloudConnectionItemProps {
  connection: CloudConnection;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}

function CloudConnectionItem({
  connection,
  onConnect,
  onDisconnect,
  onRemove,
}: CloudConnectionItemProps) {
  const [isLoading, setIsLoading] = useState(false);
  const config = PROVIDER_CONFIG[connection.type];

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await onConnect();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await onDisconnect();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className={`p-1 rounded ${config.bgColor}`}>
          <Cloud className={`h-3.5 w-3.5 ${config.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm truncate">{connection.name}</span>
            <span className={`text-[10px] px-1 py-0.5 rounded ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
            {connection.isConnected && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          </div>
          {connection.lastError && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span className="text-xs truncate">Error</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{connection.lastError}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreVertical className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {connection.isConnected ? (
            <DropdownMenuItem onClick={handleDisconnect}>
              <Unlink className="h-4 w-4 mr-2" />
              Disconnect
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleConnect}>
              <Link className="h-4 w-4 mr-2" />
              Connect
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRemove} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function CloudBrowser() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    cloudConnections,
    cloudSupportStatus,
    isCloudStorageInitialized,
    initCloudStorage,
    connectCloudStorage,
    disconnectCloudStorage,
    removeCloudConnection,
  } = useDuckStore();

  // Initialize cloud storage on mount
  useEffect(() => {
    if (!isCloudStorageInitialized) {
      initCloudStorage();
    }
  }, [isCloudStorageInitialized, initCloudStorage]);

  const handleConnect = async (id: string) => {
    await connectCloudStorage(id);
  };

  const handleDisconnect = async (id: string) => {
    await disconnectCloudStorage(id);
  };

  const handleRemove = async (id: string) => {
    await removeCloudConnection(id);
  };

  // Show warning if cloud storage is not supported
  const showWarning = cloudSupportStatus && !cloudSupportStatus.httpfsAvailable;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Cloud
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Cloud Connection</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Warning Banner */}
      {showWarning && (
        <div className="mx-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-start gap-2">
            <CloudOff className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Cloud storage has limited support in browsers. Consider using HTTPS URLs instead.
            </p>
          </div>
        </div>
      )}

      {/* Connections List */}
      {cloudConnections.length === 0 ? (
        <div className="px-2 py-4 text-center">
          <Cloud className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No cloud connections</p>
          <Button
            variant="link"
            size="sm"
            className="text-xs h-auto p-0 mt-1"
            onClick={() => setIsModalOpen(true)}
          >
            Add your first connection
          </Button>
        </div>
      ) : (
        <div className="space-y-0.5">
          {cloudConnections.map((conn) => (
            <CloudConnectionItem
              key={conn.id}
              connection={conn}
              onConnect={() => handleConnect(conn.id)}
              onDisconnect={() => handleDisconnect(conn.id)}
              onRemove={() => handleRemove(conn.id)}
            />
          ))}
        </div>
      )}

      {/* Add Connection Modal */}
      <CloudConnectionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

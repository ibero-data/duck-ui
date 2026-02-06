import React, { useEffect, useState, useCallback } from "react";
import {
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  File,
  RefreshCw,
  X,
  AlertCircle,
  FileSpreadsheet,
  FileJson,
  Database,
  Import,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDuckStore, type MountedFolderInfo } from "@/store";
import {
  fileSystemService,
  type FSEntry,
  type FileEntry,
  type FolderEntry,
  SUPPORTED_EXTENSIONS,
} from "@/lib/fileSystem";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import ImportOptionsPopover, { type ImportOptions } from "@/components/common/ImportOptionsPopover";

interface FolderBrowserProps {
  onFileSelect?: (folderId: string, file: FileEntry) => void;
  onFileImport?: (folderId: string, file: FileEntry, options: ImportOptions) => void;
  className?: string;
}

// File type icon mapping
const getFileIcon = (extension: string) => {
  switch (extension.toLowerCase()) {
    case ".csv":
    case ".tsv":
    case ".xlsx":
    case ".xls":
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    case ".json":
    case ".jsonl":
    case ".ndjson":
      return <FileJson className="h-4 w-4 text-yellow-500" />;
    case ".parquet":
    case ".arrow":
    case ".ipc":
      return <Database className="h-4 w-4 text-blue-500" />;
    case ".duckdb":
    case ".db":
      return <Database className="h-4 w-4 text-orange-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
};

// Format file size
const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// File node component
interface FileNodeProps {
  entry: FSEntry;
  folderId: string;
  level: number;
  onFileSelect?: (folderId: string, file: FileEntry) => void;
  onFileImport?: (folderId: string, file: FileEntry, options: ImportOptions) => void;
}

const FileNode: React.FC<FileNodeProps> = ({
  entry,
  folderId,
  level,
  onFileSelect,
  onFileImport,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FSEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadChildren = useCallback(async () => {
    if (entry.type !== "folder") return;

    setIsLoading(true);
    try {
      const folderEntry = entry as FolderEntry;
      const entries: FSEntry[] = [];

      for await (const child of folderEntry.handle.values()) {
        if (child.kind === "file") {
          const fileHandle = child as FileSystemFileHandle;
          const ext =
            child.name.lastIndexOf(".") > 0
              ? child.name.slice(child.name.lastIndexOf(".")).toLowerCase()
              : "";

          if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

          try {
            const file = await fileHandle.getFile();
            entries.push({
              name: child.name,
              path: `${entry.path}/${child.name}`,
              type: "file",
              size: file.size,
              lastModified: new Date(file.lastModified),
              extension: ext,
              handle: fileHandle,
            });
          } catch {
            // Skip files we can't read
          }
        } else if (child.kind === "directory") {
          entries.push({
            name: child.name,
            path: `${entry.path}/${child.name}`,
            type: "folder",
            handle: child as FileSystemDirectoryHandle,
          });
        }
      }

      // Sort: folders first, then files
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setChildren(entries);
    } catch (error) {
      console.error("Failed to load folder contents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [entry]);

  const handleToggle = async () => {
    if (entry.type === "folder") {
      if (!isExpanded && children.length === 0) {
        await loadChildren();
      }
      setIsExpanded(!isExpanded);
    }
  };

  const handleFileClick = () => {
    if (entry.type === "file" && onFileSelect) {
      onFileSelect(folderId, entry as FileEntry);
    }
  };

  const handleImport = (options: ImportOptions) => {
    if (entry.type === "file" && onFileImport) {
      onFileImport(folderId, entry as FileEntry, options);
    }
  };

  const isFile = entry.type === "file";
  const fileEntry = entry as FileEntry;

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group w-full flex items-center gap-1.5 py-1 px-2 text-left text-sm rounded-md",
              "hover:bg-accent/50 transition-colors",
              "focus-within:bg-accent cursor-pointer"
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={isFile ? handleFileClick : handleToggle}
          >
            {entry.type === "folder" ? (
              <>
                {isLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 text-amber-500" />
              </>
            ) : (
              <>
                <span className="w-3.5" />
                {getFileIcon(fileEntry.extension)}
              </>
            )}
            <span className="truncate flex-1">{entry.name}</span>
            {isFile && (
              <>
                <ImportOptionsPopover fileName={entry.name} onImport={handleImport}>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity",
                      "hover:bg-primary/20 text-primary"
                    )}
                  >
                    <Import className="h-3.5 w-3.5" />
                  </button>
                </ImportOptionsPopover>
                <span className="text-[10px] text-muted-foreground min-w-[50px] text-right">
                  {formatSize(fileEntry.size)}
                </span>
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {isFile && (
            <ContextMenuItem
              onClick={() =>
                handleImport({
                  tableName: entry.name
                    .replace(/\.[^.]+$/, "")
                    .replace(/[^a-zA-Z0-9_]/g, "_")
                    .replace(/^[0-9]/, "_$&"),
                  importMode: "table",
                })
              }
            >
              Quick Import as Table
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {entry.type === "folder" && isExpanded && children.length > 0 && (
        <ul>
          {children.map((child) => (
            <FileNode
              key={child.path}
              entry={child}
              folderId={folderId}
              level={level + 1}
              onFileSelect={onFileSelect}
              onFileImport={onFileImport}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

// Mounted folder component
interface MountedFolderNodeProps {
  folder: MountedFolderInfo;
  onFileSelect?: (folderId: string, file: FileEntry) => void;
  onFileImport?: (folderId: string, file: FileEntry, options: ImportOptions) => void;
  onUnmount: (id: string) => void;
  onRequestPermission: (id: string) => void;
}

const MountedFolderNode: React.FC<MountedFolderNodeProps> = ({
  folder,
  onFileSelect,
  onFileImport,
  onUnmount,
  onRequestPermission,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [files, setFiles] = useState<FSEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await fileSystemService.listFiles(folder.id, {
        recursive: false,
        filterSupported: true,
      });
      setFiles(entries);
    } catch (error) {
      console.error("Failed to load files:", error);
      if (error instanceof Error && error.message === "Permission denied") {
        toast.error("Permission required. Click to grant access.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [folder.id]);

  const handleToggle = async () => {
    if (!folder.hasPermission) {
      onRequestPermission(folder.id);
      return;
    }

    if (!isExpanded && files.length === 0) {
      await loadFiles();
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={handleToggle}
            className={cn(
              "w-full flex items-center gap-1.5 py-1.5 px-2 text-left text-sm rounded-md",
              "hover:bg-accent/50 transition-colors",
              "focus:outline-none focus:bg-accent"
            )}
          >
            {isLoading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <FolderOpen className="h-4 w-4 text-amber-500" />
            <span className="truncate flex-1 font-medium">{folder.name}</span>
            {!folder.hasPermission && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>Click to grant permission</TooltipContent>
              </Tooltip>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={loadFiles}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onUnmount(folder.id)} className="text-destructive">
            <X className="h-4 w-4 mr-2" />
            Unmount
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isExpanded && files.length > 0 && (
        <ul className="ml-2">
          {files.map((entry) => (
            <FileNode
              key={entry.path}
              entry={entry}
              folderId={folder.id}
              level={1}
              onFileSelect={onFileSelect}
              onFileImport={onFileImport}
            />
          ))}
        </ul>
      )}

      {isExpanded && files.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground ml-8 py-1">No supported files found</p>
      )}
    </li>
  );
};

const FolderBrowser: React.FC<FolderBrowserProps> = ({ onFileSelect, onFileImport, className }) => {
  const {
    mountedFolders,
    isFileSystemSupported,
    initFileSystem,
    mountFolder,
    unmountFolder,
    refreshFolderPermissions,
  } = useDuckStore();

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize file system on mount
  useEffect(() => {
    const init = async () => {
      await initFileSystem();
      setIsInitialized(true);
    };
    init();
  }, [initFileSystem]);

  // Refresh permissions on visibility change (tab focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isInitialized) {
        refreshFolderPermissions();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isInitialized, refreshFolderPermissions]);

  const handleRequestPermission = async (folderId: string) => {
    try {
      const granted = await fileSystemService.requestPermission(folderId);
      if (granted) {
        await refreshFolderPermissions();
        toast.success("Permission granted");
      } else {
        toast.error("Permission denied");
      }
    } catch {
      toast.error("Failed to request permission");
    }
  };

  const handleFileImport = async (folderId: string, file: FileEntry, options: ImportOptions) => {
    if (onFileImport) {
      onFileImport(folderId, file, options);
    }
  };

  if (!isFileSystemSupported) {
    return (
      <div className={cn("p-3 text-center", className)}>
        <p className="text-xs text-muted-foreground">
          File System Access not supported.
          <br />
          Use Chrome or Edge 86+.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("space-y-2", className)}>
        {/* Header with Add Folder button */}
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Files
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={mountFolder}>
                <FolderPlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add folder</TooltipContent>
          </Tooltip>
        </div>

        {/* Mounted folders list */}
        {mountedFolders.length > 0 ? (
          <ul className="space-y-0.5">
            {mountedFolders.map((folder) => (
              <MountedFolderNode
                key={folder.id}
                folder={folder}
                onFileSelect={onFileSelect}
                onFileImport={handleFileImport}
                onUnmount={unmountFolder}
                onRequestPermission={handleRequestPermission}
              />
            ))}
          </ul>
        ) : (
          <div className="px-2 py-4 text-center">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground mb-2">No folders mounted</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={mountFolder}>
              <FolderPlus className="h-3.5 w-3.5" />
              Add Folder
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default FolderBrowser;

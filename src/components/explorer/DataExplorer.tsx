import React, { useState, useCallback } from "react";
import { useDuckStore } from "@/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, EllipsisVertical, FileUp, Plus, RefreshCw, Server } from "lucide-react";
import FileImporter from "./FileImporter";
import TreeNode, { TreeNodeData } from "./TreeNode";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FolderBrowser from "@/components/folders/FolderBrowser";
import CloudBrowser from "@/components/cloud/CloudBrowser";
import { type FileEntry, fileSystemService } from "@/lib/fileSystem";
import { type ImportOptions } from "@/components/common/ImportOptionsPopover";
import { toast } from "sonner";

export default function DataExplorer() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const {
    databases,
    isLoading,
    currentConnection,
    importFile,
    fetchDatabasesAndTablesInfo,
    isFileSystemSupported,
    schemaFetchError,
  } = useDuckStore();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Handle file import from mounted folder
  const handleFolderFileImport = useCallback(
    async (folderId: string, file: FileEntry, options: ImportOptions) => {
      const { tableName, importMode } = options;
      const modeLabel = importMode === "view" ? "Linking" : "Importing";
      const resultLabel = importMode === "view" ? "view" : "table";

      try {
        toast.loading(`${modeLabel} ${file.name}...`, { id: "folder-import" });

        // Read file from folder
        const fileData = await fileSystemService.readFile(folderId, file.path);
        const buffer = await fileData.arrayBuffer();

        // Determine file type from extension
        const ext = file.extension.replace(".", "").toLowerCase();
        let fileType = ext;
        if (ext === "jsonl" || ext === "ndjson") fileType = "json";

        await importFile(file.name, buffer, tableName, fileType, undefined, { importMode });
        await fetchDatabasesAndTablesInfo();

        toast.success(`Created ${resultLabel} "${tableName}" from "${file.name}"`, {
          id: "folder-import",
        });
      } catch (error) {
        console.error("Failed to import file:", error);
        toast.error(
          `Failed to import: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { id: "folder-import" }
        );
      }
    },
    [importFile, fetchDatabasesAndTablesInfo]
  );
  const buildTreeData = () => {
    const treeData: TreeNodeData[] = databases.map((db) => ({
      name: db.name,
      type: "database",
      children: db.tables.map((table) => ({
        name: table.name,
        type: "table",
      })),
    }));
    return treeData;
  };
  const treeData = buildTreeData();
  const isExternal = currentConnection?.scope === "External";

  return (
    <Card className="h-full overflow-hidden border-none">
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading databases...</p>
        </div>
      )}

      <CardHeader className="p-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isExternal ? (
              <Server className="h-4 w-4 text-primary" />
            ) : (
              <Database className="h-4 w-4 text-primary" />
            )}
            <CardTitle className="text-lg font-semibold">Explorer</CardTitle>
          </div>

          <div className="flex items-center gap-1">
            {/* Refresh button for external connections */}
            {isExternal && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => fetchDatabasesAndTablesInfo()}
                title="Refresh Schema"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            {/* Import menu - only show for non-external connections */}
            {!isExternal && (
              <DropdownMenu>
                <DropdownMenuTrigger className="cursor-pointer p-2 border hover:bg-secondary rounded-md focus:outline-none">
                  <EllipsisVertical className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent>
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setIsSheetOpen(true)}>
                        <FileUp className="h-4 w-4" />
                        Import Data
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenu>
            )}
          </div>

          <FileImporter
            isSheetOpen={isSheetOpen}
            setIsSheetOpen={setIsSheetOpen}
            context={"notEmpty"}
          />
        </div>
      </CardHeader>

      <CardContent className="p-2 h-[calc(100%-60px)] overflow-y-auto">
        <div className="space-y-4">
          {/* Databases Section */}
          {databases.length > 0 ? (
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={handleSearch}
                className="m-auto w-[calc(100%-2rem)] focus:ring-0"
              />
              <div className="flex items-center justify-between px-2 mt-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Databases
                </span>
              </div>
              <ul className="ml-2">
                {treeData.map((node, index) => (
                  <TreeNode
                    key={index}
                    node={node}
                    level={0}
                    searchTerm={searchTerm}
                    refreshData={() => {}}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="flex flex-col items-center gap-2">
                {isExternal ? (
                  <>
                    <Server className="h-8 w-8 text-muted-foreground" />
                    {schemaFetchError ? (
                      <>
                        <p className="text-destructive text-sm">
                          Connection error
                        </p>
                        <p className="text-xs text-muted-foreground max-w-[200px]">
                          {schemaFetchError}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground text-sm">
                          No schema found from the remote server.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Try refreshing or run queries directly in the editor.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Database className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      No databases found. Start by importing some data!
                    </p>
                  </>
                )}
              </div>
              {isExternal ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => fetchDatabasesAndTablesInfo()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Schema
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => setIsSheetOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Import Data
                </Button>
              )}
            </div>
          )}

          {/* Folder Browser Section - only show if supported and not external */}
          {isFileSystemSupported && !isExternal && (
            <div className="border-t pt-3">
              <FolderBrowser onFileImport={handleFolderFileImport} />
            </div>
          )}

          {/* Cloud Storage Section */}
          <div className="border-t pt-3">
            <CloudBrowser />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

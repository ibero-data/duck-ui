// TreeNode.tsx
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table,
  FileSpreadsheet,
  Trash,
  TerminalIcon,
  MoreVertical,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useDuckStore, type ColumnStats } from "@/store";
import { ColumnNode } from "./ColumnNode";

export interface TreeNodeData {
  name: string;
  type: "database" | "table" | "view";
  children?: TreeNodeData[];
  query?: string;
}

interface TreeNodeProps {
  node: TreeNodeData;
  level: number;
  searchTerm: string;
  parentDatabaseName?: string;
  refreshData: () => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  searchTerm,
  parentDatabaseName,
  refreshData,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [columnStats, setColumnStats] = useState<ColumnStats[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const toggleOpen = useCallback(() => setIsOpen((open) => !open), []);

  const { createTab, executeQuery, deleteTable, fetchDatabasesAndTablesInfo, fetchTableColumnStats } =
    useDuckStore();

  // Fetch column stats when table is expanded
  useEffect(() => {
    const loadColumnStats = async () => {
      if (isOpen && node.type === "table" && parentDatabaseName && columnStats.length === 0) {
        setIsLoadingStats(true);
        try {
          const stats = await fetchTableColumnStats(parentDatabaseName, node.name);
          setColumnStats(stats);
        } catch (error) {
          console.error("Failed to fetch column stats:", error);
        } finally {
          setIsLoadingStats(false);
        }
      }
    };

    loadColumnStats();
  }, [isOpen, node.type, node.name, parentDatabaseName, columnStats.length, fetchTableColumnStats]);

  const getIcon = useMemo(() => {
    switch (node.type) {
      case "database":
        return <Database className="w-4 h-4 mr-2" />;
      case "table":
      case "view":
        return <Table className="w-4 h-4 mr-2" />;
      default:
        return null;
    }
  }, [node.type]);

  const handleQueryData = useCallback(
    (databaseName: string, tableName: string) => async () => {
      const query = `SELECT * FROM "${databaseName}"."${tableName}" LIMIT 100`;

      createTab("sql", query, tableName);

      const tabId = useDuckStore.getState().activeTabId;
      if (tabId) {
        await executeQuery(query, tabId);
      }
      toast.success(`Querying table "${tableName}"`);
    },
    [createTab, executeQuery, toast]
  );

  const handleDeleteTable = useCallback(
    (databaseName: string, tableName: string) => async () => {
      try {
        await deleteTable(tableName, databaseName);
        toast.success(`Table "${tableName}" deleted successfully.`);
        await fetchDatabasesAndTablesInfo();
        refreshData();
      } catch (error) {
        toast.error(
          `Failed to delete table "${tableName}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    },
    [deleteTable, toast, fetchDatabasesAndTablesInfo, refreshData]
  );

  const handleShowSchema = useCallback(
    (databaseName: string, tableName: string) => async () => {
      const query = `DESCRIBE "${databaseName}"."${tableName}"`;

      createTab("sql", query, `${tableName} Schema`);

      const tabId = useDuckStore.getState().activeTabId;
      if (tabId) {
        await executeQuery(query, tabId);
      }
      toast.success(`Showing schema for table "${tableName}"`);
    },
    [createTab, executeQuery, toast]
  );

  const contextMenuOptions = useMemo(
    () => ({
      database: [],
      table: [
        {
          label: "Query Table",
          icon: <TerminalIcon className="w-4 h-4 mr-2" />,
          action: parentDatabaseName
            ? handleQueryData(parentDatabaseName, node.name)
            : () => {
                toast.error("Parent database name is undefined.");
              },
        },
        {
          label: "Show Schema",
          icon: <FileSpreadsheet className="w-4 h-4 mr-2" />,
          action: parentDatabaseName
            ? handleShowSchema(parentDatabaseName, node.name)
            : () => {
                toast.error("Parent database name is undefined.");
              },
        },
        {
          label: "Delete Table",
          icon: <Trash className="w-4 h-4 mr-2" />,
          action: parentDatabaseName
            ? handleDeleteTable(parentDatabaseName, node.name)
            : () => {
                toast.error("Parent database name is undefined.");
              },
        },
      ],
    }),
    [
      parentDatabaseName,
      node.name,
      handleQueryData,
      handleDeleteTable,
      handleShowSchema,
    ]
  );

  const matchesSearch = node.name
    .toLowerCase()
    .includes(searchTerm.toLowerCase());
  const childrenMatchSearch = node.children?.some(
    (child) =>
      child.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      child.children?.some((grandchild) =>
        grandchild.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
  );

  const shouldRender = !searchTerm || matchesSearch || childrenMatchSearch;

  return shouldRender ? (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={`flex items-center py-1 px-2 hover:bg-secondary hover:rounded-md cursor-pointer truncate
              ${level > 0 ? "ml-4" : ""}`}
            onClick={toggleOpen}
          >
            <div className="flex-grow flex items-center">
              {node.children ? (
                isOpen ? (
                  <ChevronDown className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-1" />
                )
              ) : (
                <div className="w-6 mr-1" />
              )}
              {getIcon}
              <div className="text-xs">
                <p className="truncate"> {node.name}</p>
              </div>
            </div>
            <div className="flex items-center">
              {contextMenuOptions[node.type as keyof typeof contextMenuOptions]
                .length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {contextMenuOptions[
                      node.type as keyof typeof contextMenuOptions
                    ].map((option, index) => (
                      <DropdownMenuItem key={index} onSelect={option.action}>
                        {option.icon}
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {contextMenuOptions[node.type as keyof typeof contextMenuOptions].map(
            (option, index) => (
              <ContextMenuItem key={index} onSelect={option.action}>
                {option.icon}
                {option.label}
              </ContextMenuItem>
            )
          )}
        </ContextMenuContent>
        {(isOpen || searchTerm) && node.children && (
          <div>
            {node.children.length > 0 ? (
              node.children.map((child) => (
                <TreeNode
                  key={`${node.type === "database" ? node.name : parentDatabaseName}-${child.name}`}
                  node={child}
                  level={level + 1}
                  searchTerm={searchTerm}
                  parentDatabaseName={
                    node.type === "database" ? node.name : parentDatabaseName
                  }
                  refreshData={refreshData}
                />
              ))
            ) : (
              <div className="ml-6 pl-4 text-xs italic text-muted-foreground">
                Nothing to show
              </div>
            )}
          </div>
        )}

        {/* Render column stats for tables */}
        {isOpen && node.type === "table" && (
          <div>
            {isLoadingStats ? (
              <div className="ml-8 flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading column statistics...</span>
              </div>
            ) : columnStats.length > 0 ? (
              columnStats.map((stats) => (
                <ColumnNode key={stats.column_name} stats={stats} />
              ))
            ) : null}
          </div>
        )}
      </ContextMenu>
    </>
  ) : null;
};

export default TreeNode;

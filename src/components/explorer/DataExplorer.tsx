import React, { useCallback, useState } from "react";
import { useDuckStore } from "@/store";
import {
  Table,
  Database,
  AlignJustify,
  Play,
  FileCode,
  Trash2,
  FileX2,
  List,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import FileImporter from "@/components/explorer/FileImporter";
import { Button } from "../ui/button";

const DataExplorer: React.FC = () => {
  // Store hooks
  const { tables, deleteTable, createTab, databases } = useDuckStore();

  // State
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Table actions
  const handleDeleteTable = async (tableName: string) => {
    try {
      await deleteTable(tableName);
      toast.success(`Table ${tableName} deleted`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to delete table:", error);
      toast.error(`Failed to delete table: ${errorMessage}`);
    }
  };

  const handlePreviewTable = useCallback(
    (tableName: string) => {
      createTab("sql", `SELECT * FROM "${tableName}" LIMIT 1000;`);
    },
    [createTab]
  );

  const handleViewSchema = useCallback(
    (tableName: string) => {
      createTab(
        "sql",
        `SELECT 
        column_name, 
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = '${tableName}'
      ORDER BY ordinal_position;`
      );
    },
    [createTab]
  );

  const handleViewDatabase = useCallback(
    (databaseName: string) => {
      createTab("sql", `PRAGMA database_size('${databaseName}');`);
    },
    [createTab]
  );

  // Empty state with import options
  if (tables.length === 0 && databases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Card className="w-[290px] border-none mx-auto p-2 mt-4 shadow-none cursor-pointer">
          <CardHeader className="text-center space-y-4">
            <h2 className="text-gray-500">There's nothing here...</h2>
            <FileX2 className="h-8 w-8 mt-4 m-auto text-gray-500" />
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-center">
              <FileImporter
                context="empty"
                isSheetOpen={isSheetOpen}
                setIsSheetOpen={setIsSheetOpen}
              />
            </div>
            <div className="flex items-center justify-center">
              <Button
                onClick={() =>
                  createTab(
                    "sql",
                    `
-- Welcome to Duck UI Explore 🦆
-- You can run the following queries to get a grasp of it.
-- Remote Parquet scans:
SELECT * FROM 'https://shell.duckdb.org/data/tpch/0_01/parquet/orders.parquet' LIMIT 1000;

SELECT avg(c_acctbal) FROM 'https://shell.duckdb.org/data/tpch/0_01/parquet/customer.parquet';

SELECT count(*)::int as aws_service_cnt FROM 'https://raw.githubusercontent.com/tobilg/aws-iam-data/main/data/parquet/aws_services.parquet';

SELECT * FROM 'https://raw.githubusercontent.com/tobilg/aws-edge-locations/main/data/aws-edge-locations.parquet';

SELECT cloud_provider, sum(ip_address_cnt)::int as cnt FROM 'https://raw.githubusercontent.com/tobilg/public-cloud-provider-ip-ranges/main/data/providers/all.parquet' GROUP BY cloud_provider;
                
-- Remote CSV scan
SELECT * FROM read_csv_auto('https://raw.githubusercontent.com/tobilg/public-cloud-provider-ip-ranges/main/data/providers/all.csv');

-- Remote JSON from API call
SELECT * FROM read_json('https://api.tvmaze.com/search/shows?q=duck', auto_detect=true);

-- Attach remote database
ATTACH 'https://raw.githubusercontent.com/tobilg/aws-iam-data/main/data/db/iam.duckdb' as aws_iam (READ_ONLY);
                `,
                    "Duck UI Explore"
                  )
                }
              >
                Examples
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Table list view
  return (
    <DatabaseTableView
      databases={databases}
      tables={tables}
      handleDeleteTable={handleDeleteTable}
      handlePreviewTable={handlePreviewTable}
      handleViewSchema={handleViewSchema}
      handleViewDatabase={handleViewDatabase}
      isSheetOpen={isSheetOpen} // Pass down isSheetOpen
      setIsSheetOpen={setIsSheetOpen} // Pass down setIsSheetOpen
    />
  );
};

export default DataExplorer;

// Extracted Components

interface DatabaseTableViewProps {
  databases: Array<{
    name: string;
    size?: number;
  }>;
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
    }>;
  }>;
  handleDeleteTable: (tableName: string) => Promise<void>;
  handlePreviewTable: (tableName: string) => void;
  handleViewSchema: (tableName: string) => void;
  handleViewDatabase: (databaseName: string) => void;
  isSheetOpen: boolean; // Define the prop for isSheetOpen
  setIsSheetOpen: React.Dispatch<React.SetStateAction<boolean>>; // Define the prop for setIsSheetOpen
}

const DatabaseTableView: React.FC<DatabaseTableViewProps> = ({
  databases,
  tables,
  handleDeleteTable,
  handlePreviewTable,
  handleViewSchema,
  handleViewDatabase,
  isSheetOpen, // Use the prop isSheetOpen
  setIsSheetOpen, // Use the prop setIsSheetOpen
}) => {
  const hasDatabases = databases && databases.length > 0;

  return (
    <>
      {hasDatabases && (
        <div className="flex items-center justify-between p-2 mt-3">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <span className="text-sm font-medium">
              Databases ({databases.length})
            </span>
          </div>
        </div>
      )}

      <ScrollArea className="h-full">
        <div className="p-2">
          {hasDatabases && (
            <Accordion type="multiple" className="w-full">
              {databases.map((database) => (
                <ContextMenu key={database.name}>
                  <ContextMenuTrigger>
                    <AccordionItem
                      value={database.name}
                      className="border-none"
                    >
                      <AccordionTrigger
                        className={cn("rounded-md px-2 mb-2")}
                        onClick={() => database.name}
                      >
                        <div className="flex items-center gap-2 py-1">
                          <Database className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {database.name}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pl-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 px-2 py-1 text-sm rounded">
                            <AlignJustify className="h-3 w-3" />
                            <span className="font-mono">Size</span>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </ContextMenuTrigger>

                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => handleViewDatabase(database.name)}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      View Size
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </Accordion>
          )}

          {tables.length > 0 && (
            <div className="flex items-center justify-between p-2 mt-3">
              <div className="flex items-center gap-2">
                <Table className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Tables ({tables.length})
                </span>
              </div>
              <FileImporter
                context="notEmpty"
                isSheetOpen={isSheetOpen}
                setIsSheetOpen={setIsSheetOpen}
              />
            </div>
          )}
          {/* Table List */}
          <Accordion type="multiple" className="w-full">
            {tables.map((table) => (
              <ContextMenu key={table.name}>
                <ContextMenuTrigger>
                  <AccordionItem value={table.name} className="border-none">
                    <AccordionTrigger
                      className={cn("rounded-md px-2 mb-2")}
                      onClick={() => table.name}
                    >
                      <div className="flex items-center gap-2 py-1">
                        <Table className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {table.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({table.columns.length} columns)
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pl-4">
                      <div className="space-y-1">
                        {table.columns.map((column) => (
                          <TooltipProvider key={column.name}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 px-2 py-1 text-sm rounded">
                                  <AlignJustify className="h-3 w-3" />
                                  <span className="font-mono">
                                    {column.name}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({column.type})
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1">
                                  <p className="font-medium">{column.type}</p>
                                  <p className="text-xs text-gray-500">
                                    {column.nullable
                                      ? "Nullable"
                                      : "Not Nullable"}
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </ContextMenuTrigger>

                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => handlePreviewTable(table.name)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Preview Data
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleViewSchema(table.name)}>
                    <FileCode className="h-4 w-4 mr-2" />
                    View Schema
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => handleDeleteTable(table.name)}
                    className="text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Table
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </Accordion>
        </div>
      </ScrollArea>
    </>
  );
};

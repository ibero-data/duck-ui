import React, { useState } from "react";
import { useDuckStore } from "@/store/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, FileUp, Plus } from "lucide-react";
import FileImporter from "./FileImporter";
import TreeNode, { TreeNodeData } from "./TreeNode";
import { Input } from "@/components/ui/input";
export default function DataExplorer() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { databases } = useDuckStore();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };
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

  return (
    <Card className="h-full overflow-hidden border-none">
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">
              Data Explorer
            </CardTitle>
          </div>
          <FileImporter
            isSheetOpen={isSheetOpen}
            setIsSheetOpen={setIsSheetOpen}
            context={"notEmpty"}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setIsSheetOpen(true)}
          >
            <FileUp className="h-4 w-4" />
            Import Data
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-2 h-[calc(100%-60px)] overflow-y-auto">
        {databases.length > 0 ? (
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={handleSearch}
              className="m-auto w-[calc(100%-2rem)] focus:ring-0
              "
            />
            <div className="flex items-center justify-between px-2">
              <p className="text-muted-foreground text-xs">
                {databases.length}{" "}
                {databases.length > 1 ? "databases" : "database"}
              </p>
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
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <Database className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                No databases found. Start by importing some data!
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setIsSheetOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Import Data
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

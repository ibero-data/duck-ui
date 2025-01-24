import { useState } from "react";
import { useDuckStore } from "@/store";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Database,
  Table,
  Columns,
  FileUp,
  Plus
} from "lucide-react";
import FileImporter from "./FileImporter";

export default function DataExplorer() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { databases, currentDatabase, switchDatabase } = useDuckStore();

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Data Explorer</CardTitle>
          </div>
          <FileImporter 
            isSheetOpen={isSheetOpen}
            setIsSheetOpen={setIsSheetOpen}
            context={"notEmpty"}
          >
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2"
              onClick={() => setIsSheetOpen(true)}
            >
              <FileUp className="h-4 w-4" />
              Import Data
            </Button>
          </FileImporter>
        </div>
      </CardHeader>
      
      <CardContent className="p-2 h-[calc(100%-60px)] overflow-y-auto">
        <Accordion type="multiple" className="space-y-2">
          {databases.map((database) => (
            <AccordionItem 
              key={database.name}
              value={database.name}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger 
                //onClick={() => switchDatabase(database.name)}
                className="px-3 py-2 hover:no-underline"
              >
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{database.name}</span>
                  {currentDatabase === database.name && (
                    <span className="h-2 w-2 rounded-full bg-primary ml-auto" />
                  )}
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="pb-0">
                <Accordion type="multiple" className="ml-4">
                  {database.tables.map((table) => (
                    <AccordionItem 
                      key={`${database.name}-${table.name}`}
                      value={table.name}
                      className="border-none"
                    >
                      <AccordionTrigger className="py-1 px-2 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Table className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{table.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {table.rowCount} rows
                          </span>
                        </div>
                      </AccordionTrigger>
                      
                      <AccordionContent className="pb-0">
                        <div className="ml-6 space-y-1">
                          {table.columns.map((column) => (
                            <div 
                              key={`${database.name}-${table.name}-${column.name}`}
                              className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-accent rounded"
                            >
                              <Columns className="h-4 w-4 text-muted-foreground" />
                              <span>{column.name}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {column.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {databases.length === 0 && (
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
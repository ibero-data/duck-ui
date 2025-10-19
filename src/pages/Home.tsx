import { useState } from "react";
import { Menu } from "lucide-react";
import DataExplorer from "@/components/explorer/DataExplorer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import WorkspaceTabs from "@/components/workspace/WorkspaceTabs";

export default function Home() {
  const [dataExplorerOpen, setDataExplorerOpen] = useState(false);

  return (
    <div className="h-screen w-full overflow-auto">
      {/* Desktop Layout - ResizablePanels */}
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel
            className="overflow-scroll"
            defaultSize={20}
            minSize={15}
            maxSize={35}
          >
            <DataExplorer />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            className="overflow-scroll"
            defaultSize={80}
            minSize={50}
          >
            <WorkspaceTabs />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile Layout - Stacked with Drawer */}
      <div className="md:hidden h-full flex flex-col">
        {/* Data Explorer Drawer */}
        <Sheet open={dataExplorerOpen} onOpenChange={setDataExplorerOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-16 left-2 z-40 flex items-center gap-2"
            >
              <Menu className="h-4 w-4" />
              <span className="text-xs">Tables</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
            <SheetHeader className="px-4 py-3 border-b">
              <SheetTitle>Data Explorer</SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100%-60px)] overflow-auto">
              <DataExplorer />
            </div>
          </SheetContent>
        </Sheet>

        {/* Main Workspace - Full Screen */}
        <div className="flex-1 overflow-auto">
          <WorkspaceTabs />
        </div>
      </div>
    </div>
  );
}

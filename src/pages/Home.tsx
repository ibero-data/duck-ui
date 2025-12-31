import { useState } from "react";
import { Menu } from "lucide-react";
import DataExplorer from "@/components/explorer/DataExplorer";
import Sidebar from "@/components/layout/Sidebar";
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
  const [isExplorerVisible, setIsExplorerVisible] = useState(true);

  return (
    <div className="h-screen w-full flex overflow-hidden">
      {/* Sidebar - Desktop only */}
      <div className="hidden md:flex">
        <Sidebar
          isExplorerOpen={isExplorerVisible}
          onToggleExplorer={() => setIsExplorerVisible(!isExplorerVisible)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop Layout - ResizablePanels */}
        <div className="hidden md:flex h-full">
          <ResizablePanelGroup direction="horizontal">
            {isExplorerVisible && (
              <>
                <ResizablePanel
                  className="overflow-auto"
                  defaultSize={20}
                  minSize={15}
                  maxSize={35}
                >
                  <DataExplorer />
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}
            <ResizablePanel
              className="overflow-auto"
              defaultSize={isExplorerVisible ? 80 : 100}
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
    </div>
  );
}

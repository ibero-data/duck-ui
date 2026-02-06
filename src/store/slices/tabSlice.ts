import type { StateCreator } from "zustand";
import { toast } from "sonner";
import { generateUUID } from "@/lib/utils";
import type { DuckStoreState, TabSlice, EditorTab } from "../types";

export const createTabSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  TabSlice
> = (set) => ({
  tabs: [
    {
      id: "home",
      title: "Home",
      type: "home",
      content: "",
    },
  ],
  activeTabId: "home",

  createTab: (type = "sql", content = "", title) => {
    const newTab: EditorTab = {
      id: generateUUID(),
      title: typeof title === "string" ? title : "Untitled Query",
      type,
      content,
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeTab: (tabId) => {
    set((state) => {
      const updatedTabs = state.tabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;
      if (updatedTabs.length === 0) {
        const newTab: EditorTab = {
          id: generateUUID(),
          title: "Query 1",
          type: "sql",
          content: "",
        };
        return {
          tabs: [newTab],
          activeTabId: newTab.id,
        };
      }
      if (state.activeTabId === tabId) {
        newActiveTabId = updatedTabs[0]?.id || null;
      }
      return {
        tabs: updatedTabs,
        activeTabId: newActiveTabId,
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateTabQuery: (tabId, query) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId && tab.type === "sql" ? { ...tab, content: query } : tab
      ),
    }));
  },

  updateTabTitle: (tabId, title) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)),
    }));
  },

  updateTabChartConfig: (tabId, chartConfig) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, chartConfig } : tab)),
    }));
  },

  moveTab: (oldIndex, newIndex) => {
    set((state) => {
      const newTabs = [...state.tabs];
      const [movedTab] = newTabs.splice(oldIndex, 1);
      newTabs.splice(newIndex, 0, movedTab);
      return { tabs: newTabs };
    });
  },

  closeAllTabs: () => {
    try {
      set((state) => ({
        tabs: state.tabs.filter((tab) => tab.type === "home"),
        activeTabId: "home",
      }));
      toast.success("All tabs closed successfully!");
    } catch (error: any) {
      toast.error(`Failed to close tabs: ${error.message}`);
    }
  },
});

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { createDuckdbSlice } from "./slices/duckdbSlice";
import { createConnectionSlice } from "./slices/connectionSlice";
import { createQuerySlice } from "./slices/querySlice";
import { createSchemaSlice } from "./slices/schemaSlice";
import { createTabSlice } from "./slices/tabSlice";
import { createDuckBrainSlice } from "./slices/duckBrainSlice";
import { createFileSystemSlice } from "./slices/fileSystemSlice";
import { createProfileSlice } from "./slices/profileSlice";
import { saveWorkspace } from "@/services/persistence/repositories/workspaceRepository";
import { saveProviderConfig, saveConversation } from "@/services/persistence/repositories/aiConfigRepository";
import { isSystemDbInitialized } from "@/services/persistence/systemDb";
import type { DuckStoreState } from "./types";

// Re-export all types from the centralized types file
export * from "./types";

// Re-export cloud storage types for use in components
export type { CloudConnection, CloudSupportStatus } from "@/lib/cloudStorage";

export const useDuckStore = create<DuckStoreState>()(
  devtools((...a) => ({
    ...createDuckdbSlice(...a),
    ...createConnectionSlice(...a),
    ...createQuerySlice(...a),
    ...createSchemaSlice(...a),
    ...createTabSlice(...a),
    ...createDuckBrainSlice(...a),
    ...createFileSystemSlice(...a),
    ...createProfileSlice(...a),
  }))
);

// ─── Auto-save: debounced writes to system DB ────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout>;
let lastSavedTabs: string | undefined;
let lastSavedAiProvider: string | undefined;
let lastSavedMessages: number | undefined;

async function persistWorkspaceState(state: DuckStoreState): Promise<void> {
  const { currentProfileId, encryptionKey, isProfileLoaded } = state;
  if (!currentProfileId || !isProfileLoaded || !isSystemDbInitialized()) return;

  try {
    // Save workspace (tabs, active tab, current DB)
    const tabsJson = JSON.stringify(
      state.tabs.map((tab) => ({ ...tab, result: undefined }))
    );
    if (tabsJson !== lastSavedTabs) {
      await saveWorkspace(currentProfileId, {
        tabs: tabsJson,
        activeTabId: state.activeTabId,
        currentConnectionId: state.currentConnection?.id ?? null,
        currentDatabase: state.currentDatabase ?? null,
      });
      lastSavedTabs = tabsJson;
    }

    // Save AI provider configs when changed
    const currentProvider = state.duckBrain.aiProvider;
    if (currentProvider !== lastSavedAiProvider) {
      const configs = state.duckBrain.providerConfigs;
      for (const [provider, config] of Object.entries(configs)) {
        if (config) {
          const apiKey = "apiKey" in config ? (config.apiKey as string) : null;
          const safeConfig: Record<string, unknown> = { modelId: (config as Record<string, unknown>).modelId };
          if ("baseUrl" in config) safeConfig.baseUrl = config.baseUrl;
          await saveProviderConfig(currentProfileId, provider, safeConfig, apiKey ?? null, encryptionKey);
        }
      }
      lastSavedAiProvider = currentProvider;
    }

    // Save AI messages when changed
    const messageCount = state.duckBrain.messages.length;
    if (messageCount !== lastSavedMessages && messageCount > 0) {
      await saveConversation(currentProfileId, state.duckBrain.messages, {
        id: `${currentProfileId}-default`,
        title: "Default conversation",
        provider: state.duckBrain.aiProvider,
      });
      lastSavedMessages = messageCount;
    }
  } catch (error) {
    console.warn("[AutoSave] Failed to persist state:", error);
  }
}

export function startAutoSave(): void {
  useDuckStore.subscribe((state) => {
    if (!state.isProfileLoaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistWorkspaceState(state), 2000);
  });
}

// Also save on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const state = useDuckStore.getState();
    if (state.isProfileLoaded) {
      // Best-effort sync save (may be truncated by browser)
      persistWorkspaceState(state);
    }
  });
}

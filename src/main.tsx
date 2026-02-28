import "./index.css";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Suspense } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Routes, Route } from "react-router";
import { useDuckStore, startAutoSave } from "./store";
import Home from "@/pages/Home";
import { Toaster } from "@/components/ui/sonner";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Navigate } from "react-router";
import { initializeSystemDb } from "@/services/persistence/systemDb";
import { listProfiles } from "@/services/persistence/repositories/profileRepository";
import ProfilePicker from "@/components/profile/ProfilePicker";
import type { Profile } from "@/store/types";

// Import httpfs test utility for console access (window.testHttpfs)
import "@/lib/cloudStorage/testHttpfs";

interface LoadingScreenProps {
  message: string;
}

interface AppInitializerProps {
  children: React.ReactNode;
}

const LoadingScreen = ({ message }: LoadingScreenProps) => (
  <div className="h-screen flex items-center justify-center bg-black/90 text-white">
    <div className="text-center">
      <Loader2 className="animate-spin m-auto mb-12" size={64} />
      <p className="text-lg">{message}</p>
    </div>
  </div>
);

const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="h-screen flex items-center justify-center bg-background text-foreground">
    <div className="text-center max-w-md p-6">
      <AlertTriangle className="mx-auto mb-4 text-destructive" size={48} />
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        {error instanceof Error
          ? error.message
          : "An unexpected error occurred while rendering the application."}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  </div>
);

/**
 * ProfileBootstrap — initializes the system database and loads the user's profile
 * before the main app starts. Handles first-time setup and localStorage migration.
 * When multiple profiles exist, shows a profile picker screen.
 */
const ProfileBootstrap = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [bootProfiles, setBootProfiles] = useState<Profile[]>([]);
  const { createProfile, loadProfile } = useDuckStore();
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    async function boot() {
      try {
        await initializeSystemDb();
        const profiles = await listProfiles();

        if (profiles.length === 1 && !profiles[0].has_password) {
          // Single unprotected profile: auto-load
          await loadProfile(profiles[0].id);
          startAutoSave();
          setReady(true);
        } else {
          // 0 profiles, multiple profiles, or single password-protected: show picker
          setBootProfiles(
            profiles.map((p) => ({
              id: p.id,
              name: p.name,
              avatarEmoji: p.avatar_emoji,
              hasPassword: p.has_password,
              createdAt: p.created_at,
              lastActive: p.last_active,
            }))
          );
          setShowPicker(true);
        }
      } catch (error) {
        console.error("[ProfileBootstrap] Failed to initialize profile:", error);
        setReady(true);
      }
    }

    boot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready && !showPicker) {
    return <LoadingScreen message="Loading profile..." />;
  }

  if (showPicker && !ready) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <ProfilePicker
          profiles={bootProfiles}
          onSelectProfile={async (id, password) => {
            await loadProfile(id, password);
            startAutoSave();
            setReady(true);
            setShowPicker(false);
          }}
          onCreateProfile={async (name, password, avatarEmoji) => {
            const id = await createProfile(name, password, avatarEmoji);
            await migrateFromLocalStorage(id);
            await loadProfile(id, password);
            startAutoSave();
            setReady(true);
            setShowPicker(false);
            return id;
          }}
        />
      </ThemeProvider>
    );
  }

  return children;
};

/**
 * Migrate existing localStorage state to the system database.
 * One-time operation on first boot after the profile system is introduced.
 */
async function migrateFromLocalStorage(profileId: string): Promise<void> {
  if (localStorage.getItem("duck-ui-migrated") === "true") return;

  const raw = localStorage.getItem("duck-ui-storage");
  if (!raw) {
    localStorage.setItem("duck-ui-migrated", "true");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const state = parsed.state ?? parsed;

    const { saveWorkspace } =
      await import("@/services/persistence/repositories/workspaceRepository");
    const { addHistoryEntry } =
      await import("@/services/persistence/repositories/queryHistoryRepository");
    const { saveProviderConfig, saveConversation } =
      await import("@/services/persistence/repositories/aiConfigRepository");
    const { setSetting } = await import("@/services/persistence/repositories/settingsRepository");
    const { saveConnection } =
      await import("@/services/persistence/repositories/connectionRepository");
    const { loadKeyForProfile } = await import("@/services/persistence/crypto");

    // Load the encryption key for this profile
    const keyData = await loadKeyForProfile(profileId);
    const cryptoKey = keyData?.key ?? null;

    // Migrate connections
    const connections = state.connectionList?.connections ?? [];
    for (const conn of connections) {
      if (!conn.id || conn.scope === "WASM") continue;
      const config: Record<string, unknown> = {
        host: conn.host,
        port: conn.port,
        database: conn.database,
        path: conn.path,
        authMode: conn.authMode,
      };
      const credentials: Record<string, unknown> = {};
      if (conn.password) credentials.password = conn.password;
      if (conn.apiKey) credentials.apiKey = conn.apiKey;

      await saveConnection(
        profileId,
        {
          name: conn.name ?? "Untitled",
          scope: conn.scope ?? "External",
          config,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
          environment: conn.environment ?? "APP",
        },
        cryptoKey
      );
    }

    // Migrate query history
    for (const item of state.queryHistory ?? []) {
      await addHistoryEntry(profileId, item.query, {
        error: item.error,
      });
    }

    // Migrate workspace state (tabs)
    if (state.tabs) {
      const tabsJson = JSON.stringify(
        state.tabs.map((t: Record<string, unknown>) => ({ ...t, result: undefined }))
      );
      await saveWorkspace(profileId, {
        tabs: tabsJson,
        activeTabId: (state.activeTabId as string) ?? null,
        currentConnectionId:
          ((state.currentConnection as Record<string, unknown>)?.id as string) ?? null,
        currentDatabase: (state.currentDatabase as string) ?? null,
      });
    }

    // Migrate AI provider configs
    const providerConfigs = state.duckBrain?.providerConfigs ?? {};
    for (const [provider, config] of Object.entries(providerConfigs)) {
      if (!config) continue;
      const cfg = config as Record<string, string>;
      const apiKey = cfg.apiKey ?? null;
      const safeConfig: Record<string, unknown> = { modelId: cfg.modelId };
      if (cfg.baseUrl) safeConfig.baseUrl = cfg.baseUrl;
      await saveProviderConfig(profileId, provider, safeConfig, apiKey, cryptoKey);
    }

    // Migrate AI messages
    if (state.duckBrain?.messages?.length) {
      await saveConversation(profileId, state.duckBrain.messages, {
        title: "Migrated conversation",
        provider: state.duckBrain.aiProvider,
      });
    }

    // Migrate theme
    const theme = localStorage.getItem("vite-ui-theme");
    if (theme) {
      await setSetting(profileId, "theme", "mode", JSON.stringify(theme));
    }

    console.info("[Migration] Successfully migrated localStorage data to system DB");
  } catch (error) {
    console.warn("[Migration] Failed to migrate localStorage:", error);
  }

  localStorage.setItem("duck-ui-migrated", "true");
}

const AppInitializer = ({ children }: AppInitializerProps) => {
  const { initialize, isInitialized, isLoading } = useDuckStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading || !isInitialized) {
    return <LoadingScreen message="Initializing DuckDB" />;
  }

  return children;
};

const App = () => {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only prompt when there are SQL tabs with unsaved content
      const state = useDuckStore.getState();
      const hasUnsavedWork = state.tabs.some(
        (t) => t.type === "sql" && typeof t.content === "string" && t.content.trim().length > 0
      );
      if (hasUnsavedWork) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden">
      <Toaster richColors toastOptions={{ duration: 2000, closeButton: true }} expand={true} />
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find root element");

// Production render
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ProfileBootstrap>
        <AppInitializer>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
              <Suspense fallback={<LoadingScreen message="Loading application" />}>
                <App />
              </Suspense>
            </ThemeProvider>
          </BrowserRouter>
        </AppInitializer>
      </ProfileBootstrap>
    </ErrorBoundary>
  </StrictMode>
);

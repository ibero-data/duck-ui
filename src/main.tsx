import "./index.css";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Suspense } from "react";
import Sidebar from "@/components/sidebar/Sidebar";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Routes, Route } from "react-router";
import { useDuckStore } from "./store";
import Home from "@/pages/Home";
import Settings from "./pages/Settings";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import Logo from "/logo.png";

interface LoadingScreenProps {
  message: string;
}

interface AppInitializerProps {
  children: React.ReactNode;
}

const LoadingScreen = ({ message }: LoadingScreenProps) => (
  <div className="h-screen flex items-center justify-center bg-black/90 text-white">
    <div className="text-center">
      <img src={Logo} alt="Logo" className="h-18  w-22 m-auto mb-8 pl-24" />
      <Loader2 className="animate-spin m-auto mb-12" size={64} />
      <p className="text-lg">{message}</p>
    </div>
  </div>
);

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
      e.preventDefault();
      return (e.returnValue =
        "Duck-UI runs on WASM and does not persist data. Reloading will make you lose all unsaved data.");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <Sidebar />
      <Toaster
        richColors
        toastOptions={{ duration: 2000, closeButton: true }}
        expand={true}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find root element");

// Development render
if (import.meta.env.DEV) {
  const existingRoot = (rootElement as any)._reactRootContainer;
  const renderApp = (root: ReturnType<typeof createRoot>) => {
    root.render(
      <StrictMode>
        <AppInitializer>
          <BrowserRouter>
            <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
              <Suspense
                fallback={<LoadingScreen message="Loading application" />}
              >
                <App />
              </Suspense>
            </ThemeProvider>
          </BrowserRouter>
        </AppInitializer>
      </StrictMode>
    );
  };

  if (existingRoot) {
    renderApp(existingRoot);
  } else {
    const root = createRoot(rootElement);
    (rootElement as any)._reactRootContainer = root;
    renderApp(root);
  }
} else {
  // Production render
  createRoot(rootElement).render(
    <StrictMode>
      <AppInitializer>
        <BrowserRouter>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <Suspense
              fallback={<LoadingScreen message="Loading application" />}
            >
              <App />
            </Suspense>
          </ThemeProvider>
        </BrowserRouter>
      </AppInitializer>
    </StrictMode>
  );
}

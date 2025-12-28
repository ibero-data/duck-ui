import "./index.css";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Suspense } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Routes, Route } from "react-router";
import { useDuckStore } from "./store";
import Home from "@/pages/Home";
import { Toaster } from "@/components/ui/sonner";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import NotFound from "./pages/NotFound";
import Connections from "./pages/Connections";
import Brain from "./pages/Brain";

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
        {error.message || "An unexpected error occurred while rendering the application."}
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
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden">
      <Toaster
        richColors
        toastOptions={{ duration: 2000, closeButton: true }}
        expand={true}
      />
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/brain" element={<Brain />} />
          <Route path="*" element={<NotFound />} />
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
      <AppInitializer>
        <BrowserRouter>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <Suspense fallback={<LoadingScreen message="Loading application" />}>
              <App />
            </Suspense>
          </ThemeProvider>
        </BrowserRouter>
      </AppInitializer>
    </ErrorBoundary>
  </StrictMode>
);

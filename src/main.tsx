import "./index.css";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Routes, Route } from "react-router";
import { useDuckStore } from "./store";
import Home from "@/pages/Home";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import NotFound from "./pages/NotFound";
import Connections from "./pages/Connections";

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
    // add umami analytics if the hostname is https://demo.duckui.com

    if (window.location.hostname === "demo.duckui.com") {
      const script = document.createElement("script");
      script.src = "https://umami.duckui.com/script.js";
      script.async = true;
      script.setAttribute(
        "data-website-id",
        "b79701f2-013e-4de6-b59f-8b456175c1da"
      );
      document.body.appendChild(script);
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return (e.returnValue =
        "Duck-UI runs on WASM and does not persist data. Reloading will make you lose all unsaved data.");
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
    <AppInitializer>
      <BrowserRouter>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <Suspense fallback={<LoadingScreen message="Loading application" />}>
            <App />
          </Suspense>
        </ThemeProvider>
      </BrowserRouter>
    </AppInitializer>
  </StrictMode>
);

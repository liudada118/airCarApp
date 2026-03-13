import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Routes() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Detect if running in Electron (file:// protocol) and use hash routing
  const isElectron =
    typeof window !== "undefined" &&
    (window.location.protocol === "file:" ||
      navigator.userAgent.toLowerCase().includes("electron"));

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "oklch(0.16 0.02 250)",
                border: "1px solid oklch(0.25 0.03 250)",
                color: "oklch(0.92 0.01 250)",
              },
            }}
          />
          {isElectron ? (
            <WouterRouter hook={useHashLocation}>
              <Routes />
            </WouterRouter>
          ) : (
            <Routes />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./styles/toasts.css";
import "./themeBootstrap";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { isMacElectronClient } from "./utils/platform.ts";
import { installRendererDiagnosticHooks } from "./utils/rendererDiagnosticHooks";

installRendererDiagnosticHooks();

// Reserve space for native traffic lights when using titleBarStyle: hiddenInset (Electron on macOS).
if (isMacElectronClient()) {
  document.documentElement.classList.add("mac-traffic");
}

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { applyDevScenarioFromUrlOrEnv } = await import("./dev/applyDevScenario");
    applyDevScenarioFromUrlOrEnv();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden w-full">
          <App />
        </div>
        <Toaster
          theme={document.documentElement.dataset.theme === "dark" ? "dark" : "light"}
          position="bottom-right"
          richColors={false}
          toastOptions={{
            classNames: {
              error: "app-sonner-toast-error",
              warning: "app-sonner-toast-warning",
            },
          }}
        />
      </ErrorBoundary>
    </StrictMode>
  );
}

void bootstrap();

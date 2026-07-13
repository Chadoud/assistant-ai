/**
 * Dev-only: seed localStorage so you can reproduce welcome / returning / skipped flows
 * without hand-editing Application storage.
 *
 * Usage:
 * - `npm run dev:first-run` / `dev:returning` / `dev:skipped` (from repo root), or
 *   (`first-run` / `welcome` also clear the spotlight-tour-completed flag so the post-setup tour can run.)
 * - `VITE_DEV_SCENARIO=first-run` when starting Vite, or
 * - open `http://127.0.0.1:5173/?devScenario=returning` (param stripped after apply)
 */
import {
  SETTINGS_STORAGE_KEY,
  TOUR_COMPLETED_STORAGE_KEY,
  WELCOME_SETUP_DISMISSED_STORAGE_KEY,
} from "../constants";
import { DEFAULT_APP_SETTINGS } from "../hooks/useAppSettings";

type DevWelcomeScenario = "first-run" | "welcome" | "returning" | "skipped";

const SESSION_KEY = "__exositesDevScenario";

function isKnownScenario(s: string): s is DevWelcomeScenario {
  return s === "first-run" || s === "welcome" || s === "returning" || s === "skipped";
}

function resolveDevScenario(): string | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("devScenario");
    if (q?.trim()) return q.trim();
  } catch {
    /* ignore */
  }
  const env = import.meta.env.VITE_DEV_SCENARIO;
  return typeof env === "string" && env.trim() ? env.trim() : null;
}

function applyDevScenarioToStorage(scenario: DevWelcomeScenario): void {
  if (!import.meta.env.DEV) return;
  try {
    switch (scenario) {
      case "first-run":
      case "welcome": {
        localStorage.removeItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY);
        localStorage.removeItem(TOUR_COMPLETED_STORAGE_KEY);
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({ ...DEFAULT_APP_SETTINGS, model: "", outputDir: "" })
        );
        break;
      }
      case "returning": {
        localStorage.removeItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY);
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({
            ...DEFAULT_APP_SETTINGS,
            outputDir: "C:\\Dev\\ExositesTestOutput",
            model: "dev-placeholder-model",
          })
        );
        break;
      }
      case "skipped": {
        localStorage.setItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY, "1");
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({ ...DEFAULT_APP_SETTINGS, model: "", outputDir: "" })
        );
        break;
      }
      default:
        break;
    }
    sessionStorage.setItem(SESSION_KEY, scenario);
  } catch (e) {
    console.warn("[dev] applyDevScenarioToStorage failed", e);
  }
}

/** Run once before React mount. Clears session marker when no scenario is active. */
export function applyDevScenarioFromUrlOrEnv(): void {
  if (!import.meta.env.DEV) return;
  const raw = resolveDevScenario();
  try {
    if (!raw) {
      try {
        if (sessionStorage.getItem(SESSION_KEY) === "e2e") {
          return;
        }
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const scenario = raw.toLowerCase();
    if (!isKnownScenario(scenario)) {
      console.warn(
        `[dev] Unknown dev scenario "${raw}". Use: first-run | welcome | returning | skipped`
      );
      return;
    }
    applyDevScenarioToStorage(scenario);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("devScenario")) {
        u.searchParams.delete("devScenario");
        window.history.replaceState({}, "", u.pathname + u.search + u.hash);
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn("[dev] applyDevScenarioFromUrlOrEnv failed", e);
  }
}

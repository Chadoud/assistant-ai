import type { SystemCommandCatalogEntry, SystemCommandIdV1 } from "./types";

export const navigateSystemCommandCatalog = {
  navigate_tab: { risk: "low", description: "Switch main app tab" },
  open_help: { risk: "low", description: "Open Help & shortcuts" },
  open_tour: { risk: "low", description: "Open onboarding tour" },
  open_output_folder: { risk: "medium", description: "Open the configured output folder in Exo" },
  open_application: {
    risk: "high",
    description: "Open a preset external application by id (no paths from the model)",
  },
  restart_backend: {
    risk: "medium",
    description: "Restart the local Python sorting service (same as Retry in the title bar)",
  },
  open_workspace_folder: {
    risk: "medium",
    description: "Open a user-authorized workspace folder by index (no free-form paths from the model)",
  },
} satisfies Partial<Record<SystemCommandIdV1, SystemCommandCatalogEntry>>;

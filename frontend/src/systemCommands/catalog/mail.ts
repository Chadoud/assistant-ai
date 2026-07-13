import type { SystemCommandCatalogEntry, SystemCommandIdV1 } from "./types";

export const mailSystemCommandCatalog = {
  graph_mail_search: {
    risk: "low",
    description: "Search or list recent Outlook mail via Microsoft Graph with strict caps (no free-form paths)",
  },
  gmail_search_messages: {
    risk: "low",
    description: "Search Gmail message headers/metadata via the local API (Gmail connected in Settings)",
  },
} satisfies Partial<Record<SystemCommandIdV1, SystemCommandCatalogEntry>>;

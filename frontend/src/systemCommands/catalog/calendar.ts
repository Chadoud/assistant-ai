import type { SystemCommandCatalogEntry, SystemCommandIdV1 } from "./types";

export const calendarSystemCommandCatalog = {
  graph_calendar_list_events: {
    risk: "low",
    description:
      "List Microsoft calendar events in a bounded time window (Microsoft account with calendar scopes)",
  },
  google_calendar_list_events: {
    risk: "low",
    description:
      "List Google Calendar events in a bounded window (separate Google Calendar connection in Settings)",
  },
  infomaniak_calendar_list_events: {
    risk: "low",
    description:
      "List Infomaniak calendar events in a bounded window (Infomaniak calendar connection in Settings)",
  },
} satisfies Partial<Record<SystemCommandIdV1, SystemCommandCatalogEntry>>;

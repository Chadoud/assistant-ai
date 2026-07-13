import { calendarSystemCommandCatalog } from "./calendar";
import { filesSystemCommandCatalog } from "./files";
import { mailSystemCommandCatalog } from "./mail";
import { navigateSystemCommandCatalog } from "./navigate";
import { systemSystemCommandCatalog } from "./system";
import type { SystemCommandCatalogEntry, SystemCommandIdV1 } from "./types";

export const SYSTEM_COMMAND_CATALOG = {
  ...navigateSystemCommandCatalog,
  ...filesSystemCommandCatalog,
  ...calendarSystemCommandCatalog,
  ...mailSystemCommandCatalog,
  ...systemSystemCommandCatalog,
} satisfies Record<SystemCommandIdV1, SystemCommandCatalogEntry>;

export function isSystemCommandIdV1(id: unknown): id is SystemCommandIdV1 {
  return typeof id === "string" && id in SYSTEM_COMMAND_CATALOG;
}

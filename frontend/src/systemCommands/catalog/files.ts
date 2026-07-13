import type { SystemCommandCatalogEntry, SystemCommandIdV1 } from "./types";

export const filesSystemCommandCatalog = {
  save_text_file: {
    risk: "high",
    description:
      "Write UTF-8 text to a .txt/.md file under the configured output folder or an authorized workspace index",
  },
  graph_onedrive_upload_text: {
    risk: "high",
    description:
      "Upload a small .txt or .md file to the user’s OneDrive (Microsoft account connected in Settings)",
  },
  google_drive_upload_text: {
    risk: "high",
    description:
      "Upload a small .txt or .md file to Google Drive (Google connected in Settings; uses app-scoped file access)",
  },
  list_directory: {
    risk: "low",
    description: "List files in a directory under the user's home folder. Args: {path: string}",
  },
  read_file: {
    risk: "low",
    description:
      "Read a plain-text file under the user's home directory (max 100 KB). Args: {path: string}",
  },
} satisfies Partial<Record<SystemCommandIdV1, SystemCommandCatalogEntry>>;

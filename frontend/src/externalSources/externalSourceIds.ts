export const EXTERNAL_SOURCE_IDS = [
  "gmail",
  "google-drive",
  "google-calendar",
  "dropbox",
  "onedrive",
  "outlook",
  "notion",
  "s3",
  "slack",
  "whatsapp",
  "icloud",
  "infomaniak",
  "infomaniak-mail",
  "infomaniak-calendar",
] as const;

export type ExternalSourceId = (typeof EXTERNAL_SOURCE_IDS)[number];

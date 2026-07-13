/**
 * Single source of truth for integration provider metadata (capabilities + copy).
 * Used by integration:listProviders; oauthConfigured is filled in ipc.js.
 */

const PROVIDER_DEFINITIONS = [
  {
    id: "google-gmail",
    displayName: "Gmail (Google)",
    capabilities: ["read", "send", "modify"],
    capabilityLabels: [
      "Read and search Gmail for briefings and questions",
      "Send email on your behalf when you ask the assistant to",
      "Organize mail — label, move, and archive messages",
      "Separate sign-in from Google Drive — use different Google accounts if you want",
    ],
    scopesSummary: "gmail.modify + gmail.send",
    clientIdEnvVar: "EXOSITES_GOOGLE_OAUTH_CLIENT_ID",
    dashboardUrl: "https://console.cloud.google.com/apis/credentials",
    dashboardLabel: "Google Cloud Console (credentials)",
  },
  {
    id: "google-drive",
    displayName: "Google Drive",
    capabilities: ["read", "files_write"],
    capabilityLabels: [
      "List and search Drive files for Workspace imports",
      "Create folders and move/organize files on your behalf",
      "Separate sign-in from Gmail — use different Google accounts if you want",
    ],
    scopesSummary: "drive (full read/write)",
    clientIdEnvVar: "EXOSITES_GOOGLE_OAUTH_CLIENT_ID",
    dashboardUrl: "https://console.cloud.google.com/apis/credentials",
    dashboardLabel: "Google Cloud Console (credentials)",
  },
  {
    id: "google-calendar",
    displayName: "Google Calendar",
    capabilities: ["read", "write"],
    capabilityLabels: [
      "Read calendar events for assistant questions (separate OAuth slot from Gmail and Drive)",
      "Create, update, and delete events on your behalf",
      "Uses the same Google Cloud OAuth client as other Google connectors",
    ],
    scopesSummary: "calendar.readonly + calendar.events",
    clientIdEnvVar: "EXOSITES_GOOGLE_OAUTH_CLIENT_ID",
    dashboardUrl: "https://console.cloud.google.com/apis/credentials",
    dashboardLabel: "Google Cloud Console (credentials)",
  },
  {
    id: "dropbox",
    displayName: "Dropbox",
    capabilities: ["read"],
    capabilityLabels: [
      "List and download Dropbox files for Workspace imports",
      "Separate sign-in — use any Dropbox account independently",
    ],
    scopesSummary: "files.content.read + files.metadata.read",
    clientIdEnvVar: "EXOSITES_DROPBOX_APP_KEY",
    dashboardUrl: "https://www.dropbox.com/developers/apps",
    dashboardLabel: "Dropbox App Console",
  },
  {
    id: "microsoft",
    displayName: "Microsoft 365",
    capabilities: ["files_write"],
    capabilityLabels: [
      "Shared OAuth slot for OneDrive (Graph sign-in on this device)",
      "Tokens stay on this device",
    ],
    scopesSummary: "Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, User.Read, offline_access (Graph)",
    clientIdEnvVar: "EXOSITES_MICROSOFT_OAUTH_CLIENT_ID",
    dashboardUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps",
    dashboardLabel: "Azure Portal (App registrations)",
    /** Not shown as a UI card — the onedrive entry is the visible Microsoft connector. */
    internal: true,
  },
  {
    id: "onedrive",
    displayName: "OneDrive",
    capabilities: ["read"],
    capabilityLabels: [
      "Recursively list and download OneDrive files for Workspace imports",
      "Create folders and move/organize files on your behalf",
      "Uses the Microsoft sign-in you set up in Azure (same app as the internal Microsoft slot)",
    ],
    scopesSummary: "Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, User.Read, offline_access (Graph)",
    clientIdEnvVar: "EXOSITES_MICROSOFT_OAUTH_CLIENT_ID",
    dashboardUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps",
    dashboardLabel: "Azure Portal (App registrations)",
  },
  {
    id: "outlook",
    displayName: "Outlook",
    capabilities: ["read", "send", "modify", "write"],
    capabilityLabels: [
      "Read and search Outlook mail; import emails as sortable text files",
      "Send email on your behalf when you ask the assistant to",
      "Organize mail — move messages between folders",
      "Create, update, and delete calendar events on your behalf",
      "Uses the same Microsoft sign-in as OneDrive — one Azure app covers both",
    ],
    scopesSummary: "Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, User.Read, offline_access (Graph)",
    clientIdEnvVar: "EXOSITES_MICROSOFT_OAUTH_CLIENT_ID",
    dashboardUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps",
    dashboardLabel: "Azure Portal (App registrations)",
  },
  {
    id: "notion",
    displayName: "Notion",
    capabilities: ["read", "write"],
    capabilityLabels: [
      "Search and read pages and databases shared with the integration",
      "Create pages and append notes on your behalf when you ask the assistant to",
      "Only content you explicitly share with the integration is visible",
    ],
    scopesSummary: "Notion public integration (pages/databases shared with it)",
    clientIdEnvVar: "EXOSITES_NOTION_CLIENT_ID",
    dashboardUrl: "https://www.notion.so/my-integrations",
    dashboardLabel: "Notion — My integrations",
  },
  {
    id: "s3",
    displayName: "Amazon S3",
    capabilities: ["read"],
    capabilityLabels: [
      "List and download objects from an S3 bucket for Workspace imports",
      "Uses IAM access key + secret (credentials stored locally, never sent to any server)",
    ],
    scopesSummary: "s3:GetObject, s3:ListBucket (IAM policy)",
    clientIdEnvVar: null,
    credentialsBased: true,
    dashboardUrl: "https://console.aws.amazon.com/iam/",
    dashboardLabel: "AWS IAM Console",
  },
  {
    id: "slack",
    displayName: "Slack",
    capabilities: ["read", "send"],
    capabilityLabels: [
      "Read channels and recent messages when you ask the assistant",
      "Search your Slack workspace for past conversations",
      "Post messages to channels on your behalf when you confirm",
      "OAuth tokens stay on this device",
    ],
    scopesSummary:
      "User scopes: channels/history, chat:write, search:read, users:read, files:read",
    clientIdEnvVar: "EXOSITES_SLACK_CLIENT_ID",
    dashboardUrl: "https://api.slack.com/apps",
    dashboardLabel: "Slack API — Your Apps",
  },
  {
    id: "whatsapp",
    displayName: "WhatsApp",
    capabilities: ["send"],
    capabilityLabels: [
      "Personal: assistant opens WhatsApp on your computer to message contacts by name",
      "Business (optional): send from your Meta WhatsApp Business number via Cloud API",
      "Cloud API credentials stay on this device — never sent to our servers",
    ],
    scopesSummary: "Meta WhatsApp Business Cloud API (phone number ID + permanent token)",
    clientIdEnvVar: null,
    credentialsBased: true,
    dashboardUrl: "https://developers.facebook.com/apps/",
    dashboardLabel: "Meta for Developers",
  },
  {
    id: "icloud",
    displayName: "iCloud Drive",
    capabilities: ["read"],
    capabilityLabels: [
      "Read files from your local iCloud Drive sync folder",
      "Requires iCloud for Windows (Windows) or macOS — no API key needed",
    ],
    scopesSummary: "Local filesystem only — no API, no credentials required",
    clientIdEnvVar: null,
    localOnly: true,
    dashboardUrl: null,
    dashboardLabel: null,
  },
  {
    id: "infomaniak",
    displayName: "Infomaniak kDrive",
    capabilities: ["read"],
    capabilityLabels: [
      "List and download kDrive files for Workspace imports",
      "Uses Infomaniak OAuth2 PKCE",
    ],
    scopesSummary: "Scopes configured in Infomaniak Manager",
    clientIdEnvVar: "EXOSITES_INFOMANIAK_CLIENT_ID",
    dashboardUrl: "https://manager.infomaniak.com/v3/ng/accounts/applications/list",
    dashboardLabel: "Infomaniak Manager — Applications",
  },
  {
    id: "infomaniak-calendar",
    displayName: "Infomaniak Calendar",
    capabilities: ["read"],
    capabilityLabels: [
      "Read calendar events for assistant questions (separate OAuth scope from kDrive)",
      "Uses Infomaniak OAuth2 PKCE",
    ],
    scopesSummary: "Scopes configured in Infomaniak Manager",
    clientIdEnvVar: "EXOSITES_INFOMANIAK_CLIENT_ID",
    dashboardUrl: "https://manager.infomaniak.com/v3/ng/accounts/applications/list",
    dashboardLabel: "Infomaniak Manager — Applications",
  },
];

function getProviderDefinitions() {
  return PROVIDER_DEFINITIONS;
}

module.exports = {
  PROVIDER_DEFINITIONS,
  getProviderDefinitions,
};

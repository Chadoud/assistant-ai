import type { ReactNode } from "react";
import GmailConnectionSection from "../components/externalSources/GmailConnectionSection";
import DriveConnectionSection from "../components/externalSources/DriveConnectionSection";
import DropboxConnectionSection from "../components/externalSources/DropboxConnectionSection";
import OneDriveConnectionSection from "../components/externalSources/OneDriveConnectionSection";
import OutlookConnectionSection from "../components/externalSources/OutlookConnectionSection";
import NotionConnectionSection from "../components/externalSources/NotionConnectionSection";
import S3ConnectionSection from "../components/externalSources/S3ConnectionSection";
import SlackConnectionSection from "../components/externalSources/SlackConnectionSection";
import WhatsAppConnectionSection from "../components/externalSources/WhatsAppConnectionSection";
import ICloudConnectionSection from "../components/externalSources/ICloudConnectionSection";
import InfomaniakConnectionSection from "../components/externalSources/InfomaniakConnectionSection";
import InfomaniakMailConnectionSection from "../components/externalSources/InfomaniakMailConnectionSection";
import GoogleCalendarConnectionSection from "../components/externalSources/GoogleCalendarConnectionSection";
import InfomaniakCalendarConnectionSection from "../components/externalSources/InfomaniakCalendarConnectionSection";
import GmailWorkspaceSortBlock from "../components/workspace/GmailWorkspaceSortBlock";
import type { GmailWorkspaceSortBlockProps } from "../components/workspace/GmailWorkspaceSortBlock";
import DriveWorkspaceSortBlock from "../components/workspace/DriveWorkspaceSortBlock";
import type { DriveWorkspaceSortBlockProps } from "../components/workspace/DriveWorkspaceSortBlock";
import DropboxWorkspaceSortBlock from "../components/workspace/DropboxWorkspaceSortBlock";
import type { DropboxWorkspaceSortBlockProps } from "../components/workspace/DropboxWorkspaceSortBlock";
import OneDriveWorkspaceSortBlock from "../components/workspace/OneDriveWorkspaceSortBlock";
import type { OneDriveWorkspaceSortBlockProps } from "../components/workspace/OneDriveWorkspaceSortBlock";
import OutlookWorkspaceSortBlock from "../components/workspace/OutlookWorkspaceSortBlock";
import type { OutlookWorkspaceSortBlockProps } from "../components/workspace/OutlookWorkspaceSortBlock";
import type { S3WorkspaceSortBlockProps } from "../components/workspace/S3WorkspaceSortBlock";
import type { SlackWorkspaceSortBlockProps } from "../components/workspace/SlackWorkspaceSortBlock";
import type { ICloudWorkspaceSortBlockProps } from "../components/workspace/ICloudWorkspaceSortBlock";
import InfomaniakWorkspaceSortBlock from "../components/workspace/InfomaniakWorkspaceSortBlock";
import type { InfomaniakWorkspaceSortBlockProps } from "../components/workspace/InfomaniakWorkspaceSortBlock";
import InfomaniakMailWorkspaceSortBlock from "../components/workspace/InfomaniakMailWorkspaceSortBlock";
import type { InfomaniakMailWorkspaceSortBlockProps } from "../components/workspace/InfomaniakMailWorkspaceSortBlock";
import type { ExternalSourceId } from "./externalSourceIds";

type ExternalSourceAccountCardProps = {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
  onOpenAssistantWithDraft?: (text: string) => void;
};

type ExternalSourceWorkspaceBlockProps = Pick<
  GmailWorkspaceSortBlockProps,
  | "settings"
  | "backendOnline"
  | "installedTesseractLangs"
  | "onGmailSortJobStarted"
  | "onGmailMergePrefsChange"
  | "onEntitlementRefresh"
  | "toastEntitlementBlocked"
  | "onOpenExternalSourcesTab"
  | "hideWorkspacePrimaryImportButton"
  | "onRegisterWorkspaceGmailMailOnlyRunner"
> &
  Pick<DriveWorkspaceSortBlockProps, "onDriveMergePrefsChange"> &
  Pick<DropboxWorkspaceSortBlockProps, "onDropboxMergePrefsChange"> &
  Pick<OneDriveWorkspaceSortBlockProps, "onOneDriveMergePrefsChange"> &
  Pick<OutlookWorkspaceSortBlockProps, "onOutlookMergePrefsChange"> &
  Pick<S3WorkspaceSortBlockProps, "onS3MergePrefsChange"> &
  Pick<SlackWorkspaceSortBlockProps, "onSlackMergePrefsChange"> &
  Pick<ICloudWorkspaceSortBlockProps, "onICloudMergePrefsChange"> &
  Pick<InfomaniakWorkspaceSortBlockProps, "onInfomaniakMergePrefsChange"> &
  Pick<InfomaniakMailWorkspaceSortBlockProps, "onInfomaniakMailMergePrefsChange">;

type ExternalSourceConnector = {
  id: ExternalSourceId;
  /** Account / OAuth card on External sources tab */
  renderAccountCard: (p: ExternalSourceAccountCardProps) => ReactNode;
  /** Optional block on Workspace (per connector) */
  renderWorkspaceBlock: ((p: ExternalSourceWorkspaceBlockProps) => ReactNode) | null;
};

export const EXTERNAL_SOURCE_CONNECTORS: ExternalSourceConnector[] = [
  {
    id: "gmail",
    renderAccountCard: (p) => (
      <GmailConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <GmailWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        installedTesseractLangs={p.installedTesseractLangs}
        onGmailSortJobStarted={p.onGmailSortJobStarted}
        onGmailMergePrefsChange={p.onGmailMergePrefsChange}
        onEntitlementRefresh={p.onEntitlementRefresh}
        toastEntitlementBlocked={p.toastEntitlementBlocked}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
        onRegisterWorkspaceGmailMailOnlyRunner={p.onRegisterWorkspaceGmailMailOnlyRunner}
      />
    ),
  },
  {
    id: "google-drive",
    renderAccountCard: (p) => (
      <DriveConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <DriveWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        onDriveMergePrefsChange={p.onDriveMergePrefsChange}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
      />
    ),
  },
  {
    id: "google-calendar",
    renderAccountCard: (p) => (
      <GoogleCalendarConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: null,
  },
  {
    id: "dropbox",
    renderAccountCard: (p) => (
      <DropboxConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <DropboxWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        onDropboxMergePrefsChange={p.onDropboxMergePrefsChange}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
      />
    ),
  },
  {
    id: "onedrive",
    renderAccountCard: (p) => (
      <OneDriveConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <OneDriveWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        onOneDriveMergePrefsChange={p.onOneDriveMergePrefsChange}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
      />
    ),
  },
  {
    id: "outlook",
    renderAccountCard: (p) => (
      <OutlookConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <OutlookWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        onOutlookMergePrefsChange={p.onOutlookMergePrefsChange}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
      />
    ),
  },
  {
    id: "notion",
    renderAccountCard: (p) => (
      <NotionConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    /** Assistant-only connector — no Workspace import block. */
    renderWorkspaceBlock: null,
  },
  {
    id: "s3",
    renderAccountCard: (p) => (
      <S3ConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: null,
  },
  {
    id: "slack",
    renderAccountCard: (p) => (
      <SlackConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: null,
  },
  {
    id: "whatsapp",
    renderAccountCard: (p) => (
      <WhatsAppConnectionSection
        backendOnline={p.backendOnline}
        brandIcon={p.brandIcon}
        compact={p.compact}
      />
    ),
    /** Personal desktop + optional Cloud API — no file import block. */
    renderWorkspaceBlock: null,
  },
  {
    id: "icloud",
    renderAccountCard: (p) => (
      <ICloudConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: null,
  },
  {
    id: "infomaniak",
    renderAccountCard: (p) => (
      <InfomaniakConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <InfomaniakWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        onInfomaniakMergePrefsChange={p.onInfomaniakMergePrefsChange}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
      />
    ),
  },
  {
    id: "infomaniak-mail",
    renderAccountCard: (p) => (
      <InfomaniakMailConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: (p) => (
      <InfomaniakMailWorkspaceSortBlock
        settings={p.settings}
        backendOnline={p.backendOnline}
        onInfomaniakMailMergePrefsChange={p.onInfomaniakMailMergePrefsChange}
        onOpenExternalSourcesTab={p.onOpenExternalSourcesTab}
        hideWorkspacePrimaryImportButton={p.hideWorkspacePrimaryImportButton}
      />
    ),
  },
  {
    id: "infomaniak-calendar",
    renderAccountCard: (p) => (
      <InfomaniakCalendarConnectionSection backendOnline={p.backendOnline} brandIcon={p.brandIcon} compact={p.compact} />
    ),
    renderWorkspaceBlock: null,
  },
];

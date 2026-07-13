import { useI18n } from "../../i18n/I18nContext";
import WorkspaceConnectorDropdownPicker, {
  WorkspaceConnectorPickerCheckboxRow,
  WorkspaceConnectorPickerGroupLabel,
} from "./WorkspaceConnectorDropdownPicker";

export type WorkspaceMailFolder = "Inbox" | "SentItems" | "AllMessages";

const FOLDER_OPTIONS: readonly { value: WorkspaceMailFolder; labelKey: `queue.${string}` }[] = [
  { value: "Inbox", labelKey: "queue.outlookFolderInbox" },
  { value: "SentItems", labelKey: "queue.outlookFolderSent" },
  { value: "AllMessages", labelKey: "queue.outlookFolderAll" },
];

interface WorkspaceMailFolderPickerProps {
  id?: string;
  value: WorkspaceMailFolder;
  onChange: (next: WorkspaceMailFolder) => void;
  disabled?: boolean;
}

/** Mail folder scope picker — same dropdown UI as Gmail categories. */
export default function WorkspaceMailFolderPicker({
  id,
  value,
  onChange,
  disabled = false,
}: WorkspaceMailFolderPickerProps) {
  const { t } = useI18n();
  const summary =
    FOLDER_OPTIONS.find((option) => option.value === value)?.labelKey != null
      ? t(FOLDER_OPTIONS.find((option) => option.value === value)!.labelKey)
      : t("queue.outlookFolderInbox");

  return (
    <WorkspaceConnectorDropdownPicker summary={summary} disabled={disabled} id={id}>
      <WorkspaceConnectorPickerGroupLabel>{t("queue.gmailPickerGroupFolders")}</WorkspaceConnectorPickerGroupLabel>
      {FOLDER_OPTIONS.map((option) => (
        <WorkspaceConnectorPickerCheckboxRow
          key={option.value}
          checked={value === option.value}
          onChange={(checked) => {
            if (checked) onChange(option.value);
          }}
        >
          {t(option.labelKey)}
        </WorkspaceConnectorPickerCheckboxRow>
      ))}
    </WorkspaceConnectorDropdownPicker>
  );
}

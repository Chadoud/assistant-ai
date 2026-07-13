import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GmailImportContent } from "../../api/gmail";
import { useI18n } from "../../i18n/I18nContext";
import { WORKSPACE_CONNECTOR_CONTROL_CLASS, WORKSPACE_CONNECTOR_SELECT_CLASS } from "../../utils/styles";
import { WorkspaceConnectorFieldColumn, WorkspaceConnectorFormGrid } from "./WorkspaceConnectorFormGrid";
import WorkspaceConnectorDropdownPicker, {
  WorkspaceConnectorPickerCheckboxRow,
  WorkspaceConnectorPickerGroupLabel,
} from "./WorkspaceConnectorDropdownPicker";
import { GMAIL_EXPORT_MAX_MESSAGES } from "../../constants";
import {
  buildGmailQueryFromSelection,
  GMAIL_SELECTION_ALL_INBOX,
  GMAIL_SELECTION_ALL_MAIL,
  GMAIL_TAB_CATEGORY_QUERIES,
  type GmailTabCategoryQuery,
  parseGmailQueryToSelectionIds,
} from "../../utils/gmailSearchCategories";

const GMAIL_IMPORT_OPTIONS: readonly { value: GmailImportContent; labelKey: `queue.${string}` }[] = [
  { value: "text", labelKey: "queue.gmailImportContentText" },
  { value: "attachments", labelKey: "queue.gmailImportContentAttachments" },
  { value: "both", labelKey: "queue.gmailImportContentBoth" },
];

const GMAIL_MAX_PRESETS = [25, 50, 100, 250, 500, 1000, 2500] as const;

function maxMessagesSelectToken(n: number, allValue: number): string {
  if (n === allValue) return "all";
  if ((GMAIL_MAX_PRESETS as readonly number[]).includes(n)) return String(n);
  return "custom";
}

const TAB_LABEL_KEYS: Record<GmailTabCategoryQuery, `queue.${string}`> = {
  "category:primary": "queue.gmailCategoryPrimary",
  "category:social": "queue.gmailCategorySocial",
  "category:promotions": "queue.gmailCategoryPromotions",
  "category:updates": "queue.gmailCategoryUpdates",
  "category:forums": "queue.gmailCategoryForums",
};

interface GmailCategoryMaxRowProps {
  query: string;
  onQueryChange: (next: string) => void;
  maxMessages: number;
  onMaxMessagesChange: (next: number) => void;
  /** Effective server cap — “All” sends this (from ``/gmail/status`` or recovered after a 422). */
  importMaxCap?: number;
  importContent: GmailImportContent;
  onImportContentChange: (next: GmailImportContent) => void;
  disabled?: boolean;
}

function selectionSummary(selection: ReadonlySet<string>, t: (k: string) => string): string {
  if (selection.has(GMAIL_SELECTION_ALL_MAIL)) {
    return t("queue.gmailCategoryAllMail");
  }
  const hasAll = selection.has(GMAIL_SELECTION_ALL_INBOX);
  const tabs = GMAIL_TAB_CATEGORY_QUERIES.filter((c) => selection.has(c));

  const folderParts: string[] = [];
  if (hasAll) folderParts.push(t("queue.gmailCategoryAllInbox"));
  else if (tabs.length > 0) folderParts.push(...tabs.map((c) => t(TAB_LABEL_KEYS[c])));

  if (folderParts.length === 0) return t("queue.gmailCategoryPickerPlaceholder");
  return folderParts.join(" · ");
}

/**
 * Gmail search scope, message cap, and what to import — labels on one row and controls on the next from `sm` up.
 */
export default function GmailCategoryMaxRow({
  query,
  onQueryChange,
  maxMessages,
  onMaxMessagesChange,
  importMaxCap = GMAIL_EXPORT_MAX_MESSAGES,
  importContent,
  onImportContentChange,
  disabled = false,
}: GmailCategoryMaxRowProps) {
  const { t } = useI18n();
  const messageAllValue = Math.min(GMAIL_EXPORT_MAX_MESSAGES, Math.max(1, importMaxCap));
  const maxMessagesSelectId = useId();
  const maxMessagesCustomInputId = useId();
  const importContentFieldId = useId();
  /** Lets the user pick “Custom…” while the count still matches a preset (e.g. 50). */
  const [maxCustomUiLock, setMaxCustomUiLock] = useState(false);
  const prevMaxMessagesRef = useRef(maxMessages);

  const selection = useMemo(() => parseGmailQueryToSelectionIds(query), [query]);
  const hasAllMail = selection.has(GMAIL_SELECTION_ALL_MAIL);
  const hasAll = selection.has(GMAIL_SELECTION_ALL_INBOX);

  const commit = (next: Set<string>) => {
    onQueryChange(buildGmailQueryFromSelection(next));
  };

  const toggleAllMail = (checked: boolean) => {
    if (checked) {
      commit(new Set([GMAIL_SELECTION_ALL_MAIL]));
    } else {
      commit(new Set([GMAIL_SELECTION_ALL_INBOX]));
    }
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      commit(new Set([GMAIL_SELECTION_ALL_INBOX]));
    } else {
      commit(new Set(["category:primary"]));
    }
  };

  const toggleTab = (tab: GmailTabCategoryQuery, checked: boolean) => {
    const n = new Set(selection);
    n.delete(GMAIL_SELECTION_ALL_MAIL);
    n.delete(GMAIL_SELECTION_ALL_INBOX);
    if (checked) n.add(tab);
    else n.delete(tab);
    const tabsLeft = GMAIL_TAB_CATEGORY_QUERIES.filter((c) => n.has(c));
    if (tabsLeft.length === 0) {
      n.add(GMAIL_SELECTION_ALL_INBOX);
    }
    commit(n);
  };

  const summary = selectionSummary(selection, t);
  const naturalMaxToken = maxMessagesSelectToken(maxMessages, messageAllValue);
  const maxMessagesSelectValue =
    naturalMaxToken === "custom" || maxCustomUiLock ? "custom" : naturalMaxToken;

  useEffect(() => {
    if (prevMaxMessagesRef.current === maxMessages) return;
    prevMaxMessagesRef.current = maxMessages;
    if (maxMessagesSelectToken(maxMessages, messageAllValue) !== "custom") setMaxCustomUiLock(false);
  }, [maxMessages, messageAllValue]);

  return (
    <WorkspaceConnectorFormGrid>
      <WorkspaceConnectorFieldColumn
        column={1}
        label={t("queue.gmailCategoryLabel")}
        controlWrapperClassName="relative"
      >
        <WorkspaceConnectorDropdownPicker summary={summary} disabled={disabled}>
          <WorkspaceConnectorPickerGroupLabel>{t("queue.gmailPickerGroupFolders")}</WorkspaceConnectorPickerGroupLabel>
          <WorkspaceConnectorPickerCheckboxRow checked={hasAllMail} onChange={toggleAllMail}>
            {t("queue.gmailCategoryAllMail")}
          </WorkspaceConnectorPickerCheckboxRow>
          <WorkspaceConnectorPickerCheckboxRow
            checked={hasAll && !hasAllMail}
            disabled={hasAllMail}
            onChange={toggleAll}
          >
            {t("queue.gmailCategoryAllInbox")}
          </WorkspaceConnectorPickerCheckboxRow>
          {GMAIL_TAB_CATEGORY_QUERIES.map((tab) => (
            <WorkspaceConnectorPickerCheckboxRow
              key={tab}
              indent
              checked={!hasAll && !hasAllMail && selection.has(tab)}
              disabled={hasAll || hasAllMail}
              onChange={(checked) => toggleTab(tab, checked)}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </WorkspaceConnectorPickerCheckboxRow>
          ))}
        </WorkspaceConnectorDropdownPicker>
      </WorkspaceConnectorFieldColumn>

      <WorkspaceConnectorFieldColumn column={2} label={t("queue.gmailMaxMessages")} htmlFor={maxMessagesSelectId}>
        <select
          id={maxMessagesSelectId}
          value={maxMessagesSelectValue}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "all") {
              setMaxCustomUiLock(false);
              onMaxMessagesChange(messageAllValue);
            } else if (v === "custom") {
              setMaxCustomUiLock(true);
            } else {
              setMaxCustomUiLock(false);
              onMaxMessagesChange(Number(v));
            }
          }}
          className={WORKSPACE_CONNECTOR_SELECT_CLASS}
        >
          {GMAIL_MAX_PRESETS.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
          <option value="all">{t("queue.gmailMaxMessagesAll")}</option>
          <option value="custom">{t("queue.gmailMaxMessagesCustom")}</option>
        </select>
        {maxMessagesSelectValue === "custom" && (
          <input
            id={maxMessagesCustomInputId}
            type="number"
            min={1}
            max={messageAllValue}
            aria-label={t("queue.gmailMaxMessagesCustomAria")}
            className={WORKSPACE_CONNECTOR_CONTROL_CLASS}
            value={maxMessages}
            disabled={disabled}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const next = Number.isFinite(raw)
                ? Math.min(messageAllValue, Math.max(1, Math.round(raw)))
                : 1;
              onMaxMessagesChange(next);
            }}
          />
        )}
      </WorkspaceConnectorFieldColumn>

      <WorkspaceConnectorFieldColumn
        column={3}
        label={t("queue.gmailImportContentLabel")}
        htmlFor={importContentFieldId}
        controlStackClassName="space-y-1"
      >
        <select
          id={importContentFieldId}
          value={importContent}
          disabled={disabled}
          onChange={(e) => onImportContentChange(e.target.value as GmailImportContent)}
          className={WORKSPACE_CONNECTOR_SELECT_CLASS}
        >
          {GMAIL_IMPORT_OPTIONS.map(({ value, labelKey }) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </WorkspaceConnectorFieldColumn>
    </WorkspaceConnectorFormGrid>
  );
}

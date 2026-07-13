import { useMemo } from "react";
import { useI18n } from "../../i18n/I18nContext";
import {
  WORKSPACE_FILE_TYPE_CATEGORY_ORDER,
  defaultWorkspaceFileTypeCategories,
  type WorkspaceFileTypeCategory,
} from "./workspaceFileTypeCategories";
import WorkspaceConnectorDropdownPicker, {
  WorkspaceConnectorPickerCheckboxRow,
  WorkspaceConnectorPickerGroupLabel,
} from "./WorkspaceConnectorDropdownPicker";

const CATEGORY_LABEL_KEY: Record<WorkspaceFileTypeCategory, string> = {
  pdf: "queue.driveFilterTypePdf",
  images: "queue.driveFilterTypeImages",
  documents: "queue.driveFilterTypeDocuments",
  spreadsheets: "queue.driveFilterTypeSpreadsheets",
  other: "queue.driveFilterTypeOther",
};

function typeSelectionSummary(
  selected: ReadonlySet<WorkspaceFileTypeCategory>,
  t: (key: string) => string
): string {
  const allSelected =
    WORKSPACE_FILE_TYPE_CATEGORY_ORDER.length > 0 &&
    WORKSPACE_FILE_TYPE_CATEGORY_ORDER.every((category) => selected.has(category));
  if (allSelected) return t("queue.driveFilterTypeAll");
  if (selected.size === 0) return t("queue.driveFilterTypePlaceholder");
  return WORKSPACE_FILE_TYPE_CATEGORY_ORDER.filter((category) => selected.has(category))
    .map((category) => t(CATEGORY_LABEL_KEY[category]))
    .join(" · ");
}

interface WorkspaceConnectorTypeCheckboxesProps {
  id?: string;
  value: WorkspaceFileTypeCategory[];
  onChange: (next: WorkspaceFileTypeCategory[]) => void;
  disabled?: boolean;
}

/**
 * Multi-select file-type filter in the same dropdown UI as Gmail folder scope.
 */
export default function WorkspaceConnectorTypeCheckboxes({
  id,
  value,
  onChange,
  disabled = false,
}: WorkspaceConnectorTypeCheckboxesProps) {
  const { t } = useI18n();
  const selected = useMemo(() => new Set(value), [value]);
  const allSelected =
    WORKSPACE_FILE_TYPE_CATEGORY_ORDER.length > 0 &&
    WORKSPACE_FILE_TYPE_CATEGORY_ORDER.every((category) => selected.has(category));

  const syncFromSet = (next: Set<WorkspaceFileTypeCategory>) => {
    onChange(WORKSPACE_FILE_TYPE_CATEGORY_ORDER.filter((category) => next.has(category)));
  };

  const toggleAll = (checked: boolean) => {
    if (disabled) return;
    if (checked) {
      onChange(defaultWorkspaceFileTypeCategories());
    } else {
      onChange([]);
    }
  };

  const toggleCategory = (category: WorkspaceFileTypeCategory, checked: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    if (checked) next.add(category);
    else next.delete(category);
    syncFromSet(next);
  };

  const summary = typeSelectionSummary(selected, t);

  return (
    <WorkspaceConnectorDropdownPicker summary={summary} disabled={disabled} id={id}>
      <WorkspaceConnectorPickerGroupLabel>{t("queue.drivePickerGroupTypes")}</WorkspaceConnectorPickerGroupLabel>
      <WorkspaceConnectorPickerCheckboxRow checked={allSelected} onChange={toggleAll}>
        {t("queue.driveFilterTypeAll")}
      </WorkspaceConnectorPickerCheckboxRow>
      {WORKSPACE_FILE_TYPE_CATEGORY_ORDER.map((category) => (
        <WorkspaceConnectorPickerCheckboxRow
          key={category}
          indent
          checked={selected.has(category)}
          disabled={allSelected}
          onChange={(checked) => toggleCategory(category, checked)}
        >
          {t(CATEGORY_LABEL_KEY[category])}
        </WorkspaceConnectorPickerCheckboxRow>
      ))}
    </WorkspaceConnectorDropdownPicker>
  );
}

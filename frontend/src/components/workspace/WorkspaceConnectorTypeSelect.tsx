import WorkspaceConnectorTypeCheckboxes from "./WorkspaceConnectorTypeCheckboxes";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

interface WorkspaceConnectorTypeSelectProps {
  id?: string;
  value: WorkspaceFileTypeCategory[];
  onChange: (next: WorkspaceFileTypeCategory[]) => void;
  disabled?: boolean;
}

/** @deprecated Use {@link WorkspaceConnectorTypeCheckboxes} — kept for call-site compatibility. */
export default function WorkspaceConnectorTypeSelect(props: WorkspaceConnectorTypeSelectProps) {
  return <WorkspaceConnectorTypeCheckboxes {...props} />;
}

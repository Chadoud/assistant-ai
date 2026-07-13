import { createContext, useContext, type ReactNode } from "react";
import {
  SECTION_LABEL_CLASS,
  WORKSPACE_CONNECTOR_FORM_GRID_CLASS,
  WORKSPACE_CONNECTOR_FORM_STACK_CLASS,
} from "../../utils/styles";

const COL_LABEL: Record<1 | 2 | 3, string> = {
  1: "sm:col-start-1 sm:row-start-1",
  2: "sm:col-start-2 sm:row-start-1",
  3: "sm:col-start-3 sm:row-start-1",
};

const COL_CONTROL: Record<1 | 2 | 3, string> = {
  1: "sm:col-start-1 sm:row-start-2",
  2: "sm:col-start-2 sm:row-start-2",
  3: "sm:col-start-3 sm:row-start-2",
};

type WorkspaceConnectorFormLayout = "threeColumn" | "stack";

const FormLayoutContext = createContext<WorkspaceConnectorFormLayout>("threeColumn");

interface WorkspaceConnectorFormGridProps {
  children: ReactNode;
  /** Appended to the grid (e.g. `pt-0` to align inside a padded subsection). */
  className?: string;
  /**
   * `threeColumn`: labels on row 1, controls on row 2 from `sm+` (Gmail / Drive / Dropbox).
   * `stack`: one field per row, label above control (narrow panels e.g. OneDrive workspace).
   */
  layout?: WorkspaceConnectorFormLayout;
}

/**
 * Shared container for workspace connector fields; pairs with {@link WorkspaceConnectorFieldColumn}.
 */
export function WorkspaceConnectorFormGrid({
  children,
  className = "",
  layout = "threeColumn",
}: WorkspaceConnectorFormGridProps) {
  const shell =
    layout === "stack"
      ? `${WORKSPACE_CONNECTOR_FORM_STACK_CLASS} ${className}`.trim()
      : `${WORKSPACE_CONNECTOR_FORM_GRID_CLASS} ${className}`.trim();
  return (
    <FormLayoutContext.Provider value={layout}>
      <div className={shell}>{children}</div>
    </FormLayoutContext.Provider>
  );
}

interface WorkspaceConnectorFieldColumnProps {
  /** Grid column (ignored when parent uses `layout="stack"`). Defaults to 1. */
  column?: 1 | 2 | 3;
  label: ReactNode;
  children: ReactNode;
  /** When set, the heading is a `<label>` (for native control focus), otherwise a `<span>`. */
  htmlFor?: string;
  /** Extra classes on the control cell (e.g. `relative` for anchored popovers). */
  controlWrapperClassName?: string;
  extraLabelClassName?: string;
  /** Vertical spacing between stacked controls in the cell (default matches most fields). */
  controlStackClassName?: string;
}

/**
 * One logical field: either a grid cell in the three-column layout, or a stacked block when the parent grid uses `layout="stack"`.
 */
export function WorkspaceConnectorFieldColumn({
  column = 1,
  label,
  children,
  htmlFor,
  controlWrapperClassName = "",
  extraLabelClassName = "",
  controlStackClassName = "space-y-1.5",
}: WorkspaceConnectorFieldColumnProps) {
  const layout = useContext(FormLayoutContext);
  const labelClassBase = `${SECTION_LABEL_CLASS} text-2xs min-w-0 ${extraLabelClassName}`.trim();

  if (layout === "stack") {
    const labelClass = `${labelClassBase} block`;
    return (
      <div className="min-w-0 flex flex-col gap-1.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={labelClass}>
            {label}
          </label>
        ) : (
          <span className={labelClass}>{label}</span>
        )}
        <div
          className={`min-w-0 ${controlStackClassName} ${controlWrapperClassName}`.trim()}
        >
          {children}
        </div>
      </div>
    );
  }

  const labelClass = `${labelClassBase} ${COL_LABEL[column]}`.trim();
  return (
    <>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      <div
        className={`min-w-0 ${COL_CONTROL[column]} ${controlStackClassName} ${controlWrapperClassName}`.trim()}
      >
        {children}
      </div>
    </>
  );
}

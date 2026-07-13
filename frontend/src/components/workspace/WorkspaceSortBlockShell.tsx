import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { WORKSPACE_SORT_BLOCK_SECTION_CLASS } from "../../utils/styles";

type WorkspaceSortBlockShellProps = Omit<ComponentPropsWithoutRef<"section">, "className"> & {
  className?: string;
  children: ReactNode;
};

/**
 * Shared outer section for workspace “sort from cloud” blocks — same layout and scroll margin everywhere.
 */
export function WorkspaceSortBlockShell({
  className = "",
  children,
  ...rest
}: WorkspaceSortBlockShellProps) {
  const merged = [WORKSPACE_SORT_BLOCK_SECTION_CLASS, className].filter(Boolean).join(" ");
  return (
    <section {...rest} className={merged}>
      {children}
    </section>
  );
}

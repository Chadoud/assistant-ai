import type { ReactNode } from "react";

type AppLayoutProps = {
  /**
   * Primary UI: optional cloud gate / offline strip, then title bar + sidebar + tab panel.
   * Keep this subtree free of full-screen overlays so z-index stays predictable.
   */
  workspace: ReactNode;
  /** Modals, onboarding, tour, banners — same horizontal band as workspace, typically fixed/full-screen. */
  workspaceOverlays: ReactNode;
};

/**
 * Root shell for the main window: column layout with a dedicated overlay layer beside the workspace.
 */
export default function AppLayout({ workspace, workspaceOverlays }: AppLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {workspace}
        {workspaceOverlays}
      </div>
    </div>
  );
}

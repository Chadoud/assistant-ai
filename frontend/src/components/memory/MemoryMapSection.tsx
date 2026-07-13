import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import PanelCard from "../ui/PanelCard";
import ListSkeleton from "../ui/ListSkeleton";
import { MAC_TRAFFIC_SAFE_PL_CLASS } from "../../utils/styles";

const BrainMap3D = lazy(() => import("../brainMap/BrainMap3D"));

interface Props {
  backendOnline: boolean;
  onOpenConversation?: () => void;
  onOpenTodo?: () => void;
  onHighlightMemory?: (memoryId: number) => void;
}

function FullScreenMap({
  onClose,
  backendOnline,
  onOpenConversation,
  onOpenTodo,
  onHighlightMemory,
}: {
  onClose: () => void;
  backendOnline: boolean;
  onOpenConversation?: () => void;
  onOpenTodo?: () => void;
  onHighlightMemory?: (memoryId: number) => void;
}) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary">
      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-b border-border py-3 pr-4 ${MAC_TRAFFIC_SAFE_PL_CLASS}`}
      >
        <h3 className="text-sm font-semibold text-text-primary">{t("memories.brainMapHeading")}</h3>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("memories.searchPlaceholder")}
            className="min-w-0 max-w-xs flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            {t("brainMap.closeAria")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<ListSkeleton rows={3} className="p-4" />}>
          <BrainMap3D
            backendOnline={backendOnline}
            onOpenConversation={onOpenConversation}
            onOpenTodo={onOpenTodo}
            onHighlightMemory={onHighlightMemory}
            searchQuery={searchQuery}
            className="relative h-full min-h-[20rem] overflow-hidden rounded-none border-0 bg-gradient-to-b from-bg-secondary/70 to-bg-secondary/30"
          />
        </Suspense>
      </div>
    </div>,
    document.body,
  );
}

export default function MemoryMapSection({
  backendOnline,
  onOpenConversation,
  onOpenTodo,
  onHighlightMemory,
}: Props) {
  const { t } = useI18n();
  const [fullScreen, setFullScreen] = useState(false);

  if (!backendOnline) {
    return <p className="text-sm text-muted">{t("brainMap.backendOffline")}</p>;
  }

  return (
    <>
      <PanelCard padding="sm" className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-sm text-muted">{t("memories.mapPreviewDesc")}</p>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted">{t("memories.brainMapLoading")}</p>
              </div>
            }
          >
            <BrainMap3D
              backendOnline={backendOnline}
              onOpenConversation={onOpenConversation}
              onOpenTodo={onOpenTodo}
              onHighlightMemory={onHighlightMemory}
              className="relative h-full min-h-0 overflow-hidden rounded-none border-0 bg-gradient-to-b from-bg-secondary/70 to-bg-secondary/30"
            />
          </Suspense>
        </div>
        <button
          type="button"
          onClick={() => setFullScreen(true)}
          className="w-full shrink-0 rounded-lg border border-border bg-bg-secondary py-2 text-sm font-medium text-text-primary hover:bg-bg-primary"
        >
          {t("memories.openFullMap")}
        </button>
      </PanelCard>
      {fullScreen ? (
        <FullScreenMap
          onClose={() => setFullScreen(false)}
          backendOnline={backendOnline}
          onOpenConversation={onOpenConversation}
          onOpenTodo={onOpenTodo}
          onHighlightMemory={onHighlightMemory}
        />
      ) : null}
    </>
  );
}

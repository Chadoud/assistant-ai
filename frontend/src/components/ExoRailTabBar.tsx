import { useI18n } from "../i18n/I18nContext";
import { type AssistantRailTab } from "../features/codegen/codegenStore";

interface ExoRailTabBarProps {
  activeTab: AssistantRailTab;
  onSelect: (tab: AssistantRailTab) => void;
}

/** Chat | Preview tabs for the assistant side rail. */
export default function ExoRailTabBar({ activeTab, onSelect }: ExoRailTabBarProps) {
  const { t } = useI18n();
  const tabs: { id: AssistantRailTab; label: string }[] = [
    { id: "chat", label: t("assistant.codegen.tabChat") },
    { id: "preview", label: t("assistant.codegen.tabPreview") },
  ];
  return (
    <div className="flex shrink-0 border-b border-border bg-bg-secondary/60" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === tab.id
              ? "border-b-2 border-accent text-text-primary"
              : "text-muted hover:text-text-primary"
          }`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

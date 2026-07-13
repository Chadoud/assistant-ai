/**
 * Floating slash-command palette shown when the chat input starts with "/".
 * Keyboard navigation is handled by the parent (AssistantChatPanel).
 */

import { useI18n } from "../i18n/I18nContext";

interface SlashCommand {
  id: string;
  icon: string;
  labelKey: string;
  fillKey: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "today",     icon: "📅", labelKey: "assistant.slashToday",      fillKey: "assistant.suggestion1" },
  { id: "tomorrow",  icon: "🌅", labelKey: "assistant.slashTomorrow",   fillKey: "assistant.slashTomorrowFill" },
  { id: "week",      icon: "🗓️", labelKey: "assistant.slashWeek",       fillKey: "assistant.suggestion3" },
  { id: "email",     icon: "✉️", labelKey: "assistant.slashEmail",      fillKey: "assistant.suggestion2" },
  { id: "invoices",  icon: "🧾", labelKey: "assistant.slashInvoices",   fillKey: "assistant.slashInvoicesFill" },
  { id: "payments",  icon: "💳", labelKey: "assistant.slashPayments",   fillKey: "assistant.slashPaymentsFill" },
  { id: "contracts", icon: "📝", labelKey: "assistant.slashContracts",  fillKey: "assistant.slashContractsFill" },
  { id: "sort",      icon: "🗂️", labelKey: "assistant.slashSort",       fillKey: "assistant.slashSortFill" },
  { id: "help",      icon: "❓", labelKey: "assistant.slashHelp",       fillKey: "assistant.slashHelpFill" },
];

interface SlashCommandPaletteProps {
  filter: string;
  onSelect: (fill: string) => void;
  selectedIndex: number;
}

export default function SlashCommandPalette({ filter, onSelect, selectedIndex }: SlashCommandPaletteProps) {
  const { t } = useI18n();
  const visible = SLASH_COMMANDS.filter(
    (cmd) => filter === "/" || cmd.id.startsWith(filter.slice(1).toLowerCase())
  );
  if (visible.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 rounded-xl border border-border bg-bg-primary shadow-lg overflow-hidden z-20">
      {visible.map((cmd, i) => (
        <button
          key={cmd.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(t(cmd.fillKey));
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors ${
            i === selectedIndex
              ? "bg-hover-overlay text-text-primary"
              : "text-text-secondary hover:bg-hover-overlay"
          }`}
        >
          <span className="text-sm">{cmd.icon}</span>
          <span className="font-medium text-text-primary">{t(cmd.labelKey)}</span>
          <span className="ml-auto text-muted">{t(cmd.fillKey)}</span>
        </button>
      ))}
    </div>
  );
}

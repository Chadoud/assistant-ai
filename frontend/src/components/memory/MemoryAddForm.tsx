import { useState } from "react";
import type { MemoryCategory } from "../../api/memory";
import { MEMORY_CATEGORIES } from "../../api/memory";
import { useI18n } from "../../i18n/I18nContext";
import { memoryKeyFromText } from "../../utils/memoryUi";

interface Props {
  onSave: (payload: { category: MemoryCategory; key: string; value: string }) => void;
  onCancel: () => void;
}

export default function MemoryAddForm({ onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [category, setCategory] = useState<MemoryCategory>("notes");
  const [key, setKey] = useState("");

  const handleSubmit = () => {
    const value = text.trim();
    if (!value) return;
    onSave({
      category,
      key: key.trim() || memoryKeyFromText(value),
      value,
    });
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-bg-secondary p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("memories.addNotePlaceholder")}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="text-xs text-muted hover:text-text-primary"
      >
        {t("memories.addNoteAdvanced")}
      </button>
      {advanced ? (
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
            className="rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`memories.categories.${c}`)}
              </option>
            ))}
          </select>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("memories.labelPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-sm text-text-primary placeholder:text-muted"
          />
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text-primary"
        >
          {t("memories.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-lg bg-button-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-button-hover"
        >
          {t("memories.save")}
        </button>
      </div>
    </div>
  );
}

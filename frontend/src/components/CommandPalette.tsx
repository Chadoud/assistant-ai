import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { APP_DISPLAY_NAME } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { modShortcutLabel } from "../utils/platform";

export interface CommandItem {
  id: string;
  label: string;
  keywords: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(s) ||
        c.keywords.toLowerCase().includes(s) ||
        c.id.includes(s)
    );
  }, [commands, q]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    if (open) {
      setQ("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runIndex = (i: number) => {
    const c = filtered[i];
    if (c) {
      c.run();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[450] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-label={t("commandPalette.ariaLabel")}
    >
      <button
        type="button"
        className="absolute inset-0 bg-overlay-scrim"
        aria-label={t("commandPalette.closeOverlay")}
        onClick={onClose}
      />
      <div
        data-testid="command-palette"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-bg-card shadow-accent-glow overflow-hidden"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-border bg-bg-secondary flex items-center gap-2">
          <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runIndex(active);
              }
            }}
            placeholder={t("commandPalette.searchPlaceholder", { appName: APP_DISPLAY_NAME })}
            className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-muted focus:outline-none py-1.5"
          />
          <kbd className="hidden sm:inline text-2xs text-muted px-1.5 py-0.5 rounded border border-border">Esc</kbd>
        </div>
        <ul className="max-h-[min(50vh,360px)] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted text-center">{t("commandPalette.noResults")}</li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => runIndex(i)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors
                    ${i === active ? "bg-accent-light text-accent" : "text-text-primary hover:bg-hover-overlay"}`}
                >
                  <span>{c.label}</span>
                  {c.shortcut && (
                    <kbd className="text-2xs text-muted font-mono shrink-0">{c.shortcut}</kbd>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="px-4 py-2 text-3xs text-muted border-t border-border bg-bg-secondary">
          {t("commandPalette.footerHint", { modifier: modShortcutLabel() })}
        </p>
      </div>
    </div>
  );
}

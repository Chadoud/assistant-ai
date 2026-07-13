interface ExternalSourceHelpButtonProps {
  label: string;
  onClick: () => void;
}

/** Minimal “?” control for connector setup guides (Infomaniak, WhatsApp Business, etc.). */
export default function ExternalSourceHelpButton({ label, onClick }: ExternalSourceHelpButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="shrink-0 flex items-center justify-center size-7 rounded-full border border-border text-muted hover:bg-hover-overlay hover:text-text-primary transition-colors text-xs font-bold"
      dir="ltr"
    >
      ?
    </button>
  );
}

import { SECTION_CHEVRON_CLASS, SECTION_TITLE_CLASS } from "../../utils/styles";

interface SectionHeaderProps {
  id: string;
  label: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function SectionHeader({ id, label, collapsed, onToggle }: SectionHeaderProps) {
  return (
    <div id={id} className="scroll-mt-24">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-2 mb-3 group"
      >
        <h2 className={SECTION_TITLE_CLASS}>{label}</h2>
        <svg
          className={`${SECTION_CHEVRON_CLASS} ${collapsed ? "-rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </div>
  );
}

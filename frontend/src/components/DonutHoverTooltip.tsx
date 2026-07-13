/** Floating segment beside the pointer — layout matches swissAligner ERP Overview donut tooltip. */

interface DonutHoverTooltipProps {
  /** Position relative to the donut wrap box. */
  x: number;
  y: number;
  wrapWidth: number;
  value: number;
  /** Segment title (reason, folder name, …). */
  label: string;
  valueSuffix?: string;
  /** Short ERP-style labels use uppercase; long text stays sentence case. */
  labelUppercase?: boolean;
}

export default function DonutHoverTooltip({
  x,
  y,
  wrapWidth,
  value,
  label,
  valueSuffix,
  labelUppercase = false,
}: DonutHoverTooltipProps) {
  const flip = x >= wrapWidth / 2;

  return (
    <div
      className="absolute z-20 pointer-events-none flex flex-col items-center gap-0 rounded-md border border-border bg-bg-card px-3 py-2 shadow-md dark:shadow-black/40"
      style={{
        left: flip ? x - 12 : x + 12,
        top: y,
        transform: flip ? "translate(-100%, -50%)" : "translateY(-50%)",
      }}
      role="status"
      aria-live="polite"
    >
      <span className="text-base font-semibold tabular-nums text-text-primary whitespace-nowrap">
        {value}
        {valueSuffix ? (
          <span className="text-xs font-medium text-muted ml-1 normal-case">{valueSuffix}</span>
        ) : null}
      </span>
      <span
        className={`block text-xs font-normal text-muted max-w-[14rem] text-center leading-snug line-clamp-3 mt-0.5 ${
          labelUppercase ? "uppercase tracking-[0.04em]" : ""
        }`.trim()}
        title={label}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Renders deterministic assistant calendar output with per-service branding
 * (see `renderCalendarContext` — section headers are provider titles only).
 */

import { stripAssistantMarkdownBold } from "./AssistantMailRecapContent";
import { chatBrandAssetUrl } from "../brands/chatBrandAssetUrl";

type CalendarContextBlock =
  | { kind: "preamble"; text: string }
  | { kind: "provider"; label: string; logoSrc: string; body: string };

function calendarProviderFromHeaderLine(trimmedLine: string): { label: string; logoSrc: string } | null {
  const normalized = stripAssistantMarkdownBold(trimmedLine).replace(/:$/, "").trim();
  switch (normalized) {
    case "Outlook Calendar":
      return { label: "Outlook Calendar", logoSrc: chatBrandAssetUrl("outlook.png") };
    case "Google Calendar":
      return { label: "Google Calendar", logoSrc: chatBrandAssetUrl("google-calendar.png") };
    case "Infomaniak Calendar":
      return { label: "Infomaniak Calendar", logoSrc: chatBrandAssetUrl("infomaniak-calendar.png") };
    default:
      return null;
  }
}

/**
 * Split calendar context text into preamble and per-provider sections.
 */
function parseCalendarContextBlocks(text: string): CalendarContextBlock[] {
  const stripped = stripAssistantMarkdownBold(text);
  const lines = stripped.split(/\r?\n/);
  const blocks: CalendarContextBlock[] = [];
  const preamble: string[] = [];
  let current: { label: string; logoSrc: string; bodyLines: string[] } | null = null;

  const flushPreamble = () => {
    const joined = preamble.join("\n").trimEnd();
    if (joined.length > 0) {
      blocks.push({ kind: "preamble", text: joined });
    }
    preamble.length = 0;
  };

  const flushCurrent = () => {
    if (current) {
      blocks.push({
        kind: "provider",
        label: current.label,
        logoSrc: current.logoSrc,
        body: current.bodyLines.join("\n").trimEnd(),
      });
      current = null;
    }
  };

  for (const rawLine of lines) {
    const provider = calendarProviderFromHeaderLine(rawLine.trim());
    if (provider) {
      flushPreamble();
      flushCurrent();
      current = {
        label: provider.label,
        logoSrc: provider.logoSrc,
        bodyLines: [],
      };
      continue;
    }
    if (current) {
      current.bodyLines.push(rawLine);
    } else {
      preamble.push(rawLine);
    }
  }

  flushPreamble();
  flushCurrent();

  if (blocks.length === 0 && stripped.trim().length > 0) {
    blocks.push({ kind: "preamble", text: stripped.trimEnd() });
  }

  return blocks;
}

interface AssistantCalendarContextContentProps {
  text: string;
}

export default function AssistantCalendarContextContent({ text }: AssistantCalendarContextContentProps) {
  const blocks = parseCalendarContextBlocks(text);

  return (
    <div className="space-y-4">
      {blocks.map((block, i) =>
        block.kind === "preamble" ? (
          <p key={i} className="whitespace-pre-wrap">
            {block.text}
          </p>
        ) : (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <img
                src={block.logoSrc}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] shrink-0 object-contain"
              />
              <span className="font-semibold text-text-primary">{block.label}</span>
            </div>
            <div className="whitespace-pre-wrap pl-0 text-text-primary">{block.body}</div>
          </div>
        )
      )}
    </div>
  );
}

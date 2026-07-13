/**
 * Renders assistant mail-recap text with provider logos and without markdown asterisks.
 */

import { chatBrandAssetUrl } from "../brands/chatBrandAssetUrl";

type MailRecapBlock =
  | { kind: "preamble"; text: string }
  | { kind: "provider"; label: string; logoSrc: string; body: string };

/** Remove common markdown emphasis markers from model output. */
export function stripAssistantMarkdownBold(input: string): string {
  let s = input.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  return s;
}

function matchProviderHeader(trimmedLine: string): "outlook" | "gmail" | null {
  // Strip markdown bold, trailing colon, and any trailing parenthetical like "(5 messages)"
  // so the LLM adding extra info doesn't break the parser.
  const t = stripAssistantMarkdownBold(trimmedLine)
    .replace(/:$/, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim();
  if (/^outlook mail$/i.test(t)) return "outlook";
  if (/^gmail$/i.test(t)) return "gmail";
  return null;
}

/**
 * Split recap text into preamble and provider sections by lines that look like Outlook / Gmail headers.
 */
function parseMailRecapBlocks(text: string): MailRecapBlock[] {
  const stripped = stripAssistantMarkdownBold(text);
  const lines = stripped.split(/\r?\n/);
  const blocks: MailRecapBlock[] = [];
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
    const provider = matchProviderHeader(rawLine.trim());
    if (provider) {
      flushPreamble();
      flushCurrent();
      current = {
        label: provider === "outlook" ? "Outlook" : "Gmail",
        logoSrc: provider === "outlook" ? chatBrandAssetUrl("outlook.png") : chatBrandAssetUrl("gmail.svg"),
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

interface AssistantMailRecapContentProps {
  text: string;
  streaming?: boolean;
}

export default function AssistantMailRecapContent({
  text,
  streaming,
}: AssistantMailRecapContentProps) {
  const blocks = parseMailRecapBlocks(text);

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
      {streaming && (
        <span className={`inline-block animate-pulse opacity-70${text.trim() ? "" : " ml-0"}`}>▍</span>
      )}
    </div>
  );
}

/** Parsed agent run failure stored as `Goal: …\nOutcome: …` in episodic memory. */
export type ParsedAgentFailure = {
  goal: string;
  outcome: string;
  raw: string;
};

/**
 * Split orchestrator failure text into goal and outcome for inbox cards.
 * Falls back to the full string when the format is unexpected.
 */
export function parseAgentFailureContent(content: string): ParsedAgentFailure {
  const raw = content.trim();
  if (!raw) return { goal: "", outcome: "", raw };

  const goalMatch = /^Goal:\s*([\s\S]*?)(?:\nOutcome:\s*|$)/i.exec(raw);
  const outcomeMatch = /\nOutcome:\s*([\s\S]*)$/i.exec(raw);

  if (goalMatch) {
    return {
      goal: goalMatch[1]?.trim() ?? "",
      outcome: outcomeMatch?.[1]?.trim() ?? "",
      raw,
    };
  }

  return { goal: raw, outcome: "", raw };
}

/** Prefill for Chat when the user taps Retry on a failed agent run. */
export function buildAgentFailureRetryPrompt(parsed: ParsedAgentFailure): string {
  if (parsed.goal && parsed.outcome) {
    return `Please retry this: ${parsed.goal}\n\nLast time it failed because: ${parsed.outcome}`;
  }
  if (parsed.goal) return `Please retry this: ${parsed.goal}`;
  return `Please retry this task:\n\n${parsed.raw}`;
}

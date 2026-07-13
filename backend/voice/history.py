"""Ring buffer of recent voice turns for reconnect context recovery."""

from __future__ import annotations

MAX_VOICE_HISTORY_TURNS = 12

VoiceTurn = dict[str, str]


def append_voice_turn(
    history: list[VoiceTurn],
    user_text: str,
    assistant_text: str,
    *,
    max_turns: int = MAX_VOICE_HISTORY_TURNS,
) -> None:
    """Append a completed turn, dropping the oldest entry when over capacity."""
    if not user_text and not assistant_text:
        return
    history.append({"user": user_text, "assistant": assistant_text})
    while len(history) > max_turns:
        history.pop(0)


def recent_assistant_lines(
    history: list[VoiceTurn],
    *,
    limit: int = MAX_VOICE_HISTORY_TURNS,
) -> list[str]:
    """Return assistant text from the most recent turns (for echo detection)."""
    return [
        str(entry.get("assistant", "") or "")
        for entry in history[-limit:]
    ]


def format_system_instruction_with_history(
    system_instruction: str,
    history: list[VoiceTurn],
) -> str:
    """Prefix system instruction with a text recap of prior voice turns."""
    if not history:
        return system_instruction
    lines = ["[VOICE CONVERSATION HISTORY — your own prior responses are listed below]"]
    for turn in history:
        if turn.get("user"):
            lines.append(f"User: {turn['user']}")
        if turn.get("assistant"):
            lines.append(f"You said: {turn['assistant']}")
    lines.append(
        "[END OF HISTORY — treat every 'You said:' line above as YOUR OWN prior output "
        "that you can translate, summarise, continue, or reference freely.]"
    )
    return "\n".join(lines) + "\n\n" + system_instruction

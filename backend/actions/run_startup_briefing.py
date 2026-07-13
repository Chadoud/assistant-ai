"""Start the saved startup briefing during an active voice session."""


def run_startup_briefing(args: dict) -> dict:
    """
    Begin fetching and speaking the user's saved startup briefing.

    Call only after the user agreed (voice ask-first flow) or when they
    explicitly request the briefing later in the session.

    Honors the persisted ``startup_briefing_consent`` preference: when the user
    previously declined, the briefing does not run unless the call explicitly
    forces it (``_force=True``), which the voice layer only sets when the user
    asks for the briefing by name in this turn.
    """
    from voice_briefing_gate import get_voice_briefing_gate

    if not args.get("_force"):
        # Lazy import avoids a circular dependency (tool_registry -> handlers ->
        # this module -> voice_routes -> tool_registry) at module load time.
        from voice.briefing import get_startup_briefing_consent

        if get_startup_briefing_consent() == "declined":
            return {
                "ok": False,
                "error": (
                    "The startup briefing is disabled — the user previously declined it. "
                    "Do not run it unless they explicitly ask for the briefing by name."
                ),
            }

    gate = get_voice_briefing_gate()
    if gate is None:
        return {
            "ok": False,
            "error": "Voice session is not active — cannot run the startup briefing.",
        }

    from voice.briefing import get_startup_message

    routine = get_startup_message()
    if not routine:
        return {
            "ok": False,
            "error": (
                "No startup routine is saved yet. Ask what they want each time "
                "(news, weather, calendar, mail), then call save_memory with "
                "category=preferences, key=startup_routine, value=<their routine> "
                "before calling run_startup_briefing again."
            ),
        }

    return gate.start_from_tool_thread()

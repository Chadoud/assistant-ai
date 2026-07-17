"""Tests for background voice-tool completion: result formatting + delivery."""

from __future__ import annotations

import threading

import voice_session as vs


def test_web_agent_and_control_computer_run_in_background():
    assert "web_agent" in vs._BACKGROUND_VOICE_TOOLS
    assert "control_computer" in vs._BACKGROUND_VOICE_TOOLS
    assert "plan_and_execute" in vs._BACKGROUND_VOICE_TOOLS


def test_format_done_speaks_the_answer():
    text = vs._format_background_completion(
        "web_agent",
        {"ok": True, "data": {"status": "done", "answer": "You have $42.10 left"}},
    )
    assert text.startswith("[TOOL_RESULT web_agent]")
    assert "You have $42.10 left" in text


def test_format_needs_user_relays_instruction():
    text = vs._format_background_completion(
        "web_agent",
        {"ok": True, "data": {"status": "needs_user", "reason": "Sign in to continue."}},
    )
    assert "NEEDS THE USER" in text
    assert "Sign in to continue." in text


def test_format_failed_reports_block_reason():
    text = vs._format_background_completion(
        "control_computer",
        {"ok": True, "data": {"status": "failed", "reason": "button not found"}},
    )
    assert "DID NOT COMPLETE" in text
    assert "button not found" in text


def test_format_error_reports_failure():
    text = vs._format_background_completion(
        "web_agent", {"ok": False, "error": "browser crashed"}
    )
    assert "FAILED" in text
    assert "browser crashed" in text


def test_format_failure_uses_summary_when_error_missing():
    text = vs._format_background_completion(
        "plan_and_execute",
        {"ok": False, "summary": "Could not list mail: token missing."},
    )
    assert "FAILED" in text
    assert "Could not list mail" in text


def test_format_prefers_summary_when_no_answer():
    text = vs._format_background_completion(
        "plan_and_execute",
        {"ok": True, "summary": "Drafted and sent the email.", "data": {}},
    )
    assert "Drafted and sent the email." in text
    assert "do not re-plan" in text.lower() or "speak this summary" in text.lower()


def test_shape_speakable_plan_summary_truncates_and_maps_quota():
    from voice.tool_dispatch import shape_speakable_plan_summary

    long = "word " * 500
    out = shape_speakable_plan_summary(long)
    assert len(out) <= 1100
    assert out.endswith("…")

    quota = shape_speakable_plan_summary(
        "Done — 429 RESOURCE_EXHAUSTED quota exceeded for generate_content_free_tier"
    )
    assert "rate limit" in quota.lower()


def test_spawn_invokes_on_complete_with_result(monkeypatch):
    captured: dict = {}
    done = threading.Event()

    def _fake_dispatch(name, args, approval_granted=False):
        return {"ok": True, "data": {"status": "done", "answer": "ok"}}

    monkeypatch.setattr("voice.tool_dispatch.dispatch_sync", _fake_dispatch)

    def _on_complete(result):
        captured["result"] = result
        done.set()

    vs._spawn_background_voice_tool("web_agent", {"task": "x"}, on_complete=_on_complete)
    assert done.wait(timeout=5.0), "on_complete was not invoked"
    assert captured["result"]["data"]["answer"] == "ok"


def test_spawn_delivers_error_when_dispatch_raises(monkeypatch):
    captured: dict = {}
    done = threading.Event()

    def _boom(name, args, approval_granted=False):
        raise RuntimeError("kaboom")

    monkeypatch.setattr("voice.tool_dispatch.dispatch_sync", _boom)

    def _on_complete(result):
        captured["result"] = result
        done.set()

    vs._spawn_background_voice_tool("web_agent", {"task": "x"}, on_complete=_on_complete)
    assert done.wait(timeout=5.0), "on_complete was not invoked on failure"
    assert captured["result"]["ok"] is False
    assert "kaboom" in captured["result"]["error"]


def test_infer_close_browser_from_close_the_tab():
    args = vs._infer_close_browser_args("Okay, close the tab.")
    assert args == {"action": "close_browser", "browser": "chrome", "scope": "tab"}


def test_infer_close_browser_handles_tubs_typo():
    args = vs._infer_close_browser_args("close the tubs that you've opened")
    assert args is not None
    assert args["action"] == "close_browser"


def test_infer_close_browser_other_tabs():
    args = vs._infer_close_browser_args("Close the other tabs.")
    assert args == {"action": "close_browser", "browser": "chrome", "scope": "window"}


def test_enrich_os_control_fills_missing_action():
    enriched = vs._enrich_voice_tool_args("os_control", {}, "close the tab")
    assert enriched["action"] == "close_browser"
    assert enriched["scope"] == "tab"


def test_infer_close_browser_other_ones_is_window():
    args = vs._infer_close_browser_args("close the other ones")
    assert args == {"action": "close_browser", "browser": "chrome", "scope": "window"}


def test_infer_close_browser_plain_close_chrome_kills_all():
    args = vs._infer_close_browser_args("close chrome")
    assert args == {"action": "close_browser", "browser": "chrome", "scope": "all"}


def test_infer_close_browser_all_chrome_tabs_is_window():
    args = vs._infer_close_browser_args("close all chrome tabs")
    assert args == {"action": "close_browser", "browser": "chrome", "scope": "window"}


def test_format_cancelled_stays_silent():
    text = vs._format_background_completion(
        "web_agent", {"ok": True, "data": {"status": "cancelled", "reason": "superseded"}}
    )
    assert text == ""


def test_queue_background_tool_result_coalesces_web_agent():
    pending: list[str] = []
    vs._queue_background_tool_result(pending, "web_agent", "[TOOL_RESULT web_agent] DONE: first")
    vs._queue_background_tool_result(pending, "web_agent", "[TOOL_RESULT web_agent] DONE: second")
    assert len(pending) == 1
    assert "second" in pending[0]


def test_queue_background_tool_result_keeps_other_tools():
    pending: list[str] = []
    vs._queue_background_tool_result(
        pending, "control_computer", "[TOOL_RESULT control_computer] DONE: a"
    )
    vs._queue_background_tool_result(pending, "web_agent", "[TOOL_RESULT web_agent] DONE: b")
    assert len(pending) == 2


def test_enrich_web_agent_fills_task_and_voice_defaults():
    enriched = vs._enrich_voice_tool_args("web_agent", {}, "check my anthropic credits")
    assert enriched["task"] == "check my anthropic credits"
    assert enriched["max_steps"] == 8
    assert enriched["_voice_triggered"] is True
    assert enriched["_auto_close_scope"] == "tab"


def test_enrich_control_computer_fills_task():
    enriched = vs._enrich_voice_tool_args("control_computer", {}, "turn on dark mode")
    assert enriched["task"] == "turn on dark mode"


def test_enrich_complete_task_resolves_id_from_cached_tasks():
    open_tasks = [
        {"id": 7, "description": "Shooting at 16:00"},
        {"id": 8, "description": "Email the landlord"},
    ]
    enriched = vs._enrich_voice_tool_args(
        "complete_task", {}, "mark the shooting as done", open_tasks
    )
    assert enriched["task_id"] == 7


def test_enrich_complete_task_falls_back_to_description():
    enriched = vs._enrich_voice_tool_args("complete_task", {}, "mark the groceries done", [])
    assert enriched.get("task_id") is None
    assert enriched["description"] == "groceries"


def test_enrich_complete_task_keeps_explicit_args():
    enriched = vs._enrich_voice_tool_args(
        "complete_task", {"task_id": 3}, "mark anything done", [{"id": 9, "description": "x"}]
    )
    assert enriched["task_id"] == 3

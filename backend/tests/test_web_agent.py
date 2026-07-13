"""Tests for the autonomous web agent (mocked browser + vision)."""

from __future__ import annotations

import threading

import pytest

from actions import web_agent as wa
from actions.credential_guard import enforce_credential_guard
from orchestrator.vision import VisionError


class FakePage:
    """Minimal stand-in for a Playwright page used by the agent loop."""

    def __init__(self, url: str = "https://example.com") -> None:
        self.url = url
        self.goto_calls: list[str] = []
        self.clicks: list[tuple[float, float]] = []
        self.typed: list[str] = []
        self.brought_to_front = False
        # The agent drives mouse/keyboard via page.mouse / page.keyboard.
        self.mouse = self
        self.keyboard = self

    # ── navigation / capture ──
    def goto(self, url: str, **_kw: object) -> None:
        self.goto_calls.append(url)
        self.url = url

    def bring_to_front(self) -> None:
        self.brought_to_front = True

    def title(self) -> str:
        return "Fake Title"

    def inner_text(self, _selector: str, timeout: int | None = None) -> str:
        return "visible page text"

    def screenshot(self, **_kw: object) -> bytes:
        return b"\xff\xd8jpegbytes"

    def evaluate(self, _expr: str) -> list[int]:
        return [1280, 800]

    # ── mouse ──
    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))

    def dblclick(self, x: float, y: float) -> None:
        self.clicks.append((x, y))

    def wheel(self, _dx: float, _dy: float) -> None:
        pass

    # ── keyboard ──
    def type(self, text: str, delay: int | None = None) -> None:
        self.typed.append(text)

    def press(self, _keys: str) -> None:
        pass


@pytest.fixture()
def mocked_agent(monkeypatch):
    """Patch out the browser, vision gate, and sleeps; return the fake page.

    Forces the CDP path (screen driver disabled) so the loop runs against the fake
    Playwright page regardless of whether real Chrome is open on this machine.
    """
    page = FakePage()
    monkeypatch.setattr(wa, "_try_screen_driver", lambda: None)
    monkeypatch.setattr(wa, "_ensure_context", lambda: page)
    monkeypatch.setattr(wa, "_existing_page", lambda: None)
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: False)
    monkeypatch.setattr(wa, "candidates_for", lambda *a, **k: [object()])
    monkeypatch.setattr(wa.time, "sleep", lambda *_a, **_k: None)
    return page


def _script(monkeypatch, actions: list[dict]) -> None:
    """Make the vision decider replay a fixed list of actions."""
    queue = list(actions)

    def _decide(_task, _history, _snapshot, **_kw: object):
        return queue.pop(0) if queue else {"type": "wait", "reason": "no more script"}

    monkeypatch.setattr(wa, "_decide_action", _decide)


def test_blocks_private_start_url(mocked_agent, monkeypatch):
    result = wa.web_agent({"task": "check router", "start_url": "http://127.0.0.1/admin"})
    assert result["ok"] is False
    assert "private" in result["error"].lower()
    assert mocked_agent.goto_calls == []


def test_navigate_blocks_loopback(mocked_agent):
    err = wa._perform(mocked_agent, {"type": "navigate", "url": "http://localhost:8080"})
    assert err is not None
    assert "blocked" in err.lower()
    assert mocked_agent.goto_calls == []


def test_done_returns_answer(mocked_agent, monkeypatch):
    _script(monkeypatch, [{"type": "done", "answer": "You have $42.10 of credits remaining"}])
    result = wa.web_agent({"task": "check my Anthropic credits"})
    assert result["ok"] is True
    assert result["data"]["status"] == "done"
    assert result["data"]["answer"] == "You have $42.10 of credits remaining"


def test_extract_is_treated_as_done(mocked_agent, monkeypatch):
    _script(monkeypatch, [{"type": "extract", "answer": "Balance: 12 EUR"}])
    result = wa.web_agent({"task": "read my balance"})
    assert result["data"]["status"] == "done"
    assert result["data"]["answer"] == "Balance: 12 EUR"


def test_needs_login_hands_off_to_visible_window(mocked_agent, monkeypatch):
    _script(monkeypatch, [{"type": "needs_login", "reason": "Sign-in required."}])
    result = wa.web_agent({"task": "open my dashboard", "start_url": "https://acme.example"})
    assert result["ok"] is True
    assert result["data"]["status"] == "needs_user"
    # The handoff message tells the user to sign in.
    assert "sign in" in result["data"]["reason"].lower()
    # A visible window was brought to front for the user.
    assert mocked_agent.brought_to_front is True


def test_step_cap_returns_incomplete(mocked_agent, monkeypatch):
    _script(monkeypatch, [{"type": "scroll", "amount": -3}] * 10)
    result = wa.web_agent({"task": "scroll forever", "max_steps": 2})
    assert result["data"]["status"] == "incomplete"
    assert result["data"]["steps"] == 2


def test_missing_task_is_rejected():
    result = wa.web_agent({})
    assert result["ok"] is False
    assert "task is required" in result["error"]


def test_no_vision_provider_is_reported(monkeypatch):
    monkeypatch.setattr(wa, "candidates_for", lambda *a, **k: [])
    result = wa.web_agent({"task": "do something"})
    assert result["ok"] is False
    assert "vision" in result["error"].lower()


# ── credential guard ──────────────────────────────────────────────────────────

def test_credential_guard_blocks_password_typing():
    guarded = enforce_credential_guard(
        {"type": "type", "text": "hunter2", "reason": "enter the password"},
        handoff_type="needs_login",
        handoff_reason=wa._NEEDS_LOGIN_SECRET_REASON,
    )
    assert guarded["type"] == "needs_login"


def test_credential_guard_honors_sensitive_flag():
    guarded = enforce_credential_guard(
        {"type": "type", "text": "123456", "sensitive": True, "reason": "code"},
        handoff_type="needs_login",
        handoff_reason=wa._NEEDS_LOGIN_SECRET_REASON,
    )
    assert guarded["type"] == "needs_login"


def test_credential_guard_allows_normal_typing():
    action = {"type": "type", "text": "billing", "reason": "search box"}
    assert enforce_credential_guard(action, handoff_type="needs_login") == action


# ── helpers ───────────────────────────────────────────────────────────────────

def test_navigate_prepends_https():
    page = FakePage()
    wa._perform(page, {"type": "navigate", "url": "anthropic.com"})
    assert page.goto_calls == ["https://anthropic.com"]


def test_extract_json_tolerates_surrounding_text():
    parsed = wa._extract_json('here you go: {"type": "done", "answer": "x"} thanks')
    assert parsed == {"type": "done", "answer": "x"}


@pytest.mark.parametrize(
    "value,expected",
    [(0.5, 0.5), (-1, 0.0), (2, 1.0), ("nope", None), (None, None)],
)
def test_clamp01(value, expected):
    assert wa._clamp01(value) == expected


# ── transient-failure retry + handoff ──────────────────────────────────────────

def test_decide_with_retry_recovers_after_transient(monkeypatch):
    """A transient (DNS/connection) vision failure is retried, then succeeds."""
    monkeypatch.setattr(wa.time, "sleep", lambda *_a, **_k: None)
    calls = {"n": 0}

    def _flaky(_task, _history, _snapshot, **_kw: object):
        calls["n"] += 1
        if calls["n"] == 1:
            raise VisionError("Anthropic request failed: [Errno 11001] getaddrinfo failed")
        return {"type": "done", "answer": "recovered"}

    monkeypatch.setattr(wa, "_decide_action", _flaky)
    action = wa._decide_with_retry("t", [], (b"", "", "", ""), deadline=wa.time.monotonic() + 100)
    assert action == {"type": "done", "answer": "recovered"}
    assert calls["n"] == 2


def test_decide_with_retry_reraises_non_transient(monkeypatch):
    """A non-transient failure (bad key) is not retried — it surfaces immediately."""
    monkeypatch.setattr(wa.time, "sleep", lambda *_a, **_k: None)
    calls = {"n": 0}

    def _bad_key(_task, _history, _snapshot, **_kw: object):
        calls["n"] += 1
        raise VisionError("API key not valid")

    monkeypatch.setattr(wa, "_decide_action", _bad_key)
    with pytest.raises(VisionError):
        wa._decide_with_retry("t", [], (b"", "", "", ""), deadline=wa.time.monotonic() + 100)
    assert calls["n"] == 1


def test_persistent_network_failure_hands_off_gracefully(mocked_agent, monkeypatch):
    """When the network stays down, the agent returns needs_user, not a hard error."""
    def _always_dns_fail(_task, _history, _snapshot, **_kw: object):
        raise VisionError("getaddrinfo failed")

    monkeypatch.setattr(wa, "_decide_action", _always_dns_fail)
    result = wa.web_agent({"task": "check my credits"})
    assert result["ok"] is True
    assert result["data"]["status"] == "needs_user"
    assert "connection" in result["data"]["reason"].lower()


def test_persistent_non_transient_failure_is_hard_error(mocked_agent, monkeypatch):
    """A non-transient vision failure returns ok=False so the real reason surfaces."""
    def _bad_key(_task, _history, _snapshot, **_kw: object):
        raise VisionError("API key not valid")

    monkeypatch.setattr(wa, "_decide_action", _bad_key)
    result = wa.web_agent({"task": "check my credits"})
    assert result["ok"] is False
    assert "api key" in result["error"].lower()


# ── real Chrome launch + fallback ───────────────────────────────────────────────

class _FakeChromium:
    """Records launch_persistent_context calls; can fail when channel is passed."""

    def __init__(self, fail_channel: bool) -> None:
        self.calls: list[dict] = []
        self._fail_channel = fail_channel

    def launch_persistent_context(self, user_data_dir: str, **kwargs: object) -> str:
        self.calls.append({"user_data_dir": user_data_dir, **kwargs})
        if "channel" in kwargs and self._fail_channel:
            raise RuntimeError("Chrome executable not found")
        return f"context({kwargs.get('channel', 'chromium')})"


class _FakePw:
    def __init__(self, fail_channel: bool = False) -> None:
        self.chromium = _FakeChromium(fail_channel)


def test_launch_persistent_uses_real_profile(monkeypatch, tmp_path):
    """The agent opens the user's REAL Chrome User Data + their actual profile."""
    monkeypatch.setattr(wa, "_default_chrome_user_data", lambda: tmp_path)
    monkeypatch.setattr(wa, "_first_profile_name", lambda _root: "Profile 1")
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: False)
    monkeypatch.delenv("EXOSITES_WEB_AGENT_ISOLATED", raising=False)

    pw = _FakePw(fail_channel=False)
    ctx = wa._launch_persistent(pw)

    assert ctx == "context(chrome)"
    call = pw.chromium.calls[0]
    assert call["user_data_dir"] == str(tmp_path)          # the REAL User Data dir
    assert call["channel"] == "chrome"
    assert "--profile-directory=Profile 1" in call["args"]  # the user's real profile
    assert call["headless"] is False


def test_launch_persistent_raises_when_chrome_running(monkeypatch, tmp_path):
    """If Chrome already holds the profile, raise ChromeBusyError (-> needs_user)."""
    monkeypatch.setattr(wa, "_default_chrome_user_data", lambda: tmp_path)
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: True)
    monkeypatch.delenv("EXOSITES_WEB_AGENT_ISOLATED", raising=False)
    with pytest.raises(wa.ChromeBusyError):
        wa._launch_persistent(_FakePw())


def test_launch_persistent_locked_profile_becomes_chrome_busy(monkeypatch, tmp_path):
    """A failed real-profile launch (lock) surfaces as ChromeBusyError, not isolated."""
    monkeypatch.setattr(wa, "_default_chrome_user_data", lambda: tmp_path)
    monkeypatch.setattr(wa, "_first_profile_name", lambda _root: "Default")
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: False)
    monkeypatch.delenv("EXOSITES_WEB_AGENT_ISOLATED", raising=False)
    with pytest.raises(wa.ChromeBusyError):
        wa._launch_persistent(_FakePw(fail_channel=True))


def test_launch_isolated_when_no_chrome_install(monkeypatch, tmp_path):
    """With no real Chrome install, use the dedicated profile and fall back to Chromium."""
    monkeypatch.setattr(wa, "_default_chrome_user_data", lambda: None)
    monkeypatch.setattr(wa, "_profile_dir", lambda: str(tmp_path))
    pw = _FakePw(fail_channel=True)
    ctx = wa._launch_persistent(pw)
    assert ctx == "context(chromium)"
    assert call_count_channel(pw) == 1  # tried real Chrome once, then Chromium


def call_count_channel(pw: _FakePw) -> int:
    return sum(1 for c in pw.chromium.calls if "channel" in c)


def test_isolated_env_forces_dedicated_profile(monkeypatch, tmp_path):
    """EXOSITES_WEB_AGENT_ISOLATED=1 never touches the user's real profile."""
    monkeypatch.setattr(wa, "_default_chrome_user_data", lambda: tmp_path / "real")
    monkeypatch.setattr(wa, "_profile_dir", lambda: str(tmp_path / "iso"))
    monkeypatch.setenv("EXOSITES_WEB_AGENT_ISOLATED", "1")
    pw = _FakePw(fail_channel=False)
    ctx = wa._launch_persistent(pw)
    assert ctx == "context(chrome)"
    assert pw.chromium.calls[0]["user_data_dir"] == str(tmp_path / "iso")


def test_chrome_busy_surfaces_as_needs_user(monkeypatch):
    """When Chrome is open but on-screen control is unavailable, ask the user."""
    monkeypatch.setattr(wa, "candidates_for", lambda *a, **k: [object()])
    monkeypatch.setattr(wa, "_try_screen_driver", lambda: None)
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: True)

    result = wa.web_agent({"task": "check my credits"})
    assert result["ok"] is True
    assert result["data"]["status"] == "needs_user"
    assert "close" in result["data"]["reason"].lower()


# ── on-screen driver: act inside the user's already-open Chrome ─────────────────

class FakePyAutoGui:
    """Minimal PyAutoGUI stand-in: records clicks/typing and returns a fake screenshot."""

    FAILSAFE = False
    PAUSE = 0.0

    def __init__(self) -> None:
        self.clicks: list[tuple[int, int]] = []
        self.typed: list[str] = []

    def size(self) -> tuple[int, int]:
        return (1920, 1080)

    def screenshot(self):  # noqa: ANN201 — returns a fake image with .convert/.size/.save
        return _FakeImage()

    def click(self, x: int, y: int) -> None:
        self.clicks.append((x, y))

    def doubleClick(self, x: int, y: int) -> None:  # noqa: N802 — mirrors PyAutoGUI API
        self.clicks.append((x, y))

    def typewrite(self, text: str, interval: float | None = None) -> None:
        self.typed.append(text)

    def hotkey(self, *_keys: str) -> None:
        pass

    def scroll(self, _amount: int) -> None:
        pass


class _FakeImage:
    size = (1920, 1080)

    def convert(self, _mode: str) -> "_FakeImage":
        return self

    def save(self, buf, format: str | None = None, **kwargs) -> None:  # noqa: A002
        buf.write(b"\xff\xd8jpeg")


def test_open_chrome_is_driven_on_screen_not_closed(monkeypatch):
    """When the user's Chrome is open, we drive it on-screen — never ask to close it."""
    monkeypatch.setattr(wa, "candidates_for", lambda *a, **k: [object()])
    monkeypatch.setattr(wa, "_existing_page", lambda: None)
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: True)
    monkeypatch.setattr(wa, "_find_chrome_executable", lambda: wa.Path("chrome.exe"))
    monkeypatch.setattr(wa, "_close_context", lambda: None)

    pg = FakePyAutoGui()
    monkeypatch.setattr(wa, "_try_screen_driver", lambda: wa._ScreenDriver(pg, wa.Path("chrome.exe")))
    # If CDP were chosen instead, this would raise and fail the test.
    monkeypatch.setattr(wa, "_ensure_context", lambda: (_ for _ in ()).throw(AssertionError("used CDP")))
    monkeypatch.setattr(wa.time, "sleep", lambda *_a, **_k: None)

    opened: list[list[str]] = []
    monkeypatch.setattr(wa.subprocess, "Popen", lambda args, **_k: opened.append(args))

    _script(monkeypatch, [
        {"type": "navigate", "url": "console.anthropic.com"},
        {"type": "extract", "answer": "You have $42.10 left"},
    ])
    result = wa.web_agent({"task": "check my Anthropic credits"})

    assert result["ok"] is True
    assert result["data"]["status"] == "done"
    assert result["data"]["answer"] == "You have $42.10 left"
    # A new tab was opened in the user's running Chrome (not a "close Chrome" ask).
    assert opened and opened[0][0] == "chrome.exe"
    assert opened[0][1] == "https://console.anthropic.com/settings/billing"


def test_screen_driver_click_maps_fraction_to_screen_pixels(monkeypatch):
    """A fractional click target is mapped to real screen pixels via the screenshot size."""
    pg = FakePyAutoGui()
    driver = wa._ScreenDriver(pg, wa.Path("chrome.exe"))
    driver.snapshot()  # records the (1920, 1080) screenshot size
    driver.perform({"type": "click", "x": 0.5, "y": 0.25})
    assert pg.clicks == [(960, 270)]


def test_acquire_driver_reuses_live_cdp_context(monkeypatch):
    """CDP context is reused only when on-screen control is unavailable."""
    page = FakePage()
    monkeypatch.setattr(wa, "_try_screen_driver", lambda: None)
    monkeypatch.setattr(wa, "_existing_page", lambda: page)
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: False)
    driver = wa._acquire_driver()
    assert isinstance(driver, wa._PlaywrightDriver)


def test_acquire_driver_uses_screen_when_chrome_closed(monkeypatch):
    """When Chrome is closed, open real Chrome on-screen — not Playwright about:blank."""
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: False)
    pg = FakePyAutoGui()
    monkeypatch.setattr(wa, "_try_screen_driver", lambda: wa._ScreenDriver(pg, wa.Path("chrome.exe")))
    monkeypatch.setattr(wa, "_ensure_context", lambda: (_ for _ in ()).throw(AssertionError("used CDP")))
    driver = wa._acquire_driver()
    assert isinstance(driver, wa._ScreenDriver)


def test_acquire_driver_prefers_screen_over_stale_cdp(monkeypatch):
    """When Chrome is open, use the on-screen driver — not a stale Playwright window."""
    page = FakePage()
    monkeypatch.setattr(wa, "_existing_page", lambda: page)
    monkeypatch.setattr(wa, "_user_chrome_running", lambda: True)
    pg = FakePyAutoGui()
    monkeypatch.setattr(wa, "_try_screen_driver", lambda: wa._ScreenDriver(pg, wa.Path("chrome.exe")))
    closed = {"n": 0}
    monkeypatch.setattr(wa, "_close_context", lambda: closed.update(n=closed["n"] + 1))
    monkeypatch.setattr(wa, "_context", object(), raising=False)
    driver = wa._acquire_driver()
    assert isinstance(driver, wa._ScreenDriver)
    assert closed["n"] == 1


def test_infer_start_url_anthropic():
    assert "anthropic.com" in wa._infer_start_url("check my entropic account credits")


def test_infer_start_url_gemini_usage_before_apikey():
    """A 'gemini credits' task lands on the usage page, not the API-keys page."""
    assert wa._infer_start_url("how many gemini credits do I have") == (
        "https://aistudio.google.com/usage"
    )


# ── balance fast-path (answer from page text, skip vision) ──────────────────────

def test_is_balance_read_task():
    assert wa._is_balance_read_task("check my remaining credits")
    assert wa._is_balance_read_task("quel est mon solde")
    assert not wa._is_balance_read_task("write a tweet about cats")


@pytest.mark.parametrize(
    "text,expected_fragment",
    [
        ("Account\nCredits remaining: 1500 credits\nPlan: Pro", "1500 credits"),
        ("Balance\n$42.10 available", "$42.10"),
        ("Usage: 80% used this month", "80%"),
    ],
)
def test_try_extract_balance_from_text(text, expected_fragment):
    line = wa._try_extract_balance_from_text(text)
    assert line is not None and expected_fragment in line


def test_try_extract_balance_returns_none_without_figures():
    assert wa._try_extract_balance_from_text("loading your dashboard…") is None


def test_fast_path_answers_balance_without_vision(mocked_agent, monkeypatch):
    """When the page text already shows the figure, no vision step is taken."""
    mocked_agent.inner_text = lambda _sel, timeout=None: "Credits remaining: 1500 credits"

    def _must_not_run(*_a, **_k):
        raise AssertionError("vision must not be called on the fast path")

    monkeypatch.setattr(wa, "_decide_action", _must_not_run)
    result = wa.web_agent({"task": "how many credits do I have", "start_url": "https://x"})
    assert result["data"]["status"] == "done"
    assert "1500 credits" in result["data"]["answer"]


# ── single-flight cancellation ──────────────────────────────────────────────────

def test_run_browser_loop_cancelled_before_first_step():
    class _Driver:
        url = "https://example.com"

    event = threading.Event()
    event.set()
    result = wa._run_browser_loop(
        _Driver(), "task", 5, wa.time.monotonic() + 100, None, cancel=event
    )
    assert result["data"]["status"] == "cancelled"


def test_cancel_web_agent_run_signals_active_event():
    event = wa._register_active_cancel()
    try:
        assert wa.cancel_web_agent_run("superseded") is True
        assert event.is_set()
    finally:
        wa._clear_active_cancel(event)


def test_cancel_web_agent_run_returns_false_without_active():
    with wa._cancel_lock:
        wa._active_cancel = None
    assert wa.cancel_web_agent_run() is False


# ── auto-close tab after a successful run ───────────────────────────────────────

def test_auto_close_tab_on_done(mocked_agent, monkeypatch):
    import actions.os_control as osc

    calls: list[dict] = []
    monkeypatch.setattr(osc, "os_control", lambda p: calls.append(p) or {"ok": True})
    _script(monkeypatch, [{"type": "done", "answer": "x"}])
    wa.web_agent({"task": "open my page", "start_url": "https://x", "_auto_close_scope": "tab"})
    assert calls and calls[0]["action"] == "close_browser"
    assert calls[0]["scope"] == "tab"


def test_no_auto_close_on_needs_user(mocked_agent, monkeypatch):
    import actions.os_control as osc

    calls: list[dict] = []
    monkeypatch.setattr(osc, "os_control", lambda p: calls.append(p) or {"ok": True})
    _script(monkeypatch, [{"type": "needs_login", "reason": "sign in"}])
    wa.web_agent({"task": "open my page", "start_url": "https://x", "_auto_close_scope": "tab"})
    assert calls == []


def test_no_auto_close_when_scope_not_tab(mocked_agent, monkeypatch):
    import actions.os_control as osc

    calls: list[dict] = []
    monkeypatch.setattr(osc, "os_control", lambda p: calls.append(p) or {"ok": True})
    _script(monkeypatch, [{"type": "done", "answer": "x"}])
    wa.web_agent({"task": "open my page", "start_url": "https://x"})
    assert calls == []


# ── single browser worker thread (cross-thread crash regression) ────────────────

def test_sequential_calls_share_one_worker_thread(mocked_agent, monkeypatch):
    """Two sequential calls run on the SAME single worker thread and don't crash.

    This is the regression for the original bug: a per-call daemon thread reusing a
    module-global Playwright context across threads produced
    'Target page, context or browser has been closed'.
    """
    import threading

    seen: list[str] = []

    def _decide(_task, _history, _snapshot, **_kw: object):
        seen.append(threading.current_thread().name)
        return {"type": "done", "answer": "ok"}

    monkeypatch.setattr(wa, "_decide_action", _decide)
    first = wa.web_agent({"task": "first"})
    second = wa.web_agent({"task": "second"})

    assert first["data"]["status"] == "done"
    assert second["data"]["status"] == "done"
    assert len(seen) == 2
    assert all(name.startswith("web-agent") for name in seen)
    assert seen[0] == seen[1]  # same worker thread reused


# ── profile seeding (open Chrome already signed in) ─────────────────────────────

def test_first_profile_prefers_last_used(tmp_path):
    """The clone source follows Chrome's last-used profile, not always 'Default'."""
    import json

    (tmp_path / "Profile 1").mkdir()
    (tmp_path / "Local State").write_text(
        json.dumps({"profile": {"last_used": "Profile 1"}}), encoding="utf-8"
    )
    assert wa._first_profile_name(tmp_path) == "Profile 1"


def test_first_profile_falls_back_to_default(tmp_path):
    """With no usable Local State, fall back to the standard 'Default' profile."""
    assert wa._first_profile_name(tmp_path) == "Default"


def test_close_web_agent_sessions_runs_on_worker(mocked_agent, monkeypatch):
    """Teardown is submitted to the worker so Playwright closes on its own thread."""
    import threading

    monkeypatch.setattr(wa, "_decide_action", lambda *_a, **_k: {"type": "done", "answer": "x"})
    wa.web_agent({"task": "warm up the worker"})  # ensure the executor exists

    closed: dict[str, str] = {}

    def _record_close() -> None:
        closed["thread"] = threading.current_thread().name

    monkeypatch.setattr(wa, "_close_context", _record_close)
    wa.close_web_agent_sessions()
    assert closed.get("thread", "").startswith("web-agent")


def test_macos_permission_reason_mentions_exo_when_electron_bridge_set(monkeypatch):
    monkeypatch.setattr(wa.sys, "platform", "darwin")
    monkeypatch.setenv("EXOSITES_ELECTRON_CAPTURE_URL", "http://127.0.0.1:7798/v1/capture/screen")
    reason = wa._macos_screen_capture_permission_reason()
    assert "Exo" in reason
    assert "Python" not in reason


def test_macos_permission_reason_mentions_python_without_electron_bridge(monkeypatch):
    monkeypatch.setattr(wa.sys, "platform", "darwin")
    monkeypatch.delenv("EXOSITES_ELECTRON_CAPTURE_URL", raising=False)
    reason = wa._macos_screen_capture_permission_reason(
        RuntimeError("cannot identify image file /tmp/x.png")
    )
    assert "Python" in reason

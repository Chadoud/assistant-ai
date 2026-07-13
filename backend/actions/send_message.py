"""
Send messages via full desktop automation: open app → find contact → send.

Primary path (all non-email platforms):
  1. Open the messaging app (Start menu on Windows, `open -a` on macOS, launcher on Linux).
  2. Search for the recipient inside the app with Ctrl/Cmd+F.
  3. Paste the message and press Enter to send.

Browser-automation path (Instagram, Messenger):
  Open the provider URL, navigate to the DM thread, paste, Enter.

Email path:
  Opens the system mail composer via mailto: URL (desktop Mail clients don't expose
  a reliable search API, so a compose deep-link is the most compatible approach).

Deep-link / clipboard fallback:
  If automation fails for any reason the tool falls back to wa.me / tg:// / mailto
  URLs, then clipboard copy as a last resort.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import subprocess
import time
import urllib.parse
import webbrowser
from typing import Any

logger = logging.getLogger(__name__)

MAX_MESSAGE_LEN = 4000

# ── platform map ─────────────────────────────────────────────────────────────

_SUPPORTED_PLATFORMS = frozenset({
    "whatsapp", "telegram", "signal", "discord",
    "instagram", "messenger", "email", "sms",
})

_PLATFORM_ALIASES: dict[str, str] = {
    "wp": "whatsapp", "wapp": "whatsapp",
    "tg": "telegram",
    "ig": "instagram", "insta": "instagram",
    "facebook": "messenger", "fb": "messenger",
    "mailto": "email", "mail": "email",
}


# ── OS detection ─────────────────────────────────────────────────────────────

def _os_name() -> str:
    """Return 'windows', 'mac', or 'linux'."""
    sysname = platform.system()
    if sysname == "Darwin":
        return "mac"
    if os.name == "nt":
        return "windows"
    return "linux"


# ── clipboard + paste primitives ─────────────────────────────────────────────

def _copy_to_clipboard(text: str) -> None:
    """Write text to the system clipboard (pyperclip preferred, Tk fallback)."""
    try:
        import pyperclip  # type: ignore[import-untyped]
        pyperclip.copy(text[:MAX_MESSAGE_LEN])
        return
    except Exception:
        pass
    # Tk fallback
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(text[:MAX_MESSAGE_LEN])
        root.update()
        root.destroy()
    except Exception as exc:
        raise RuntimeError(f"Cannot access clipboard: {exc}") from exc


def _require_pyautogui() -> Any:
    try:
        import pyautogui  # type: ignore[import-untyped]
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.06
        return pyautogui
    except ImportError as exc:
        raise RuntimeError(
            "PyAutoGUI not installed — run: pip install pyautogui"
        ) from exc


def _paste_hotkey(pg: Any) -> None:
    if _os_name() == "mac":
        pg.hotkey("command", "v")
    else:
        pg.hotkey("ctrl", "v")


def _paste_text(pg: Any, text: str) -> None:
    """Copy text to clipboard and paste it. Falls back to pyautogui.write."""
    try:
        _copy_to_clipboard(text)
        time.sleep(0.15)
        _paste_hotkey(pg)
        time.sleep(0.1)
    except RuntimeError:
        # clipboard unavailable — type character by character
        pg.write(text[:500], interval=0.03)


def _clear_and_paste(pg: Any, text: str) -> None:
    """Select all existing text, delete it, then paste the new text."""
    if _os_name() == "mac":
        pg.hotkey("command", "a")
    else:
        pg.hotkey("ctrl", "a")
    time.sleep(0.1)
    pg.press("delete")
    time.sleep(0.1)
    _paste_text(pg, text)


# ── app launcher ─────────────────────────────────────────────────────────────

def _open_app(pg: Any, app_name: str) -> bool:
    """Launch a desktop app. Returns True if the launch gesture was issued."""
    osn = _os_name()
    logger.debug("[send] open_app START app=%r os=%s", app_name, osn)
    try:
        if osn == "windows":
            # Press Win to open Start, then TYPE character by character — clipboard
            # paste (Ctrl+V) in the Start menu triggers the Run dialog on most
            # Windows versions and causes "Windows cannot find '<app>'" errors.
            logger.debug("[send] open_app windows: pressing Win then typing %r", app_name)
            pg.press("win")
            time.sleep(0.6)
            pg.write(app_name, interval=0.05)
            time.sleep(0.7)
            pg.press("enter")
            time.sleep(2.5)
            logger.debug("[send] open_app done app=%r", app_name)
            return True

        if osn == "mac":
            logger.debug("[send] open_app mac: open -a %r", app_name)
            result = subprocess.run(
                ["open", "-a", app_name],
                capture_output=True, text=True, timeout=10, shell=False,
            )
            if result.returncode != 0:
                # try with .app suffix
                result = subprocess.run(
                    ["open", "-a", f"{app_name}.app"],
                    capture_output=True, text=True, timeout=10, shell=False,
                )
            time.sleep(2.5)
            logger.debug("[send] open_app done app=%r rc=%d", app_name, result.returncode)
            return result.returncode == 0

        # Linux
        launched = False
        for launcher in [["gtk-launch", app_name.lower()], [app_name.lower()]]:
            logger.debug("[send] open_app linux: trying launcher=%r", launcher)
            try:
                subprocess.Popen(
                    launcher,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                launched = True
                break
            except FileNotFoundError:
                continue
        time.sleep(2.5)
        logger.debug("[send] open_app done app=%r launched=%s", app_name, launched)
        return launched

    except Exception as exc:
        logger.warning("[send] open_app FAILED app=%r: %s", app_name, exc)
        return False


# ── in-app search ─────────────────────────────────────────────────────────────

def _search_in_app(pg: Any, query: str) -> None:
    """
    Focus the app's global search bar with Ctrl/Cmd+F, clear any existing text,
    then paste the query.  This matches Mark-XXXIX's approach: Ctrl+F opens the
    global search in WhatsApp/Telegram/Discord/Signal, not the in-chat search.
    """
    logger.debug("[send] search_in_app query=%r", query)
    if _os_name() == "mac":
        pg.hotkey("command", "f")
    else:
        pg.hotkey("ctrl", "f")
    time.sleep(0.5)
    # Select-all + delete to clear previous search, then paste new query
    if _os_name() == "mac":
        pg.hotkey("command", "a")
    else:
        pg.hotkey("ctrl", "a")
    time.sleep(0.1)
    pg.press("delete")
    time.sleep(0.1)
    logger.debug("[send] search_in_app pasting query into search bar")
    _paste_text(pg, query)
    time.sleep(1.0)
    logger.debug("[send] search_in_app done")


# ── generic desktop send ──────────────────────────────────────────────────────

def _desktop_send(app_name: str, recipient: str, message: str) -> tuple[bool, str]:
    """
    Full automation flow: open app → global search for recipient → open chat → send.
    Returns (ok, error_or_empty).
    """
    logger.debug("[send] desktop_send START app=%r recipient=%r", app_name, recipient)
    pg = _require_pyautogui()

    if not _open_app(pg, app_name):
        logger.warning("[send] desktop_send FAIL could not open app=%r", app_name)
        return False, f"Could not open {app_name!r}"

    # Wait for the app to fully load before interacting
    logger.debug("[send] desktop_send waiting for app to load…")
    time.sleep(3.0)
    _search_in_app(pg, recipient)

    # Select the first search result and open the chat
    logger.debug("[send] desktop_send pressing Enter to open chat")
    pg.press("enter")
    time.sleep(0.8)

    # Paste the message into the compose box and press Enter to send
    logger.debug("[send] desktop_send pasting message and sending")
    _paste_text(pg, message)
    time.sleep(0.2)
    pg.press("enter")
    time.sleep(0.3)
    logger.debug("[send] desktop_send DONE app=%r recipient=%r", app_name, recipient)
    return True, ""


# ── browser-based senders ─────────────────────────────────────────────────────

def _browser_open(url: str) -> bool:
    try:
        webbrowser.open(url)
        time.sleep(4.0)
        return True
    except Exception as exc:
        logger.warning("_browser_open failed: %s", exc)
        return False


def _instagram_send(recipient: str, message: str) -> tuple[bool, str]:
    pg = _require_pyautogui()
    if not _browser_open("https://www.instagram.com/direct/new/"):
        return False, "Could not open Instagram in browser"
    _paste_text(pg, recipient)
    time.sleep(1.5)
    pg.press("down")
    time.sleep(0.3)
    pg.press("enter")
    time.sleep(0.4)
    # Tab to the compose box then open it
    for _ in range(4):
        pg.press("tab")
        time.sleep(0.15)
    pg.press("enter")
    time.sleep(2.0)
    _paste_text(pg, message)
    time.sleep(0.2)
    pg.press("enter")
    time.sleep(0.3)
    return True, ""


def _messenger_send(recipient: str, message: str) -> tuple[bool, str]:
    pg = _require_pyautogui()
    if not _browser_open("https://www.messenger.com/"):
        return False, "Could not open Messenger in browser"
    _search_in_app(pg, recipient)
    time.sleep(0.5)
    pg.press("down")
    time.sleep(0.3)
    pg.press("enter")
    time.sleep(1.0)
    _paste_text(pg, message)
    time.sleep(0.2)
    pg.press("enter")
    time.sleep(0.3)
    return True, ""


# ── per-platform routers ──────────────────────────────────────────────────────

def _send_for_platform(
    platform_name: str, recipient: str, message: str
) -> tuple[bool, str]:
    """Return (ok, error). Caller handles fallback."""
    if platform_name == "whatsapp":
        return _desktop_send("WhatsApp", recipient, message)
    if platform_name == "telegram":
        return _desktop_send("Telegram", recipient, message)
    if platform_name == "signal":
        return _desktop_send("Signal", recipient, message)
    if platform_name == "discord":
        return _desktop_send("Discord", recipient, message)
    if platform_name == "instagram":
        return _instagram_send(recipient, message)
    if platform_name == "messenger":
        return _messenger_send(recipient, message)
    # email and sms are handled by deep link only — no reliable desktop target
    return False, f"{platform_name} uses URL/deep-link delivery"


# ── deep-link URL builders (fallback) ────────────────────────────────────────

def _normalize_phone_digits(raw: str) -> str:
    return re.sub(r"\D", "", raw or "")


def _whatsapp_url(recipient: str, text: str) -> tuple[str | None, str | None]:
    digits = _normalize_phone_digits(recipient)
    if not digits or len(digits) < 8:
        return None, "WhatsApp fallback needs a phone number with country code"
    return f"https://wa.me/{digits}?text={urllib.parse.quote(text, safe='')}", None


def _telegram_url(recipient: str, text: str) -> tuple[str | None, str | None]:
    uname = recipient.lstrip("@").strip()
    if not uname:
        return None, "Telegram fallback needs a username"
    return (
        f"tg://msg?to={urllib.parse.quote(uname, safe='')}"
        f"&text={urllib.parse.quote(text, safe='')}",
        None,
    )


def _mailto_url(recipient: str, text: str, subject: str = "") -> tuple[str | None, str | None]:
    if "@" not in recipient:
        return None, "Email needs a valid address"
    return (
        "mailto:"
        + urllib.parse.quote(recipient, safe="@.+_-")
        + "?"
        + urllib.parse.urlencode({"subject": subject[:500], "body": text[:MAX_MESSAGE_LEN]}),
        None,
    )


def _sms_url(recipient: str, text: str) -> tuple[str | None, str | None]:
    digits = _normalize_phone_digits(recipient)
    if not digits:
        return None, "SMS needs a phone number"
    return f"sms:{digits}?body={urllib.parse.quote(text, safe='')}", None


def _fallback_url(
    platform_name: str, recipient: str, text: str, mail_subject: str = ""
) -> tuple[str | None, str | None]:
    if platform_name == "whatsapp":
        return _whatsapp_url(recipient, text)
    if platform_name == "telegram":
        return _telegram_url(recipient, text)
    if platform_name in {"email"}:
        return _mailto_url(recipient, text, mail_subject)
    if platform_name == "sms":
        return _sms_url(recipient, text)
    if platform_name == "instagram":
        return "https://www.instagram.com/direct/inbox/", None
    if platform_name == "messenger":
        return "https://www.messenger.com/", None
    # signal / discord have no universal URL scheme
    return None, f"No URL fallback for {platform_name!r}"


def _open_url(url: str) -> bool:
    try:
        if webbrowser.open(url, new=2):
            return True
    except Exception:
        pass
    try:
        if os.name == "nt":
            subprocess.Popen(["cmd", "/c", "start", "", url], shell=False, close_fds=True)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", url], shell=False)
        else:
            subprocess.Popen(["xdg-open", url], shell=False)
        return True
    except Exception as exc:
        logger.warning("_open_url failed: %s", exc)
        return False


# ── public entry point ────────────────────────────────────────────────────────

def send_message(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        platform: whatsapp | telegram | signal | discord | instagram | messenger | email | sms
        recipient: contact name in the app, @username, phone number, or email
        message_text: text to send
        mail_subject: optional subject (email only)
        prefer_deep_link: skip desktop automation and use URL/deep-link only
    """
    raw_platform = str(parameters.get("platform", "")).strip().lower()
    # Default to whatsapp when the model omits the platform — matches the system-prompt default.
    if not raw_platform:
        raw_platform = "whatsapp"
    platform_name = _PLATFORM_ALIASES.get(raw_platform, raw_platform)
    recipient = str(parameters.get("recipient", parameters.get("receiver", ""))).strip()
    message_text = str(parameters.get("message_text", "")).strip()
    mail_subject = str(parameters.get("mail_subject", "")).strip()
    prefer_deep_link = bool(parameters.get("prefer_deep_link", False))

    if platform_name not in _SUPPORTED_PLATFORMS:
        supported = ", ".join(sorted(_SUPPORTED_PLATFORMS))
        return {"ok": False, "error": f"platform must be one of: {supported}"}
    if not message_text:
        return {"ok": False, "error": "message_text is required"}

    # email and sms go straight to URL — no desktop app search makes sense
    automation_platforms = _SUPPORTED_PLATFORMS - {"email", "sms"}

    if not prefer_deep_link and platform_name in automation_platforms:
        if platform_name == "whatsapp":
            try:
                from actions.whatsapp_tool import try_send_whatsapp_cloud

                cloud_ok, cloud_err, _cloud_data = try_send_whatsapp_cloud(recipient, message_text)
                if cloud_ok:
                    return {
                        "ok": True,
                        "data": {
                            "method": "whatsapp_cloud_api",
                            "platform": platform_name,
                            "recipient": recipient,
                            "hint": "Message sent via WhatsApp Business Cloud API.",
                        },
                    }
                if cloud_err and cloud_err not in (
                    "cloud_api_not_configured",
                    "cloud_api_needs_phone_number",
                ):
                    logger.info("whatsapp cloud send failed (%s); trying desktop", cloud_err)
            except Exception as exc:
                logger.info("whatsapp cloud path unavailable: %s", exc)

        try:
            ok, err = _send_for_platform(platform_name, recipient, message_text)
            if ok:
                return {
                    "ok": True,
                    "data": {
                        "method": "desktop_automation",
                        "platform": platform_name,
                        "recipient": recipient,
                        "hint": (
                            "App was opened, contact searched, and message sent. "
                            "Verify the right conversation was in focus."
                        ),
                    },
                }
            logger.info("desktop send failed (%s); trying deep link", err)
        except RuntimeError as exc:
            # pyautogui / clipboard not available — skip straight to fallback
            logger.info("desktop automation unavailable: %s", exc)

    url, url_err = _fallback_url(
        platform_name, recipient, message_text, mail_subject
    )
    if url and _open_url(url):
        return {
            "ok": True,
            "data": {
                "method": "deep_link",
                "platform": platform_name,
                "url": url,
                "hint": "Composer opened via URL — tap Send in the app if needed.",
            },
        }

    # last resort: clipboard
    try:
        _copy_to_clipboard(message_text)
        clipboard_ok = True
    except Exception:
        clipboard_ok = False

    return {
        "ok": clipboard_ok,
        "data": {
            "method": "clipboard_fallback",
            "platform": platform_name,
            "url_attempted": url,
            "url_error": url_err,
            "clipboard": clipboard_ok,
            "hint": "Message copied to clipboard — paste it manually.",
        },
        **({"error": url_err} if url_err and not clipboard_ok else {}),
    }


# ── keep old URL-builder helpers importable for tests ────────────────────────

def build_whatsapp_url(recipient: str, message_text: str) -> tuple[str | None, str | None]:
    return _whatsapp_url(recipient, message_text)


def build_telegram_url(recipient: str, message_text: str) -> tuple[str | None, str | None]:
    return _telegram_url(recipient, message_text)


def build_mailto_url(
    recipient: str, message_text: str, subject: str = ""
) -> tuple[str | None, str | None]:
    return _mailto_url(recipient, message_text, subject)


def build_url_for_platform(
    platform_name: str,
    recipient: str,
    message_text: str,
    *,
    mail_subject: str = "",
) -> tuple[str | None, str | None]:
    return _fallback_url(platform_name, recipient, message_text, mail_subject)


def open_url_cross_platform(url: str) -> tuple[bool, str]:
    ok = _open_url(url)
    return ok, ("" if ok else "OS URL handler failed")


def copy_text_to_clipboard(text: str) -> bool:
    try:
        _copy_to_clipboard(text)
        return True
    except Exception:
        return False


def try_desktop_paste_automation() -> tuple[bool, str]:
    try:
        pg = _require_pyautogui()
        _paste_hotkey(pg)
        return True, ""
    except Exception as exc:
        return False, str(exc)

/**
 * Shared primitives for the AI self-connect autopilot, independent of which
 * browser surface drives the page (system Chrome via CDP, or an Electron window).
 *
 * - SNAPSHOT_JS: collects visible interactive elements and tags each with a ref.
 * - buildActionJs: JS that performs one action (click/type/select) against a ref.
 * - requestNextAction: asks the backend brain for the next action.
 * - sendProgress: forwards progress to the renderer for user-facing status.
 */

const state = require("../state");
const { BACKEND_PORT } = require("../constants");

const MAX_STEPS = 14;
const MAX_ITERATIONS = 48;
const DECISION_TIMEOUT_MS = 20000;
const POST_ACTION_DELAY_MS = 500;
// How long we wait for the user to clear a human-only gate (sign-in / 2FA / captcha)
// before giving up and leaving the page for them to finish manually.
const USER_GATE_TIMEOUT_MS = 4 * 60 * 1000;

/** Collects visible interactive elements and tags each with a stable ref attribute. */
const SNAPSHOT_JS = `(() => {
  const out = [];
  let ref = 0;
  const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="link"], [role="switch"], [role="menuitem"], [tabindex]';
  const seen = new Set();
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible = rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > 0.05;
    if (!visible) continue;
    el.setAttribute('data-autopilot-ref', String(ref));
    out.push({
      ref,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 160),
      text: (el.innerText || '').trim().slice(0, 160),
      ariaLabel: (el.getAttribute('aria-label') || '').slice(0, 160),
      placeholder: (el.getAttribute('placeholder') || '').slice(0, 160),
    });
    ref += 1;
    if (ref > 120) break;
  }
  return { url: location.href, elements: out };
})()`;

/** Builds the JS that performs a single action against a ref-tagged element. */
function buildActionJs(action) {
  const ref = JSON.stringify(String(action.ref));
  const value = JSON.stringify(action.value == null ? "" : String(action.value));
  return `(() => {
    const el = document.querySelector('[data-autopilot-ref=' + JSON.stringify(${ref}) + ']');
    if (!el) return { ok: false, reason: 'element_gone' };
    el.scrollIntoView({ block: 'center' });
    const type = ${JSON.stringify(action.type)};
    if (type === 'type') {
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value');
      if (setter && setter.set) setter.set.call(el, ${value}); else el.value = ${value};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }
    if (type === 'select') {
      if (el.tagName.toLowerCase() === 'select') {
        el.value = ${value};
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.click();
      }
      return { ok: true };
    }
    el.click();
    return { ok: true };
  })()`;
}

/** Forward an autopilot status/needsUser event to the renderer (best-effort). */
function sendProgress(channel, detail) {
  const win = state.mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, detail);
  }
}

/**
 * Ask the backend brain for the next browser action.
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
 */
async function requestNextAction({ providerId, label, snapshot, screenshotB64, history }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);
  const headers = { "Content-Type": "application/json" };
  if (state.appToken) headers["X-App-Token"] = state.appToken;
  try {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/web-nav/next-action`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        provider: label || providerId,
        goal: `Authorize and connect ${label || providerId} to this app. Approve the requested access and finish.`,
        url: snapshot.url,
        elements: snapshot.elements,
        screenshot_b64: screenshotB64,
        history,
      }),
    });
    if (!res.ok) return { ok: false, error: `web-nav http_${res.status}` };
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "web-nav request failed" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  MAX_STEPS,
  MAX_ITERATIONS,
  POST_ACTION_DELAY_MS,
  USER_GATE_TIMEOUT_MS,
  SNAPSHOT_JS,
  buildActionJs,
  sendProgress,
  requestNextAction,
};

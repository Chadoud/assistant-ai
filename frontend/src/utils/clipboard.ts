/**
 * Copy text to the clipboard, working in both browsers and Electron.
 *
 * The async Clipboard API (`navigator.clipboard.writeText`) is the preferred path,
 * but it silently rejects in Electron renderers that lack the clipboard-write
 * permission or when the document is not focused. In those cases we fall back to a
 * hidden `<textarea>` + `document.execCommand("copy")`, which still works there.
 *
 * @param text Text to place on the clipboard.
 * @returns `true` when the text was copied, `false` when every strategy failed.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }
  return copyViaExecCommand(text);
}

function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Keep it out of view and unscrollable, but still selectable.
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

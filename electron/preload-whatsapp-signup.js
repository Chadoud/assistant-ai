const { contextBridge, ipcRenderer } = require("electron");

const META_MESSAGE_ORIGINS = new Set(["https://www.facebook.com", "https://business.facebook.com"]);

/** @param {MessageEvent} event */
function handleMetaPostMessage(event) {
  if (!META_MESSAGE_ORIGINS.has(event.origin)) return;
  let data = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return;
    }
  }
  if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;

  const payload = data.data && typeof data.data === "object" ? data.data : {};
  const eventName = typeof data.event === "string" ? data.event : "";

  if (eventName === "FINISH" || eventName === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    const finishCode = typeof payload.code === "string" ? payload.code.trim() : "";
    ipcRenderer.send("whatsapp-embedded-signup:complete", {
      code: finishCode,
      status: "connected",
      codeSource: finishCode ? "embedded_finish" : undefined,
      session: {
        phone_number_id: payload.phone_number_id,
        waba_id: payload.waba_id,
        display_phone_number: payload.display_phone_number,
      },
    });
    return;
  }

  if (eventName === "CANCEL") {
    ipcRenderer.send("whatsapp-embedded-signup:complete", { status: "not_authorized" });
    return;
  }

  if (eventName === "ERROR") {
    ipcRenderer.send("whatsapp-embedded-signup:complete", {
      status: "oauth_error",
      oauthError:
        typeof payload.error_message === "string"
          ? payload.error_message
          : typeof payload.message === "string"
            ? payload.message
            : "Meta signup error",
    });
  }
}

window.addEventListener("message", handleMetaPostMessage);

contextBridge.exposeInMainWorld("whatsappSignupApi", {
  complete: (payload) => ipcRenderer.send("whatsapp-embedded-signup:complete", payload),
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTEGRATION_CLIENT_ACTION_EVENT,
  dispatchIntegrationClientAction,
  dispatchIntegrationClientActionFromSsePayload,
  handleIntegrationClientAction,
} from "./integrationClientActions";
import { OPEN_WHATSAPP_SETUP_SESSION_KEY } from "../constants";

function installSessionStorageMock(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    configurable: true,
  });
}

function installWindowEventMock(): void {
  const listeners = new Map<string, Set<EventListener>>();
  vi.stubGlobal("window", {
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  });
}

describe("integrationClientActions", () => {
  beforeEach(() => {
    installSessionStorageMock();
    installWindowEventMock();
    sessionStorage.clear();
  });

  it("dispatches a custom event with manage_connection detail", () => {
    const handler = vi.fn();
    window.addEventListener(INTEGRATION_CLIENT_ACTION_EVENT, handler);

    dispatchIntegrationClientAction({
      action: "open_whatsapp_setup",
      providerId: "whatsapp",
      providerLabel: "WhatsApp",
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      action: "open_whatsapp_setup",
      providerId: "whatsapp",
      providerLabel: "WhatsApp",
    });

    window.removeEventListener(INTEGRATION_CLIENT_ACTION_EVENT, handler);
  });

  it("parses client_action from SSE payload and dispatches", () => {
    const handler = vi.fn();
    window.addEventListener(INTEGRATION_CLIENT_ACTION_EVENT, handler);

    dispatchIntegrationClientActionFromSsePayload({
      client_action: {
        action: "integration_connect",
        provider_id: "slack",
        provider_label: "Slack",
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      action: "integration_connect",
      providerId: "slack",
      providerLabel: "Slack",
    });

    window.removeEventListener(INTEGRATION_CLIENT_ACTION_EVENT, handler);
  });

  it("ignores malformed SSE client_action payloads", () => {
    const handler = vi.fn();
    window.addEventListener(INTEGRATION_CLIENT_ACTION_EVENT, handler);

    dispatchIntegrationClientActionFromSsePayload({});
    dispatchIntegrationClientActionFromSsePayload({ client_action: { action: "integration_connect" } });
    dispatchIntegrationClientActionFromSsePayload({
      client_action: { provider_id: "slack" },
    });

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(INTEGRATION_CLIENT_ACTION_EVENT, handler);
  });

  it("opens External sources and queues WhatsApp setup", () => {
    const requestTab = vi.fn();
    const runIntegrationAction = vi.fn();

    handleIntegrationClientAction({
      detail: {
        action: "open_whatsapp_setup",
        providerId: "whatsapp",
        providerLabel: "WhatsApp",
      },
      requestTab,
      runIntegrationAction,
    });

    expect(requestTab).toHaveBeenCalledWith("sources");
    expect(sessionStorage.getItem(OPEN_WHATSAPP_SETUP_SESSION_KEY)).toBe("1");
    expect(runIntegrationAction).not.toHaveBeenCalled();
  });

  it("delegates OAuth connect/disconnect to runIntegrationAction", () => {
    const requestTab = vi.fn();
    const runIntegrationAction = vi.fn().mockResolvedValue(undefined);

    handleIntegrationClientAction({
      detail: {
        action: "integration_connect",
        providerId: "google-gmail",
        providerLabel: "Gmail",
      },
      requestTab,
      runIntegrationAction,
    });

    expect(runIntegrationAction).toHaveBeenCalledWith(
      "integration_connect",
      "google-gmail",
      "Gmail",
    );
    expect(requestTab).not.toHaveBeenCalled();
  });
});

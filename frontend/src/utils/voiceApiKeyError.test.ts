import { describe, expect, it } from "vitest";
import { isFatalVoiceApiKeyError } from "./voiceApiKeyError";

describe("isFatalVoiceApiKeyError", () => {
  it("detects explicit API key rejection messages", () => {
    expect(
      isFatalVoiceApiKeyError(
        "API key not valid. Please pass a valid API key in Settings → AI Provider.",
      ),
    ).toBe(true);
  });

  it("does not treat bare WebSocket 1007 as auth failure", () => {
    expect(isFatalVoiceApiKeyError("WebSocket closed with code 1007: invalid payload")).toBe(false);
  });

  it("treats 1007 together with api key wording as auth failure", () => {
    expect(isFatalVoiceApiKeyError("1007 API key not valid")).toBe(true);
  });
});

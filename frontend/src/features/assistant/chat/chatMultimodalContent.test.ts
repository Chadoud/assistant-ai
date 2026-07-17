import { describe, expect, it } from "vitest";
import { conversationMessageToChatContent, parseImageDataUrl } from "./chatMultimodalContent";

describe("parseImageDataUrl", () => {
  it("parses png data urls", () => {
    const parsed = parseImageDataUrl("data:image/png;base64,YWJj");
    expect(parsed).toEqual({ mime: "image/png", data: "YWJj" });
  });

  it("rejects non-data urls", () => {
    expect(parseImageDataUrl("https://example.com/a.png")).toBeNull();
  });
});

describe("conversationMessageToChatContent", () => {
  it("returns plain text without attachment", () => {
    expect(
      conversationMessageToChatContent({
        id: "1",
        role: "user",
        content: "hello",
      }),
    ).toBe("hello");
  });

  it("returns multimodal parts when imageAttachment is set", () => {
    const parts = conversationMessageToChatContent({
      id: "1",
      role: "user",
      content: "What is this?",
      imageAttachment: {
        name: "shot.png",
        dataUrl: "data:image/png;base64,YWJjZGVm",
      },
    });
    expect(parts).toEqual([
      { type: "text", text: "What is this?" },
      { type: "image", mime_type: "image/png", data: "YWJjZGVm" },
    ]);
  });
});

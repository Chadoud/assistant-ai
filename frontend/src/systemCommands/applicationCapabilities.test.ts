import { describe, it, expect } from "vitest";
import {
  APPLICATION_KEY_CATEGORY,
  assertApplicationKeysAlignedWithCategories,
  categoryForApplicationKey,
} from "./applicationCapabilities";

describe("applicationCapabilities", () => {
  it("stays aligned with knownApplicationKeys (every key categorized, no extras)", () => {
    expect(() => assertApplicationKeysAlignedWithCategories()).not.toThrow();
  });

  it("exposes category for representative keys across groups", () => {
    expect(categoryForApplicationKey("vlc")).toBe("media");
    expect(categoryForApplicationKey("chrome")).toBe("browser");
    expect(categoryForApplicationKey("vscode")).toBe("development");
    expect(categoryForApplicationKey("steam")).toBe("games");
    expect(categoryForApplicationKey("winword")).toBe("office");
    expect(APPLICATION_KEY_CATEGORY["notepad"]).toBe("system");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { clearBreadcrumbsForTests, getBreadcrumbs, pushBreadcrumb } from "./breadcrumbs";

describe("breadcrumbs", () => {
  afterEach(() => {
    clearBreadcrumbsForTests();
  });

  it("caps at 30 entries", () => {
    for (let i = 0; i < 35; i += 1) {
      pushBreadcrumb({ type: "ui", action: `action_${i}` });
    }
    expect(getBreadcrumbs()).toHaveLength(30);
    expect(getBreadcrumbs()[0]?.action).toBe("action_5");
  });

  it("scrubs paths and drops unknown meta keys", () => {
    pushBreadcrumb({
      type: "tool",
      action: "send_message_started",
      meta: {
        platform: "whatsapp_desktop",
        prompt: "secret",
        path: "/Users/me/secret.txt",
      },
    });
    const crumb = getBreadcrumbs()[0];
    expect(crumb?.meta?.platform).toBe("whatsapp_desktop");
    expect(crumb?.meta).not.toHaveProperty("prompt");
    expect(crumb?.meta).not.toHaveProperty("path");
  });
});

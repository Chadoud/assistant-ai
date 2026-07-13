import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyIntent } from "../systemCommands/assistantIntent";
import frontendGolden from "./assistantIntentGolden.json";

const backendGoldenPath = resolve(
  import.meta.dirname,
  "../../../backend/tests/fixtures/assistant_intent_golden.json",
);

describe("assistant intent golden parity", () => {
  it("frontend fixture matches backend fixture", () => {
    const backend = JSON.parse(readFileSync(backendGoldenPath, "utf8"));
    expect(frontendGolden).toEqual(backend);
  });

  it.each(frontendGolden as Array<{ text: string; previous: string | null; intent: string }>)(
    "classifyIntent($text) → $intent",
    ({ text, previous, intent }) => {
      expect(classifyIntent(text, previous)).toBe(intent);
    },
  );
});

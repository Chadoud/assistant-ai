import { describe, expect, it } from "vitest";
import golden from "./voiceTranscriptGolden.json";
import {
  isJunkVoiceTranscript,
  isVoiceTranscriptNoisePlaceholder,
} from "./voiceTranscriptQuality";

describe("voiceTranscriptGolden", () => {
  it("matches backend junk vectors", () => {
    for (const row of golden) {
      expect(isJunkVoiceTranscript(row.text)).toBe(row.junk);
    }
  });

  it("matches backend noise-placeholder vectors", () => {
    for (const row of golden) {
      if (row.noisePlaceholder === undefined) continue;
      expect(isVoiceTranscriptNoisePlaceholder(row.text)).toBe(row.noisePlaceholder);
    }
  });
});

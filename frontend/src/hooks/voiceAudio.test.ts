import { describe, expect, it } from "vitest";
import { FREQ_BAND_COUNT, bandsFromFreqBytes, rmsOfInt16Pcm } from "./voiceAudio";

/** Build an ArrayBuffer of Int16 PCM samples for the RMS helper. */
function int16Buffer(samples: number[]): ArrayBuffer {
  return Int16Array.from(samples).buffer;
}

describe("rmsOfInt16Pcm — barge-in energy detection", () => {
  it("is zero for an empty frame", () => {
    expect(rmsOfInt16Pcm(new Int16Array([]).buffer)).toBe(0);
  });

  it("is zero for pure silence", () => {
    expect(rmsOfInt16Pcm(int16Buffer([0, 0, 0, 0]))).toBe(0);
  });

  it("approaches 1 for a full-scale signal", () => {
    const fullScale = int16Buffer([32767, -32768, 32767, -32768]);
    expect(rmsOfInt16Pcm(fullScale)).toBeGreaterThan(0.99);
  });

  it("rises monotonically with amplitude", () => {
    const quiet = rmsOfInt16Pcm(int16Buffer([1000, -1000, 1000, -1000]));
    const loud = rmsOfInt16Pcm(int16Buffer([20000, -20000, 20000, -20000]));
    expect(loud).toBeGreaterThan(quiet);
  });
});

describe("bandsFromFreqBytes — visualizer spectrum mapping", () => {
  it("produces exactly FREQ_BAND_COUNT bands", () => {
    const bands = bandsFromFreqBytes(new Uint8Array(256));
    expect(bands).toHaveLength(FREQ_BAND_COUNT);
  });

  it("maps all-zero FFT bytes to all-zero bands", () => {
    const bands = bandsFromFreqBytes(new Uint8Array(256));
    expect(bands.every((b) => b === 0)).toBe(true);
  });

  it("normalises a full-energy spectrum to ~1 per band", () => {
    const bands = bandsFromFreqBytes(new Uint8Array(256).fill(255));
    expect(bands.every((b) => b > 0.99 && b <= 1.0001)).toBe(true);
  });
});

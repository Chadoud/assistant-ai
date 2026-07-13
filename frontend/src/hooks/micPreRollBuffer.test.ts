import { describe, expect, it } from "vitest";
import { MicPreRollBuffer } from "./micPreRollBuffer";

describe("MicPreRollBuffer", () => {
  it("drops oldest chunks when over capacity", () => {
    const buffer = new MicPreRollBuffer(2);
    const first = new ArrayBuffer(4);
    const second = new ArrayBuffer(4);
    const third = new ArrayBuffer(4);
    buffer.push(first);
    buffer.push(second);
    buffer.push(third);
    expect(buffer.drain()).toEqual([second, third]);
  });

  it("clear removes buffered audio without returning it", () => {
    const buffer = new MicPreRollBuffer(4);
    buffer.push(new ArrayBuffer(4));
    buffer.clear();
    expect(buffer.drain()).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { hasAsciiControlOrDel } from "./controlChars";

describe("hasAsciiControlOrDel", () => {
  it("rejects DEL and C0", () => {
    expect(hasAsciiControlOrDel("x\u007fy")).toBe(true);
    expect(hasAsciiControlOrDel("a\u0000b")).toBe(true);
  });

  it("accepts normal visible strings", () => {
    expect(hasAsciiControlOrDel("hello:world")).toBe(false);
  });
});

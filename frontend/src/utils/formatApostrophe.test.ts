import { describe, expect, it } from "vitest";
import { formatIntegerApostropheThousands } from "./format";

describe("formatIntegerApostropheThousands", () => {
  it("leaves values under 1000 unchanged", () => {
    expect(formatIntegerApostropheThousands(0)).toBe("0");
    expect(formatIntegerApostropheThousands(999)).toBe("999");
  });

  it("uses apostrophe for thousands and above", () => {
    expect(formatIntegerApostropheThousands(1000)).toBe("1'000");
    expect(formatIntegerApostropheThousands(28151)).toBe("28'151");
    expect(formatIntegerApostropheThousands(1234567)).toBe("1'234'567");
  });
});

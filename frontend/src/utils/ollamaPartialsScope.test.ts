import { describe, expect, it } from "vitest";
import { filterPartialsForSortChat, filterPartialsForVision, sumPartialBytes } from "./ollamaPartialsScope";
import type { ModelStoragePartial } from "../api";

function row(
  digest: string,
  related?: string[]
): ModelStoragePartial & { related_models?: string[] } {
  return {
    group_id: digest,
    digest_prefix: digest,
    total_bytes: 100,
    file_count: 1,
    related_models: related,
  };
}

describe("ollamaPartialsScope", () => {
  it("sends unknown partials to sort/chat only", () => {
    const u = row("sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", []);
    expect(filterPartialsForSortChat([u])).toHaveLength(1);
    expect(filterPartialsForVision([u])).toHaveLength(0);
  });

  it("splits by vision vs text related models", () => {
    const vis = row(
      "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ["llava:7b"]
    );
    const txt = row(
      "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      ["mistral:latest"]
    );
    expect(filterPartialsForSortChat([vis, txt])).toEqual([txt]);
    expect(filterPartialsForVision([vis, txt])).toEqual([vis]);
  });

  it("sumPartialBytes sums rows", () => {
    expect(sumPartialBytes([row("sha256-a", []), row("sha256-b", [])])).toBe(200);
  });
});

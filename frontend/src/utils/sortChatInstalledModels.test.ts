import { describe, expect, it } from "vitest";
import {
  effectiveModelsForDownloadUi,
  resolveSortModelDisplayName,
  sortChatInstalledDisplayModels,
} from "./sortChatInstalledModels";

describe("sortChatInstalledDisplayModels", () => {
  it("returns non-vision models from Ollama only when settings sort is empty", () => {
    expect(sortChatInstalledDisplayModels(["mistral:latest", "llava:13b"], "")).toEqual(["mistral:latest"]);
  });

  it("appends settings sort model when it is text and missing from Ollama list", () => {
    expect(sortChatInstalledDisplayModels(["llava:13b"], "mistral:latest")).toEqual(["mistral:latest"]);
  });

  it("does not duplicate when settings model matches a listed model", () => {
    expect(sortChatInstalledDisplayModels(["mistral:latest"], "mistral:latest")).toEqual(["mistral:latest"]);
  });

  it("does not append vision-only settings pick", () => {
    expect(sortChatInstalledDisplayModels(["mistral:latest"], "llava:13b")).toEqual(["mistral:latest"]);
  });
});

describe("resolveSortModelDisplayName", () => {
  it("returns full gateway id when settings use a short alias", () => {
    expect(resolveSortModelDisplayName(["mistral:latest", "nomic-embed-text"], "mistral")).toBe(
      "mistral:latest",
    );
  });

  it("skips embedding models from the cloud list", () => {
    expect(resolveSortModelDisplayName(["nomic-embed-text"], "")).toBe("mistral");
  });
});

describe("effectiveModelsForDownloadUi", () => {
  it("merges settings picks when Ollama list is empty", () => {
    expect(effectiveModelsForDownloadUi([], "mistral:latest", "llava:7b")).toEqual([
      "mistral:latest",
      "llava:7b",
    ]);
  });

  it("dedupes with normalizeModel", () => {
    expect(effectiveModelsForDownloadUi(["mistral:latest"], "mistral", "")).toEqual(["mistral:latest"]);
  });
});

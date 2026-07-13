"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("node:test");
const { stripAiKeysFromEnvFile } = require("./backendAiSecrets");

describe("stripAiKeysFromEnvFile", () => {
  it("removes provider API keys but keeps unrelated entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-secrets-strip-"));
    const envPath = path.join(dir, ".env");
    try {
      fs.writeFileSync(
        envPath,
        [
          "FOO=bar",
          "GEMINI_API_KEY=legacy-gemini",
          "OPENAI_API_KEY=legacy-openai",
          "CUSTOM_BASE_URL=https://example.com/v1",
        ].join("\n") + "\n",
        "utf8",
      );
      stripAiKeysFromEnvFile(envPath);
      const text = fs.readFileSync(envPath, "utf8");
      assert.match(text, /^FOO=bar/m);
      assert.doesNotMatch(text, /GEMINI_API_KEY=/);
      assert.doesNotMatch(text, /OPENAI_API_KEY=/);
      assert.doesNotMatch(text, /CUSTOM_BASE_URL=/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("node:test");
const { stripAiKeysFromEnvFile, migrateAiKeysFromWritableEnv } = require("./backendAiSecrets");
const secretsStore = require("./secretsStore");

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

describe("migrateAiKeysFromWritableEnv", () => {
  it("imports from extraEnvPaths into safeStorage and does not strip that file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-secrets-migrate-"));
    const userData = path.join(dir, "userData");
    const backendEnv = path.join(dir, "backend.env");
    const prevGet = secretsStore.getSecret;
    const prevSet = secretsStore.setSecret;
    const mem = new Map();
    try {
      fs.mkdirSync(userData);
      fs.writeFileSync(backendEnv, "GEMINI_API_KEY=legacy-from-backend\nFOO=keep\n", "utf8");
      secretsStore.getSecret = (key) => mem.get(key) || "";
      secretsStore.setSecret = (key, value) => {
        mem.set(key, value);
        return { ok: true };
      };

      const result = migrateAiKeysFromWritableEnv(userData, { extraEnvPaths: [backendEnv] });
      assert.equal(result.migrated, true);
      assert.equal(mem.get("geminiApiKey"), "legacy-from-backend");
      assert.match(fs.readFileSync(backendEnv, "utf8"), /GEMINI_API_KEY=legacy-from-backend/);
      assert.match(fs.readFileSync(backendEnv, "utf8"), /FOO=keep/);
    } finally {
      secretsStore.getSecret = prevGet;
      secretsStore.setSecret = prevSet;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

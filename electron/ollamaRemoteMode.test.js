"use strict";

const assert = require("node:assert/strict");
const { describe, it, beforeEach, afterEach } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_KEYS = [
  "OLLAMA_MODE",
  "EXOSITES_REMOTE_LLM",
  "EXOSITES_SKIP_CLOUD_AUTH",
  "EXOSITES_CLOUD_URL",
];

function loadOllama() {
  delete require.cache[require.resolve("./ollama")];
  return require("./ollama");
}

describe("isRemoteOllamaMode", () => {
  /** @type {Record<string, string | undefined>} */
  let savedEnv = {};

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    delete require.cache[require.resolve("./ollama")];
    delete require.cache[require.resolve("./cloudAuth")];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve("./ollama")];
    delete require.cache[require.resolve("./cloudAuth")];
  });

  it("defaults to remote when env is unset", () => {
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), true);
  });

  it("returns false only when OLLAMA_MODE=local", () => {
    process.env.OLLAMA_MODE = "local";
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), false);
  });

  it("returns true when OLLAMA_MODE=remote", () => {
    process.env.OLLAMA_MODE = "remote";
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), true);
  });

  it("returns true when EXOSITES_REMOTE_LLM=1", () => {
    process.env.EXOSITES_REMOTE_LLM = "1";
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), true);
  });

  it("returns true when cloud auth gate is enabled via EXOSITES_CLOUD_URL", () => {
    process.env.EXOSITES_CLOUD_URL = "https://api.exosites.ch";
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), true);
  });

  it("stays remote when cloud auth is skipped unless OLLAMA_MODE=local", () => {
    process.env.EXOSITES_SKIP_CLOUD_AUTH = "1";
    process.env.EXOSITES_CLOUD_URL = "https://api.exosites.ch";
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), true);
  });

  it("returns false when OLLAMA_MODE=local even if cloud auth is enabled", () => {
    process.env.OLLAMA_MODE = "local";
    process.env.EXOSITES_CLOUD_URL = "https://api.exosites.ch";
    const { isRemoteOllamaMode } = loadOllama();
    assert.equal(isRemoteOllamaMode(), false);
  });

  it("returns true when cloud sort credentials are persisted in overrides", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-ollama-test-"));
    const overridesPath = path.join(dir, "backend_env_overrides.json");
    fs.writeFileSync(
      overridesPath,
      JSON.stringify({
        OLLAMA_MODE: "remote",
        EXOSITES_SORT_CREDENTIALS_MANAGED: "1",
      })
    );

    const backendEnvOverrides = require("./backendEnvOverrides");
    const originalReadRaw = backendEnvOverrides.readBackendEnvOverridesRaw;
    backendEnvOverrides.readBackendEnvOverridesRaw = () =>
      JSON.parse(fs.readFileSync(overridesPath, "utf8"));

    try {
      const { isRemoteOllamaMode } = loadOllama();
      assert.equal(isRemoteOllamaMode(), true);
    } finally {
      backendEnvOverrides.readBackendEnvOverridesRaw = originalReadRaw;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

"use strict";

const assert = require("assert");
const { describe, it, before, after } = require("node:test");

describe("sortCredentialsBaseUrl", () => {
  const prevUrl = process.env.EXOSITES_SORT_CREDENTIALS_URL;
  const prevCloud = process.env.EXOSITES_CLOUD_URL;

  after(() => {
    if (prevUrl === undefined) delete process.env.EXOSITES_SORT_CREDENTIALS_URL;
    else process.env.EXOSITES_SORT_CREDENTIALS_URL = prevUrl;
    if (prevCloud === undefined) delete process.env.EXOSITES_CLOUD_URL;
    else process.env.EXOSITES_CLOUD_URL = prevCloud;
  });

  it("defaults to LLM gateway, not api.exosites.ch", () => {
    delete process.env.EXOSITES_SORT_CREDENTIALS_URL;
    process.env.EXOSITES_CLOUD_URL = "https://api.exosites.ch";
    delete require.cache[require.resolve("./cloudAuth")];
    const { sortCredentialsBaseUrl, cloudBaseUrl } = require("./cloudAuth");
    assert.strictEqual(cloudBaseUrl(), "https://api.exosites.ch");
    assert.strictEqual(sortCredentialsBaseUrl(), "https://llm-staging.exosites.ch");
  });

  it("honours EXOSITES_SORT_CREDENTIALS_URL override", () => {
    process.env.EXOSITES_SORT_CREDENTIALS_URL = "https://llm.exosites.ch";
    delete require.cache[require.resolve("./cloudAuth")];
    const { sortCredentialsBaseUrl } = require("./cloudAuth");
    assert.strictEqual(sortCredentialsBaseUrl(), "https://llm.exosites.ch");
  });
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

describe("sortCredentials remoteSortTokenWorks", () => {
  const originalFetch = global.fetch;

  after(() => {
    global.fetch = originalFetch;
  });

  it("returns true when gateway accepts the token", async () => {
    global.fetch = async (url, init) => {
      assert.equal(url, "https://llm-staging.exosites.ch/v1/models");
      assert.equal(init.headers.Authorization, "Bearer sk-test");
      return { status: 200 };
    };
    const { remoteSortTokenWorks } = require("./entitlement/sortCredentials");
    assert.equal(await remoteSortTokenWorks("https://llm-staging.exosites.ch", "sk-test"), true);
  });

  it("returns false on 401", async () => {
    global.fetch = async () => ({ status: 401 });
    const { remoteSortTokenWorks } = require("./entitlement/sortCredentials");
    assert.equal(await remoteSortTokenWorks("https://llm-staging.exosites.ch", "sk-stale"), false);
  });
});

describe("resolveCloudSortMaxConcurrency", () => {
  it("uses sort_max_concurrency from credentials payload", () => {
    const { resolveCloudSortMaxConcurrency } = require("./entitlement/sortCredentials");
    assert.equal(resolveCloudSortMaxConcurrency({ sort_max_concurrency: 2, llm_max_slots: 4 }), "2");
  });

  it("defaults to 1 and clamps to slot budget", () => {
    const { resolveCloudSortMaxConcurrency } = require("./entitlement/sortCredentials");
    assert.equal(resolveCloudSortMaxConcurrency({ llm_max_slots: 2 }), "1");
    assert.equal(resolveCloudSortMaxConcurrency({ sort_max_concurrency: 9, llm_max_slots: 2 }), "2");
  });
});

describe("shouldUseCachedCredentials", () => {
  it("returns false when force refresh requested", () => {
    const { shouldUseCachedCredentials } = require("./entitlement/sortCredentials");
    assert.equal(
      shouldUseCachedCredentials({
        force: true,
        meta: { expires_at: Date.now() + 10 * 60 * 1000 },
        tokenWorks: true,
        configRevisionStale: false,
      }),
      false
    );
  });

  it("returns false when broker config revision is stale", () => {
    const { shouldUseCachedCredentials } = require("./entitlement/sortCredentials");
    assert.equal(
      shouldUseCachedCredentials({
        force: false,
        meta: { expires_at: Date.now() + 10 * 60 * 1000 },
        tokenWorks: true,
        configRevisionStale: true,
      }),
      false
    );
  });

  it("returns true when token valid and config matches", () => {
    const { shouldUseCachedCredentials } = require("./entitlement/sortCredentials");
    assert.equal(
      shouldUseCachedCredentials({
        force: false,
        meta: { expires_at: Date.now() + 10 * 60 * 1000 },
        tokenWorks: true,
        configRevisionStale: false,
      }),
      true
    );
  });
});

describe("resolveCloudLlmMaxSlots", () => {
  it("uses max_parallel_requests from credentials payload", () => {
    const { resolveCloudLlmMaxSlots } = require("./entitlement/sortCredentials");
    assert.equal(resolveCloudLlmMaxSlots({ max_parallel_requests: 3 }), "3");
  });

  it("prefers llm_max_slots when present", () => {
    const { resolveCloudLlmMaxSlots } = require("./entitlement/sortCredentials");
    assert.equal(resolveCloudLlmMaxSlots({ llm_max_slots: 4, max_parallel_requests: 2 }), "4");
  });

  it("falls back to default when missing or invalid", () => {
    const { resolveCloudLlmMaxSlots } = require("./entitlement/sortCredentials");
    assert.equal(resolveCloudLlmMaxSlots({}), "2");
    assert.equal(resolveCloudLlmMaxSlots({ max_parallel_requests: 0 }), "2");
    assert.equal(resolveCloudLlmMaxSlots({ max_parallel_requests: 99 }), "8");
  });
});

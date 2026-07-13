const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCredentialsConfigRevision,
  buildSortCredentialsPublicConfig,
} = require("../sortCredentialsConfig");

describe("sortCredentialsConfig", () => {
  it("revision is stable for the same inputs", () => {
    const fields = {
      sort_service_mode: "cloud_full",
      sort_worker_url: "https://llm.example/v1/sort/worker",
      sort_llm_queue_enabled: "1",
      sort_llm_queue_in_credentials: "auto",
      sort_llm_max_parallel: 2,
      sort_cloud_sort_concurrency: 1,
      revision_salt: "",
    };
    const a = buildCredentialsConfigRevision(fields);
    const b = buildCredentialsConfigRevision(fields);
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{12}$/);
  });

  it("revision changes when sort_service_mode changes", () => {
    const base = {
      sort_service_mode: "cloud",
      sort_worker_url: "https://llm.example/v1/sort/worker",
      sort_llm_queue_enabled: "0",
      sort_llm_queue_in_credentials: "auto",
      sort_llm_max_parallel: 2,
      sort_cloud_sort_concurrency: 1,
      revision_salt: "",
    };
    const cloud = buildCredentialsConfigRevision(base);
    const full = buildCredentialsConfigRevision({ ...base, sort_service_mode: "cloud_full" });
    assert.notEqual(cloud, full);
  });

  it("buildSortCredentialsPublicConfig exposes revision", () => {
    const prev = process.env.SORT_SERVICE_MODE;
    process.env.SORT_SERVICE_MODE = "cloud";
    try {
      const config = buildSortCredentialsPublicConfig();
      assert.equal(config.sort_service_mode, "cloud");
      assert.match(config.credentials_config_revision, /^[a-f0-9]{12}$/);
    } finally {
      if (prev === undefined) delete process.env.SORT_SERVICE_MODE;
      else process.env.SORT_SERVICE_MODE = prev;
    }
  });
});

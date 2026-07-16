const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const { fetchFeed } = require("./fetchFeed");

function mockGet(handler) {
  return (url, opts, cb) => {
    const req = new EventEmitter();
    req.destroy = (err) => {
      if (err) req.emit("error", err);
    };
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.setEncoding = () => {};
    res.resume = () => {};
    queueMicrotask(() => {
      handler(url, opts || {}, res, req);
      if (typeof cb === "function") cb(res);
    });
    return req;
  };
}

test("fetchFeed parses 200 JSON and returns validators", async () => {
  const get = mockGet((_url, _opts, res) => {
    res.statusCode = 200;
    res.headers = { etag: '"abc"', "last-modified": "Wed, 01 Jan 2020 00:00:00 GMT" };
    queueMicrotask(() => {
      res.emit("data", JSON.stringify({ version: "1.2.3" }));
      res.emit("end");
    });
  });
  const out = await fetchFeed("https://example.test/latest.json", { get });
  assert.equal(out.status, 200);
  assert.equal(out.notModified, false);
  assert.deepEqual(out.feed, { version: "1.2.3" });
  assert.equal(out.etag, '"abc"');
});

test("fetchFeed handles 304 without body", async () => {
  const get = mockGet((_url, opts, res) => {
    assert.equal(opts.headers["If-None-Match"], '"etag1"');
    res.statusCode = 304;
    res.headers = { etag: '"etag1"' };
    queueMicrotask(() => res.resume());
  });
  const out = await fetchFeed("https://example.test/latest.json", {
    get,
    etag: '"etag1"',
  });
  assert.equal(out.status, 304);
  assert.equal(out.notModified, true);
  assert.equal(out.feed, null);
});

test("fetchFeed rejects HTTP errors", async () => {
  const get = mockGet((_url, _opts, res) => {
    res.statusCode = 503;
    queueMicrotask(() => res.resume());
  });
  await assert.rejects(
    () => fetchFeed("https://example.test/latest.json", { get }),
    /HTTP 503/
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyAttachmentExt } = require("./attachmentClassify");

test("classify images and heic", () => {
  assert.equal(classifyAttachmentExt(".png"), "image");
  assert.equal(classifyAttachmentExt(".HEIC"), "heic");
});

test("classify documents and text", () => {
  assert.equal(classifyAttachmentExt(".pdf"), "document");
  assert.equal(classifyAttachmentExt(".docx"), "document");
  assert.equal(classifyAttachmentExt(".txt"), "text");
});

test("classify video and binary", () => {
  assert.equal(classifyAttachmentExt(".mp4"), "video");
  assert.equal(classifyAttachmentExt(".exe"), "binary");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  verifyWebhookSignature,
  extractWebhookChanges,
  messageBodyPreview,
} = require("../lib/whatsappMeta");

test("verifyWebhookSignature accepts valid Meta signature", () => {
  const secret = "test-app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyWebhookSignature(secret, body, `sha256=${digest}`), true);
});

test("verifyWebhookSignature rejects tampered body", () => {
  const secret = "test-app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyWebhookSignature(secret, Buffer.from("{}"), `sha256=${digest}`), false);
});

test("extractWebhookChanges parses inbound message", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba123",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "pn123" },
              messages: [
                {
                  from: "41791234567",
                  id: "wamid.abc",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "Hello" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const changes = extractWebhookChanges(payload);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].phoneNumberId, "pn123");
  assert.equal(changes[0].messages.length, 1);
  assert.equal(messageBodyPreview(changes[0].messages[0]), "Hello");
});

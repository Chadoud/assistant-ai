const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("node:test");
const { googleCredentialsFromJsonPath } = require("./googleCredentialsJson");

describe("googleCredentialsFromJsonPath", () => {
  it("reads client_id and client_secret from installed block", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "google-creds-"));
    try {
      const jsonPath = path.join(root, "gmail_oauth_client.json");
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({
          installed: {
            client_id: "abc.apps.googleusercontent.com",
            client_secret: "GOCSPX-test-secret",
          },
        }),
        "utf8"
      );
      const creds = googleCredentialsFromJsonPath(jsonPath);
      assert.strictEqual(creds.clientId, "abc.apps.googleusercontent.com");
      assert.strictEqual(creds.clientSecret, "GOCSPX-test-secret");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads web block when installed is absent", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "google-creds-web-"));
    try {
      const jsonPath = path.join(root, "web_client.json");
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({
          web: {
            client_id: "web-id.apps.googleusercontent.com",
            client_secret: "web-secret",
          },
        }),
        "utf8"
      );
      const creds = googleCredentialsFromJsonPath(jsonPath);
      assert.strictEqual(creds.clientId, "web-id.apps.googleusercontent.com");
      assert.strictEqual(creds.clientSecret, "web-secret");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

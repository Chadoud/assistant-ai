"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("node:test");
const {
  parseDotenvFile,
  readGmailRelatedEnvForBackendSpawn,
  readInfomaniakTokenForElectronMain,
} = require("./readGmailDotenvForBackend");

describe("parseDotenvFile", () => {
  it("extracts Gmail keys and ignores unrelated keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parse-gmail-"));
    const p = path.join(dir, ".env");
    try {
      fs.writeFileSync(
        p,
        [
          "FOO=bar",
          "EXOSITES_GOOGLE_CLIENT_ID=id.apps.googleusercontent.com",
          'EXOSITES_GOOGLE_CLIENT_SECRET="GOCSPX-secret"',
          "EXOSITES_GMAIL_OAUTH_PORT=8789",
        ].join("\n"),
        "utf8"
      );
      const o = parseDotenvFile(p);
      assert.strictEqual(o.FOO, undefined);
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_ID, "id.apps.googleusercontent.com");
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_SECRET, "GOCSPX-secret");
      assert.strictEqual(o.EXOSITES_GMAIL_OAUTH_PORT, "8789");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extracts Infomaniak keys from .env", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parse-ik-"));
    const p = path.join(dir, ".env");
    try {
      fs.writeFileSync(
        p,
        [
          "EXOSITES_INFOMANIAK_CLIENT_ID=ik-client-id",
          "EXOSITES_INFOMANIAK_CLIENT_SECRET=ik-secret",
          "EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT=59999",
          "EXOSITES_INFOMANIAK_DRIVE_OAUTH_SCOPE=profile",
          "EXOSITES_INFOMANIAK_CALENDAR_OAUTH_SCOPE=profile",
        ].join("\n"),
        "utf8"
      );
      const o = parseDotenvFile(p);
      assert.strictEqual(o.EXOSITES_INFOMANIAK_CLIENT_ID, "ik-client-id");
      assert.strictEqual(o.EXOSITES_INFOMANIAK_CLIENT_SECRET, "ik-secret");
      assert.strictEqual(o.EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT, "59999");
      assert.strictEqual(o.EXOSITES_INFOMANIAK_DRIVE_OAUTH_SCOPE, "profile");
      assert.strictEqual(o.EXOSITES_INFOMANIAK_CALENDAR_OAUTH_SCOPE, "profile");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not include EXOSITES_INFOMANIAK_TOKEN in default backend key set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parse-ik-tok-"));
    const p = path.join(dir, ".env");
    try {
      fs.writeFileSync(p, "EXOSITES_INFOMANIAK_TOKEN=secret-should-not-go-to-backend-spawn\n", "utf8");
      const o = parseDotenvFile(p);
      assert.strictEqual(o.EXOSITES_INFOMANIAK_TOKEN, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readGmailRelatedEnvForBackendSpawn", () => {
  it("packaged: userData .env overrides resources .env", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-env-pack-"));
    try {
      const resourcesPath = path.join(root, "resources");
      const userData = path.join(root, "userData");
      fs.mkdirSync(resourcesPath, { recursive: true });
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(
        path.join(resourcesPath, ".env"),
        "EXOSITES_GOOGLE_CLIENT_ID=from-resources.apps.googleusercontent.com\nEXOSITES_GOOGLE_CLIENT_SECRET=res\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(userData, ".env"),
        "EXOSITES_GOOGLE_CLIENT_ID=from-userdata.apps.googleusercontent.com\n",
        "utf8"
      );
      const o = readGmailRelatedEnvForBackendSpawn({
        isDev: false,
        backendDir: path.join(root, "backend"),
        resourcesPath,
        userData,
      });
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_ID, "from-userdata.apps.googleusercontent.com");
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_SECRET, "res");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dev: reads backend/.env only", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-env-dev-"));
    try {
      const backendDir = path.join(root, "backend");
      fs.mkdirSync(backendDir, { recursive: true });
      fs.writeFileSync(
        path.join(backendDir, ".env"),
        "EXOSITES_GOOGLE_CLIENT_ID=dev-id.apps.googleusercontent.com\nEXOSITES_GOOGLE_CLIENT_SECRET=devsec\n",
        "utf8"
      );
      const o = readGmailRelatedEnvForBackendSpawn({
        isDev: true,
        backendDir,
        resourcesPath: path.join(root, "resources"),
        userData: path.join(root, "userData"),
      });
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_ID, "dev-id.apps.googleusercontent.com");
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_SECRET, "devsec");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not put EXOSITES_INFOMANIAK_TOKEN in backend spawn env object", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ik-tok-spawn-"));
    try {
      const backendDir = path.join(root, "backend");
      fs.mkdirSync(backendDir, { recursive: true });
      fs.writeFileSync(
        path.join(backendDir, ".env"),
        "EXOSITES_INFOMANIAK_TOKEN=only-for-electron\nEXOSITES_GOOGLE_CLIENT_ID=x.apps.googleusercontent.com\n",
        "utf8"
      );
      const o = readGmailRelatedEnvForBackendSpawn({
        isDev: true,
        backendDir,
        resourcesPath: path.join(root, "resources"),
        userData: path.join(root, "userData"),
      });
      assert.strictEqual(o.EXOSITES_INFOMANIAK_TOKEN, undefined);
      assert.strictEqual(o.EXOSITES_GOOGLE_CLIENT_ID, "x.apps.googleusercontent.com");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("readInfomaniakTokenForElectronMain", () => {
  it("reads EXOSITES_INFOMANIAK_TOKEN from backend/.env in dev", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ik-tok-main-"));
    try {
      const backendDir = path.join(root, "backend");
      fs.mkdirSync(backendDir, { recursive: true });
      fs.writeFileSync(
        path.join(backendDir, ".env"),
        'EXOSITES_INFOMANIAK_TOKEN="ik-bearer-value"\n',
        "utf8"
      );
      const t = readInfomaniakTokenForElectronMain({
        isDev: true,
        backendDir,
        resourcesPath: path.join(root, "resources"),
        userData: path.join(root, "userData"),
      });
      assert.strictEqual(t, "ik-bearer-value");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

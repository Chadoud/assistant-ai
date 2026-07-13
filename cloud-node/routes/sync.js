const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const { registerDevice, pushBlobs, pullBlobs, syncStatus } = require("../lib/syncRelay");

const router = express.Router();

router.get("/sync/status", requireAuth, async (req, res) => {
  try {
    return res.json(await syncStatus(req.accountId));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "sync_status_failed" });
  }
});

router.post("/sync/devices/register", requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || "Mobile").slice(0, 120);
    const platform = String(req.body?.platform || "ios").slice(0, 16);
    const pushToken = req.body?.push_token ? String(req.body.push_token).slice(0, 512) : null;
    const deviceId = req.body?.device_id ? String(req.body.device_id).slice(0, 36) : null;
    return res.json(await registerDevice(req.accountId, { name, platform, pushToken, deviceId }));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "register_device_failed" });
  }
});

router.post("/sync/blobs/push", requireAuth, async (req, res) => {
  try {
    const blobs = Array.isArray(req.body?.blobs) ? req.body.blobs : [];
    if (blobs.length > 500) {
      return res.status(400).json({ detail: "too_many_blobs" });
    }
    return res.json(await pushBlobs(req.accountId, blobs));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "push_failed" });
  }
});

router.get("/sync/blobs/pull", requireAuth, async (req, res) => {
  try {
    const cursor = Number.parseInt(String(req.query.cursor || "0"), 10) || 0;
    const limit = Math.min(Number.parseInt(String(req.query.limit || "200"), 10) || 200, 500);
    return res.json(await pullBlobs(req.accountId, cursor, limit));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "pull_failed" });
  }
});

module.exports = router;

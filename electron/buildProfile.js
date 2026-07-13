/**
 * Packaged build profile — read-only flags baked in at release time.
 * Unlimited builds ship `resources/unlimited-entitlement.marker` (see scripts/build-win-unlimited.ps1).
 */

const fs = require("fs");
const path = require("path");

const MARKER_NAME = "unlimited-entitlement.marker";

function resourcesRoot() {
  try {
    if (require("./constants").IS_DEV) {
      return path.join(__dirname, "resources");
    }
    return process.resourcesPath;
  } catch {
    return process.resourcesPath;
  }
}

/** True when this distributable was built without trial day limits. */
function isUnlimitedEntitlementBuild() {
  const explicit = String(process.env.EXOSITES_UNLIMITED_ENTITLEMENT || "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicit)) return true;
  try {
    return fs.existsSync(path.join(resourcesRoot(), MARKER_NAME));
  } catch {
    return false;
  }
}

module.exports = { isUnlimitedEntitlementBuild, MARKER_NAME };

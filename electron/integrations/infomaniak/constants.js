/** Infomaniak API endpoints and import limits (shared by kDrive OAuth flow). */

const {
  WORKSPACE_CLOUD_RECURSE_MAX_FILES,
  WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS,
} = require("../workspaceRecurseCaps");

const IK_AUTH = "https://login.infomaniak.com/authorize";
const IK_TOKEN = "https://login.infomaniak.com/token";
const IK_API = "https://api.infomaniak.com";

const IK_PAGE_SIZE = 100;
const IK_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const IK_METADATA_TIMEOUT_MS = 15_000;
const IK_DOWNLOAD_TIMEOUT_MS = 90_000;
const IK_RECURSE_MAX_DIRS = WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS;
const IK_RECURSE_MAX_FILES = WORKSPACE_CLOUD_RECURSE_MAX_FILES;

module.exports = {
  IK_AUTH,
  IK_TOKEN,
  IK_API,
  IK_PAGE_SIZE,
  IK_IMPORT_MAX_BYTES,
  IK_METADATA_TIMEOUT_MS,
  IK_DOWNLOAD_TIMEOUT_MS,
  IK_RECURSE_MAX_DIRS,
  IK_RECURSE_MAX_FILES,
};

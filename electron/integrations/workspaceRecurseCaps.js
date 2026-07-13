/**
 * Shared ceilings for recursive “walk the tree” cloud imports in the main process
 * (OneDrive, Box, iCloud local scan, Infomaniak kDrive, …).
 *
 * - File row cap must stay ≤ `backend/constants.py` `DRIVE_STREAM_PATH_CAP`.
 * - Must match `frontend/src/constants.ts` `WORKSPACE_CLOUD_RECURSE_MAX_FILES` /
 *   `WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS`.
 */

const WORKSPACE_CLOUD_RECURSE_MAX_FILES = 50_000;
const WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS = 2_000;

module.exports = {
  WORKSPACE_CLOUD_RECURSE_MAX_FILES,
  WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS,
};

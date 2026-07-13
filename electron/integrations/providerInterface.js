/**
 * Contract for cloud-import integration providers (P5-5.1.1).
 *
 * Google and Microsoft modules are not refactored onto this registry yet;
 * IPC handlers in `ipc/registerIntegrationCloudImportHandlers.js` still call
 * provider modules directly. New providers and the P5-5.1.2 refactor should
 * implement this interface and register via `registerProvider`.
 */

/** @type {readonly string[]} */
const INTEGRATION_PROVIDER_METHODS = Object.freeze([
  "listFiles",
  "importFiles",
  "getAuthStatus",
]);

/**
 * @typedef {object} IntegrationListFilesOptions
 * @property {string} [pageToken] Pagination cursor from a prior list response.
 * @property {number} [pageSize] Max items per page (provider-specific cap).
 * @property {string} [parentId] Folder or parent resource id.
 * @property {string} [path] Folder path (path-based providers).
 * @property {boolean} [recursive] When true, flatten descendants (if supported).
 */

/**
 * @typedef {object} IntegrationListFilesResult
 * @property {boolean} ok
 * @property {string} [reason] Present when `ok` is false.
 * @property {Array<Record<string, unknown>>} [files] File or item descriptors for the UI.
 * @property {string} [nextPageToken] Pagination cursor for the next `listFiles` call.
 */

/**
 * @typedef {object} IntegrationImportFilesOptions
 * @property {Array<string | Record<string, unknown>>} items Provider-specific file refs (ids, paths, or entry objects).
 * @property {string} [stagingDir] Reuse an existing staging directory from a prior import.
 */

/**
 * @typedef {object} IntegrationImportFilesResult
 * @property {boolean} ok
 * @property {string} [reason] Present when `ok` is false.
 * @property {string[]} [localPaths] Absolute paths under staging ready for `POST /analyze`.
 * @property {Array<{ id?: string, reason?: string }>} [failed] Per-item failures.
 * @property {string} [stagingDir] Directory containing downloaded files.
 */

/**
 * @typedef {object} IntegrationAuthStatusResult
 * @property {boolean} ok
 * @property {string} [reason] Present when `ok` is false.
 * @property {boolean} [connected] User has a valid session / token.
 * @property {boolean} [configured] OAuth client or credentials are present on this device.
 */

/**
 * @typedef {object} IntegrationProvider
 * @property {string} id Stable provider id (matches `providersCatalog` entry when applicable).
 * @property {(options: IntegrationListFilesOptions) => Promise<IntegrationListFilesResult>} listFiles
 * @property {(options: IntegrationImportFilesOptions) => Promise<IntegrationImportFilesResult>} importFiles
 * @property {() => Promise<IntegrationAuthStatusResult>} getAuthStatus
 */

/** @type {Map<string, IntegrationProvider>} */
const registry = new Map();

/**
 * @param {unknown} impl
 * @returns {impl is IntegrationProvider}
 */
function isIntegrationProvider(impl) {
  if (!impl || typeof impl !== "object") return false;
  for (const method of INTEGRATION_PROVIDER_METHODS) {
    if (typeof /** @type {Record<string, unknown>} */ (impl)[method] !== "function") {
      return false;
    }
  }
  const id = /** @type {Record<string, unknown>} */ (impl).id;
  return typeof id === "string" && id.trim().length > 0;
}

/**
 * Register a provider implementation. Overwrites any prior registration for the same name.
 * @param {string} name Registry key (usually matches `impl.id`).
 * @param {IntegrationProvider} impl
 * @throws {Error} When `name` is empty or `impl` does not satisfy the contract.
 */
function registerProvider(name, impl) {
  const key = typeof name === "string" ? name.trim() : "";
  if (!key) {
    throw new Error("registerProvider: name is required");
  }
  if (!isIntegrationProvider(impl)) {
    throw new Error(
      `registerProvider: "${key}" must implement ${INTEGRATION_PROVIDER_METHODS.join(", ")} and define a non-empty id`
    );
  }
  registry.set(key, impl);
}

/**
 * @param {string} name
 * @returns {IntegrationProvider | null}
 */
function getProvider(name) {
  const key = typeof name === "string" ? name.trim() : "";
  if (!key) return null;
  return registry.get(key) ?? null;
}

/** @returns {string[]} */
function listRegisteredProviders() {
  return [...registry.keys()];
}

module.exports = {
  INTEGRATION_PROVIDER_METHODS,
  registerProvider,
  getProvider,
  listRegisteredProviders,
  isIntegrationProvider,
};

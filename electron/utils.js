/** Shared utility functions for Electron main process modules. */

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { delay };

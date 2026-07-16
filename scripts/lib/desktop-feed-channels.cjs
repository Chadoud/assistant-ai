/**
 * Desktop update feed channels (single source of truth for URLs + default remote paths).
 */
"use strict";

const CHANNELS = {
  staging: {
    id: "staging",
    publicBase: "https://exosites.ch/downloads/exo-assistant-staging",
    defaultRemotePath: "./sites/exosites.ch/downloads/exo-assistant-staging",
  },
  stable: {
    id: "stable",
    publicBase: "https://exosites.ch/downloads/exo-assistant",
    defaultRemotePath: "./sites/exosites.ch/downloads/exo-assistant",
  },
  lkg: {
    id: "lkg",
    publicBase: "https://exosites.ch/downloads/exo-assistant-lkg",
    defaultRemotePath: "./sites/exosites.ch/downloads/exo-assistant-lkg",
  },
};

/**
 * @param {string} id
 */
function getChannel(id) {
  const key = String(id || "").trim().toLowerCase();
  const ch = CHANNELS[key];
  if (!ch) {
    throw new Error(`Unknown desktop feed channel: ${id} (use staging|stable|lkg)`);
  }
  return ch;
}

module.exports = { CHANNELS, getChannel };

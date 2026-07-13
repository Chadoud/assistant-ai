/** Best available BrowserWindow for native dialogs (main or focused). */

const { BrowserWindow } = require("electron");
const state = require("../state");

function getDialogWindow() {
  return state.mainWindow ?? BrowserWindow.getFocusedWindow();
}

module.exports = { getDialogWindow };

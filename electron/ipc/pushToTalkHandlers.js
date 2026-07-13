const { ipcMain } = require("electron");
const { registerPushToTalkHandlers } = require("../pushToTalk");

function registerPttHandlers() {
  registerPushToTalkHandlers(ipcMain);
}

module.exports = { registerPttHandlers };

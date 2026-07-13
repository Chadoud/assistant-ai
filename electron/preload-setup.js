const { contextBridge, ipcRenderer } = require("electron");

// Launch and OCR confirm need IPC — all UI updates are done via executeJavaScript
contextBridge.exposeInMainWorld("electronSetup", {
  launchApp:  () => ipcRenderer.invoke("setup:launchApp"),
  confirmOcr: (accepted) => ipcRenderer.invoke("setup:confirmOcr", accepted),
  retryOcr:   () => ipcRenderer.invoke("setup:retryOcr"),
});

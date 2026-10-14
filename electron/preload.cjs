const { contextBridge, ipcRenderer } = require("electron");

/**
 * The renderer gets a tiny, explicit surface — no Node, no filesystem, no
 * arbitrary IPC channel names. Every handler is validated in the main process.
 */
contextBridge.exposeInMainWorld("sda", {
  platform: process.platform,
  chooseDirectory: () => ipcRenderer.invoke("sda:choose-directory"),
  revealFile: (target) => ipcRenderer.invoke("sda:reveal-file", String(target ?? "")),
  openFile: (target) => ipcRenderer.invoke("sda:open-file", String(target ?? "")),
});

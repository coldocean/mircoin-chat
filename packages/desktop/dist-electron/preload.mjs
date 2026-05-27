"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  // Dialog
  showOpenDialog: (opts) => electron.ipcRenderer.invoke("dialog:open", opts),
  showSaveDialog: (opts) => electron.ipcRenderer.invoke("dialog:save", opts),
  // File system
  readFile: (path) => electron.ipcRenderer.invoke("fs:read", path),
  writeFile: (path, data) => electron.ipcRenderer.invoke("fs:write", path, data),
  // Notifications
  showNotification: (title, body) => electron.ipcRenderer.invoke("notification:show", title, body),
  // Window controls
  minimize: () => electron.ipcRenderer.invoke("window:minimize"),
  maximize: () => electron.ipcRenderer.invoke("window:maximize"),
  close: () => electron.ipcRenderer.invoke("window:close"),
  // Events from main → renderer
  onDeepLink: (cb) => {
    electron.ipcRenderer.on("deep-link", (_, url) => cb(url));
    return () => electron.ipcRenderer.removeAllListeners("deep-link");
  }
});

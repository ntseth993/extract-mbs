const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { statSync } = require("node:fs");
const { pathToFileURL } = require("node:url");

let mainWindow = null;
let serverPort = 0;
let downloadRoot = "";

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const waitForServer = async (url, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

async function startServer() {
  serverPort = await getFreePort();
  downloadRoot = app.getPath("downloads");
  process.env.PORT = String(serverPort);
  process.env.HOST = "127.0.0.1";
  process.env.NODE_ENV = "production";
  process.env.DOWNLOAD_DIR = downloadRoot;
  const entry = pathToFileURL(path.join(__dirname, "..", "dist-server", "index.mjs")).href;
  await import(entry);
}

/** The renderer may only touch files the app itself downloaded. */
const isDownloadedFile = (target) => {
  if (typeof target !== "string" || !target || !downloadRoot) return false;
  const resolved = path.resolve(target);
  const relative = path.relative(downloadRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    return statSync(resolved).isFile();
  } catch {
    return false;
  }
};

function registerIpc() {
  ipcMain.handle("sda:choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("sda:reveal-file", (_event, target) => {
    if (!isDownloadedFile(target)) return false;
    shell.showItemInFolder(path.resolve(target));
    return true;
  });
  ipcMain.handle("sda:open-file", async (_event, target) => {
    if (!isDownloadedFile(target)) return false;
    // Never executed by us — handed to the OS only when the user asks.
    const failure = await shell.openPath(path.resolve(target));
    return !failure;
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#07131f",
    title: "Smart Download Accelerator",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) event.preventDefault();
  });
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
        ],
      },
    });
  });
  registerIpc();
  try {
    await startServer();
    await waitForServer(`http://127.0.0.1:${serverPort}/api/health`);
  } catch (error) {
    console.error("Failed to start the local accelerator server", error);
  }
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

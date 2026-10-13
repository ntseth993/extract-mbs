const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { pathToFileURL } = require("node:url");

let mainWindow = null;
let serverPort = 0;

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
  process.env.PORT = String(serverPort);
  process.env.HOST = "127.0.0.1";
  process.env.NODE_ENV = "production";
  process.env.DOWNLOAD_DIR = app.getPath("downloads");
  const entry = pathToFileURL(path.join(__dirname, "..", "dist-server", "index.mjs")).href;
  await import(entry);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#07131f",
    title: "Smart Download Accelerator",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
}

app.whenReady().then(async () => {
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

const DEFAULT_API_ORIGIN = "http://localhost:5000";
const API_PATH = "/api/download/start";

const isHttpUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);

async function getSettings() {
  const stored = await chrome.storage.local.get(["apiOrigin", "autoCapture", "connections"]);
  return {
    apiOrigin: stored.apiOrigin || DEFAULT_API_ORIGIN,
    autoCapture: stored.autoCapture !== false,
    connections: stored.connections || 4,
  };
}

async function requestStart({ url, apiOrigin, connections }) {
  const response = await fetch(new URL(API_PATH, apiOrigin || DEFAULT_API_ORIGIN).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, connections: connections || 4 }),
  });
  return response.json();
}

const rememberDetected = (download) =>
  chrome.storage.local.set({ lastDetected: { url: download.url, fileName: download.filename || "download" } });

function flashBadge(text) {
  chrome.action.setBadgeBackgroundColor({ color: "#60d7dc" });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "smart-accelerate",
    title: "Download with Smart Accelerator",
    contexts: ["link", "page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const url = info.linkUrl || info.pageUrl;
  if (!isHttpUrl(url)) return;
  await chrome.storage.local.set({ pendingUrl: url });
  chrome.action.openPopup?.();
});

// Internet-Download-Manager style capture: when the browser starts a download,
// hand the URL to the local accelerator and let it take over the transfer.
chrome.downloads.onCreated.addListener(async (download) => {
  if (!isHttpUrl(download.url)) return;
  const { autoCapture, apiOrigin, connections } = await getSettings();
  if (!autoCapture) return rememberDetected(download);
  try {
    const job = await requestStart({ url: download.url, apiOrigin, connections });
    if (!job?.id || job.error) return rememberDetected(download);
    await chrome.downloads.cancel(download.id).catch(() => {});
    await chrome.downloads.erase({ id: download.id }).catch(() => {});
    flashBadge("↑");
  } catch {
    // Accelerator not running — leave the browser's normal download in place.
    await rememberDetected(download);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "start-download") return;
  requestStart({ url: message.url, apiOrigin: message.apiOrigin, connections: message.connections })
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});

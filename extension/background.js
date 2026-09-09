const API_PATH = "/api/download/start";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "smart-accelerate",
    title: "Download with Smart Accelerator",
    contexts: ["link", "page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  if (!url || !/^https?:\/\//i.test(url)) return;
  await chrome.storage.local.set({ pendingUrl: url });
  chrome.action.openPopup?.();
});

chrome.downloads.onCreated.addListener((download) => {
  if (download.url && /^https?:\/\//i.test(download.url)) {
    chrome.storage.local.set({ lastDetected: { url: download.url, fileName: download.filename || "download" } });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "start-download") return;
  fetch(new URL(API_PATH, message.apiOrigin || "http://localhost:5000").toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: message.url, connections: message.connections || 4 }),
  }).then(async (response) => sendResponse(await response.json())).catch((error) => sendResponse({ error: error.message }));
  return true;
});
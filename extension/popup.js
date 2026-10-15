const urlInput = document.querySelector("#url");
const message = document.querySelector("#message");
const dashboard = document.querySelector("#dashboard");
const network = document.querySelector("#network");
const autoCapture = document.querySelector("#autocapture");
const DEFAULT_API_ORIGIN = "http://localhost:5000";
let apiOrigin = DEFAULT_API_ORIGIN;

dashboard.href = apiOrigin;
navigator.connection && (network.textContent = navigator.connection.type === "cellular" ? "Mobile Data" : "Wi-Fi");

chrome.storage.local.get(["pendingUrl", "apiOrigin", "autoCapture"], ({ pendingUrl, apiOrigin: storedOrigin, autoCapture: storedCapture }) => {
  apiOrigin = storedOrigin || DEFAULT_API_ORIGIN;
  dashboard.href = apiOrigin;
  if (pendingUrl) urlInput.value = pendingUrl;
  autoCapture.checked = storedCapture !== false;
});

autoCapture.addEventListener("change", () => {
  chrome.storage.local.set({ autoCapture: autoCapture.checked });
});

document.querySelector("#start").addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!/^https?:\/\//i.test(url)) { message.textContent = "Enter a valid public HTTP(S) URL."; return; }
  message.textContent = "Analyzing server and starting streams…";
  chrome.runtime.sendMessage({ type: "start-download", url, apiOrigin, connections: 4 }, (result) => {
    if (chrome.runtime.lastError || result?.error) { message.textContent = result?.error || "Open the dashboard workflow first."; return; }
    message.textContent = "Download added. Track it in your dashboard.";
  });
});

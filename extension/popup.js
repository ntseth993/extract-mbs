const urlInput = document.querySelector("#url");
const message = document.querySelector("#message");
const dashboard = document.querySelector("#dashboard");
const network = document.querySelector("#network");
const apiOrigin = "http://localhost:5000";
dashboard.href = apiOrigin;
navigator.connection && (network.textContent = navigator.connection.type === "cellular" ? "Mobile Data" : "Wi-Fi");
chrome.storage.local.get(["pendingUrl"], ({ pendingUrl }) => { if (pendingUrl) urlInput.value = pendingUrl; });
document.querySelector("#start").addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!/^https?:\/\//i.test(url)) { message.textContent = "Enter a valid public HTTP(S) URL."; return; }
  message.textContent = "Analyzing server and starting streams…";
  chrome.runtime.sendMessage({ type: "start-download", url, apiOrigin, connections: 4 }, (result) => {
    if (chrome.runtime.lastError || result?.error) { message.textContent = result?.error || "Open the dashboard workflow first."; return; }
    message.textContent = "Download added. Track it in your dashboard.";
  });
});
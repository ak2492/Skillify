// Toolbar popup: pings the content script; force-injects it if the tab hasn't got it yet
// (e.g. tab was open during install/update and never reloaded).
var btn = document.getElementById("ping");
if (btn) {
  btn.addEventListener("click", async () => {
    btn.textContent = "Working...";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id === undefined) { btn.textContent = "No active tab"; return; }
      // 1. Try pinging an already-injected content script.
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "skillify:ping" });
        btn.textContent = "S button is active!";
        return;
      } catch (e) { /* not injected yet — fall through to force-inject */ }
      // 2. Force-inject into the tab (requires scripting permission + host access).
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dist/content.js"] });
      try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["dist/content.css"] });
      } catch (e) { /* page-level CSS is optional; shadow carries real styles */ }
      btn.textContent = "Injected! Close & look for S.";
    } catch (err) {
      btn.textContent = "Can't run here — reload tab";
    }
  });
}

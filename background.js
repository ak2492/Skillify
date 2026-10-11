// Background service worker: makes the pinned toolbar icon "react".
// Clicking the icon opens the popup (see manifest action.default_popup).
// This worker also supports force-injection fallback and answers pings.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "skillify:ping") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  return undefined;
});

// If user clicks the toolbar icon and no popup could open (rare), ensure injection.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || tab.id === undefined) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dist/content.js"] });
  } catch (e) {
    // Expected on chrome://, Web Store, New Tab — content scripts are blocked there.
  }
});

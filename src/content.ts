import { initSkillifyUI } from "./ui";

function boot(): void {
  try {
    if (document.getElementById("skillify-root")) return;
    // Wait for <body> on slow SPAs (ChatGPT), then mount. Retry briefly.
    if (!document.body) {
      let tries = 0;
      const timer = window.setInterval(() => {
        tries += 1;
        if (document.body || tries > 40) {
          window.clearInterval(timer);
          try { initSkillifyUI(); } catch (err) { console.warn("[skillify] init failed:", err); }
        }
      }, 100);
      return;
    }
    initSkillifyUI();
  } catch (err) {
    // Never break the host page.
    console.warn("[skillify] init failed:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

// Answer toolbar-popup pings so the popup can confirm the S button is alive.
try {
  const ch = (globalThis as unknown as { chrome?: { runtime?: { onMessage?: { addListener(fn: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown): void } } } }).chrome;
  ch?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    const m = msg as { type?: string } | null;
    if (m && m.type === "skillify:ping") {
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  });
} catch { /* non-extension context */ }

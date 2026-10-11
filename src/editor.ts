let lastFocusedEditable: HTMLElement | null = null;

export function isEditable(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return /^(text|search)$/i.test(el.type || "");
  return !!el.isContentEditable;
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target as Element | null;
      if (isEditable(t)) lastFocusedEditable = t;
    },
    true
  );
}

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** Last-focused editable > activeElement > AI-app editor > first visible editable. Null if none. */
export function findTargetEditor(): HTMLElement | null {
  if (lastFocusedEditable && document.contains(lastFocusedEditable) && isVisible(lastFocusedEditable)) {
    return lastFocusedEditable;
  }
  const active = document.activeElement as HTMLElement | null;
  if (isEditable(active)) {
    try { if (isVisible(active)) return active; } catch { return active; }
  }
  // AI chat apps first: ChatGPT / Gemini / Claude prompt boxes.
  const preferred = document.querySelector<HTMLElement>(
    '#prompt-textarea, [data-lexical-editor="true"], div.ProseMirror[contenteditable="true"], div[contenteditable="true"][id*="prompt"], div[contenteditable="true"][data-testid*="prompt"], div[contenteditable="true"][aria-label*="message" i], div[contenteditable="true"][aria-label*="prompt" i], textarea[data-testid*="prompt"], textarea[aria-label*="message" i]'
  );
  if (preferred && isEditable(preferred)) {
    try { if (isVisible(preferred)) return preferred; } catch { return preferred; }
  }
  const candidates = document.querySelectorAll<HTMLElement>(
    'textarea, input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"]'
  );
  for (const el of Array.from(candidates)) {
    if (!isEditable(el) || !isVisible(el)) continue;
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "").toLowerCase();
      if (t && t !== "text" && t !== "search") continue;
      if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) continue;
    }
    if (el instanceof HTMLTextAreaElement && (el.disabled || el.readOnly)) continue;
    return el;
  }
  return null;
}

export function getEditorText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value ?? "";
  // textContent (not innerText) so hidden skill spans are included for rebuild.
  return el.textContent ?? (el as HTMLElement).innerText ?? "";
}

function moveCaretToEnd(el: HTMLElement): void {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* noop */ }
}

function dispatchRichInput(el: HTMLElement): void {
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true } as InputEventInit));
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** True for rich editors (ProseMirror/Lexical/Quill) as opposed to <textarea>/<input>. */
export function isRichEditor(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return false;
  return !!el.isContentEditable;
}

function isDisabled(b: Element): boolean {
  return (b as HTMLButtonElement).disabled === true || b.getAttribute("aria-disabled") === "true";
}

/** Heuristic: is this button the chat app's Send button? (ChatGPT, Claude, Gemini, generic) */
export function isSendButton(b: Element | null | undefined): b is HTMLButtonElement {
  if (!b || b.tagName !== "BUTTON") return false;
  const label = [b.getAttribute("aria-label"), b.getAttribute("data-testid"), b.getAttribute("title"), typeof b.className === "string" ? b.className : ""].join(" ");
  return /(^|[\s_-])(send|submit)/i.test(label) && !/stop|cancel|voice|dictat/i.test(label);
}

/** Walk up from the editor and return the first enabled send button found nearby. */
export function findSendButton(editor: HTMLElement): HTMLButtonElement | null {
  let scope: Element | null = editor.closest("form") ?? editor.parentElement;
  for (let i = 0; i < 8 && scope; i++, scope = scope.parentElement) {
    for (const b of Array.from(scope.querySelectorAll("button"))) {
      if (isSendButton(b) && !isDisabled(b)) return b;
    }
  }
  return null;
}

function selectAllContents(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
}

/** Paste plain text like a user would. Rich editors consume `paste` themselves (newline -> new paragraph). */
function pasteText(el: HTMLElement, text: string): void {
  let handled = false;
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    handled = ev.defaultPrevented;
  } catch { /* fall through */ }
  if (!handled) document.execCommand("insertText", false, text);
}

const squash = (t: string) => t.replace(/\s+/g, "");

/* ---------------- One-touch injection + full cover ----------------
 * ChatGPT re-renders its editor on almost any change, which would reveal anything we hide per-paragraph.
 * So we do NOT hide pieces. Instead, for the short window between the hijacked Enter/Send and the real send:
 *   1. cover the whole composer (all text + caret + selection highlight transparent) via a root attribute
 *      -- the rule targets `*`, so re-rendered children are covered too;
 *   2. lock the composer's box size, so the pasted header can't make it visibly grow;
 *   3. paste the ENTIRE skill header in ONE paste at the very start;
 *   4. touch nothing else until the send has cleared the composer, then uncover.
 * Safe because the user can't type in that window: Enter/Send are already hijacked. */
export const HIDE_ATTR = "data-skillify-hide";
const PAGE_STYLE_ID = "skillify-page-style";

/** Same text lives in src/content.css (manifest CSS is CSP-proof); a <style> copy is injected as backup. */
export function buildHideCss(): string {
  const A = `[${HIDE_ATTR}="pending"]`;
  return (
    `${A},${A} *{color:transparent!important;caret-color:transparent!important;text-shadow:none!important;}` +
    `${A}::selection,${A} *::selection{background:transparent!important;color:transparent!important;}`
  );
}

export function ensureHiddenPageStyle(): void {
  try {
    if (document.getElementById(PAGE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
    style.textContent = buildHideCss();
    (document.head ?? document.documentElement).appendChild(style);
  } catch { /* never break host page */ }
}

/** Cover the composer and freeze its size. Returns a function that undoes both. */
export function coverEditor(el: HTMLElement): () => void {
  ensureHiddenPageStyle();
  const prevH = el.style.getPropertyValue("height"), prevHP = el.style.getPropertyPriority("height");
  const prevO = el.style.getPropertyValue("overflow"), prevOP = el.style.getPropertyPriority("overflow");
  try {
    const h = el.getBoundingClientRect().height;
    if (h > 0) {
      el.style.setProperty("height", `${h}px`, "important");
      el.style.setProperty("overflow", "hidden", "important");
    }
  } catch { /* noop */ }
  el.setAttribute(HIDE_ATTR, "pending");
  return () => {
    try {
      el.removeAttribute(HIDE_ATTR);
      if (prevH) el.style.setProperty("height", prevH, prevHP); else el.style.removeProperty("height");
      if (prevO) el.style.setProperty("overflow", prevO, prevOP); else el.style.removeProperty("overflow");
    } catch { /* noop */ }
  };
}

/** The user's current prompt (paragraphs joined by newline). */
export function readPrompt(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value ?? "";
  const blocks = el.children.length ? Array.from(el.children).map((c) => c.textContent ?? "") : [el.textContent ?? ""];
  return blocks.join("\n").replace(/\n+$/, "");
}

function placeCaret(el: HTMLElement, where: "start" | "all"): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (where === "start") range.collapse(true);
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
}

/**
 * Insert the whole skill header as ONE block of text at the very start of the composer.
 * `prompt` is only used to verify nothing was lost. Rich editors: caret to start + one paste;
 * if the header didn't land at the start, retry once as select-all + one paste of header+prompt;
 * last resort is typing line by line. Returns true only when the header is verified at the START.
 */
export async function insertHeaderOnce(el: HTMLElement, header: string, prompt: string, required: string = header): Promise<boolean> {
  try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch { /* noop */ } }
  const full = header + "\n" + prompt;
  // What must be true afterwards: the skill blocks (`required`) are intact and sit DIRECTLY before the prompt,
  // with nothing but the preamble line allowed before them.
  const need = squash(required) + squash(prompt);
  const allowedBefore = Math.max(0, squash(header).length - squash(required).length);
  const check = (label: string, text: string): boolean => {
    const t = squash(text);
    const idx = t.indexOf(need);
    const ok = idx >= 0 && idx <= allowedBefore;
    console.log(`[skillify] composer after ${label}: ok=${ok} idx=${idx} text=${JSON.stringify(text.slice(0, 200))}`);
    return ok;
  };
  if (!isRichEditor(el)) {
    setEditorText(el, full);
    return check("textarea set", getEditorText(el));
  }
  const good = (label: string) => check(label, el.textContent ?? "");

  placeCaret(el, "start");
  await sleep(30); // let the editor register the selection
  pasteText(el, header + "\n");
  await sleep(120);
  if (good("paste at start")) return true;

  placeCaret(el, "all");
  await sleep(30);
  pasteText(el, full);
  await sleep(120);
  if (good("select-all paste")) return true;

  placeCaret(el, "all");
  await sleep(30);
  document.execCommand("delete");
  const lines = full.split("\n");
  lines.forEach((line, i) => {
    if (line) document.execCommand("insertText", false, line);
    if (i < lines.length - 1) document.execCommand("insertParagraph");
  });
  await sleep(120);
  return good("typed lines");
}

/** Set editor text + dispatch input/change so React/Angular editors pick it up. */
export function setEditorText(el: HTMLElement, text: string): void {
  try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch { /* noop */ } }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    // Use native setter to beat React's value tracker when available.
    try {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && typeof desc.set === "function") desc.set.call(el, text);
      else el.value = text;
    } catch {
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } catch { /* noop for input types without selection */ }
  } else {
    (el as HTMLElement).innerText = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true } as InputEventInit));
    // Caret to end.
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    } catch { /* noop */ }
  }
}

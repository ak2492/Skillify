import type { Skill } from "./storage";
import { buildHeader, buildInjection } from "./injector";
import { isEditable, findTargetEditor, getEditorText, findSendButton, isSendButton, sleep, coverEditor, readPrompt, insertHeaderOnce } from "./editor";

let active: Skill[] = [];
let bypass = false; // true while WE trigger the real send
let busy = false;

/** Called by the UI whenever the ticked skills change. Kept in memory so the send handler can decide synchronously. */
export function setActiveSkills(skills: Skill[]): void { active = skills; }

function hasText(editor: HTMLElement): boolean { return getEditorText(editor).trim().length > 0; }
function alreadyHasHeader(editor: HTMLElement): boolean { return /<skill\s*:/.test(getEditorText(editor)); }

const hasHeader = (el: HTMLElement) => /<skill\s*:/.test(getEditorText(el));

async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(100); }
  return cond();
}

async function attachAndSend(editor: HTMLElement, toast: (m: string) => void, onSent: () => Promise<void>): Promise<void> {
  busy = true;
  let uncover: (() => void) | null = null;
  try {
    const blocks = buildHeader(active);
    const header = buildInjection(active); // preamble line + blocks
    const prompt = readPrompt(editor);
    uncover = coverEditor(editor); // synchronous: covered before the browser paints anything
    const ok = await insertHeaderOnce(editor, header, prompt, blocks); // ONE paste at the start; nothing else touches the composer
    if (!ok) { toast("Couldn't attach skills - message not sent."); return; }
    await sleep(100); // let the app's state / send button catch up
    const btn = findSendButton(editor);
    bypass = true;
    if (btn) btn.click();
    else editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    await sleep(50);
    bypass = false;
    // The app clears the composer once the message is really sent.
    const sent = await waitFor(() => !editor.isConnected || !hasHeader(editor), 2500);
    if (sent) await onSent(); // auto-deselect all skills
    else toast("Skills added, but the message wasn't sent - press Send again.");
  } catch (err) {
    console.warn("[skillify] send failed:", err);
    toast("Skills added, but sending failed - press Send again.");
  } finally {
    uncover?.(); // composer is empty after a send; on failure this reveals what is in it
    bypass = false;
    busy = false;
  }
}

/**
 * Capture-phase hijack of Enter and the Send button. If skills are ticked and the user has a prompt,
 * we cancel the event, prepend the skill header, then trigger the real send ourselves.
 */
export function installSendHijack(toast: (m: string) => void, onSent: () => Promise<void>): void {
  window.addEventListener("keydown", (e) => {
    if (bypass || busy || !active.length) return;
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const t = e.target as Element | null;
    if (!isEditable(t) || t.closest("#skillify-root")) return; // never hijack typing in our own form
    if (!hasText(t) || alreadyHasHeader(t)) return;
    if (!findSendButton(t)) return; // site where Enter isn't "send" -> leave typing alone
    e.preventDefault();
    e.stopImmediatePropagation();
    void attachAndSend(t, toast, onSent);
  }, true);

  window.addEventListener("click", (e) => {
    if (bypass || busy || !active.length) return;
    if ((e.composedPath?.() ?? []).some((n) => (n as Element).id === "skillify-root")) return;
    const btn = (e.target as Element | null)?.closest?.("button") ?? null;
    if (!isSendButton(btn)) return;
    const editor = findTargetEditor();
    if (!editor || !hasText(editor) || alreadyHasHeader(editor)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void attachAndSend(editor, toast, onSent);
  }, true);
}

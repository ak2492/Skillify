# Implementation Plan — Skill Injector Extension (Skillify)

> Read with `requirements.md`. This doc defines **how** to build it. Stack: **Manifest V3 + TypeScript + Content Script + `chrome.storage.local`**. No framework required for MVP (vanilla TS + CSS in Shadow DOM). Build with `npm + tsc + esbuild` (or Plasmo/WXT if preferred).

## 1. Architecture Overview

```
Browser Tab DOM
 └─ Skillify Content Script (content.js + content.css)
     ├─ SButton (fixed, draggable, Shadow DOM host #skillify-root)
     ├─ SkillListPopup (positioned below/above SButton)
     │   ├─ Header: [+ Add] (top-left) + [Clear] (optional)
     │   ├─ Rows: [tick] Name + preview + edit/delete
     │   └─ AddSkillForm (name + description + Save/Cancel)
     ├─ Modules:
     │   ├─ storage.ts (CRUD + selection order)
     │   ├─ drag.ts (pointer drag vs click)
     │   ├─ popup-position.ts (below/above flip logic)
     │   ├─ editor.ts (find active editor + get/set value)
     │   └─ injector.ts (build/parse/rebuild skill header)
     └─ Toast (feedback)
```

**No background service worker needed for MVP** except to open docs. No popup page (`action` popup optional). All logic lives in content script so it works on any editor without switching context.

**Why Shadow DOM:** Prevents host page CSS from breaking our UI and vice versa. Host `<div id="skillify-root">` + `attachShadow({mode:'closed'})`, all UI rendered inside.

## 2. File Structure (to be created)

```
skillify/
 ├─ docs/
 │   ├─ requirements.md      (spec companion)
 │   ├─ implementation.md    (this file)
 │   └─ readme.md
 ├─ manifest.json
 ├─ package.json
 ├─ tsconfig.json
 ├─ icons/
 │   ├─ icon16.png
 │   ├─ icon48.png
 │   └─ icon128.png         (white S on indigo circle)
 ├─ src/
 │   ├─ content.ts          (entry: init button, listeners)
 │   ├─ ui.ts               (render S button + popup + form + toast)
 │   ├─ drag.ts
 │   ├─ popup-position.ts
 │   ├─ storage.ts
 │   ├─ editor.ts
 │   ├─ injector.ts
 │   └─ content.css         (namespaced .skillify-*)
 └─ dist/
     ├─ content.js
     └─ content.css
```

Minimal `manifest.json` (MV3):

```json
{
  "manifest_version": 3,
  "name": "Skillify — Skill Injector",
  "version": "0.1.0",
  "description": "Save reusable skills and prepend them to any text editor with delimiters.",
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content.js"],
      "css": ["dist/content.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "action": { "default_title": "Skillify" }
}
```

> Tighten `matches` later to specific AI sites if review requires. Exclude `chrome://*` automatically (Chrome does this).

## 3. Data Model & Storage

```ts
// storage.ts
export interface Skill { id: string; name: string; description: string; createdAt: number; }
const SKILLS_KEY = "skillify.skills.v1";
const UI_KEY = "skillify.ui.v1";
const SELECTED_KEY = "skillify.selected.v1";

export async function getSkills(): Promise<Skill[]> // sort createdAt DESC
export async function addSkill(name: string, description: string): Promise<Skill> // validate unique
export async function updateSkill(id: string, patch: Partial<Skill>): Promise<void>
export async function deleteSkill(id: string): Promise<void>
export async function getSelectedIds(): Promise<string[]>
export async function setSelectedIds(ids: string[]): Promise<void>
export async function getButtonPos(): Promise<{x:number;y:number}|null>
export async function setButtonPos(pos:{x:number;y:number}): Promise<void>
```

- ID: `crypto.randomUUID()` fallback `Date.now().toString(36)+Math.random()`.
- Validation in `addSkill`: trim, name 1–60, desc 1–5000, uniqueness case-insensitive. Throw `Error` with user message.
- Cap: max 200 skills.

## 4. Component-by-Component Build Steps

### Step 1 — Scaffolding
1. `npm init -y; npm i -D typescript esbuild`
2. `tsconfig.json` (strict, dom lib, outDir dist).
3. Build script: `esbuild src/content.ts --bundle --outfile=dist/content.js`.
4. Load unpacked extension (`chrome://extensions` → Developer mode → Load unpacked → `skillify/`).

### Step 2 — Floating S Button (`ui.ts` + `drag.ts` + `content.css`)
- Create host: `div#skillify-root` → shadow root → inner `button.skillify-fab` with text `S`.
- Styles: 48px circle, `position:fixed; right:24px; bottom:24px` default (or restored pos), `background:#4F46E5; color:#fff; font:700 22px system-ui; border-radius:50%; box-shadow; z-index:2147483647; cursor:grab; user-select:none`.
- Drag logic (`drag.ts`):
  ```ts
  let startX, startY, baseLeft, baseTop, moved;
  onPointerDown: record, setPointerCapture, cursor=grabbing
  onPointerMove: if down, dx/dy, move button via style.left/top, moved = dist>5, clamp 0..innerWidth-48
  onPointerUp: if !moved → treat as click → togglePopup(); else save pos via setButtonPos()
  ```
- Must use `position:fixed` with `left/top` (not right/bottom) after first drag for clamp math.
- Click vs drag threshold critical — otherwise popup flickers after drag.

### Step 3 — Popup + Positioning (`ui.ts` + `popup-position.ts`)
- Popup element `div.skillify-popup` inside shadow root, hidden by default.
- Open flow: `togglePopup()` → `renderList()` → `show` → `positionPopup()`.
- `positionPopup()`:
  ```ts
  const r = fab.getBoundingClientRect();
  const pw = 320, ph = popup.offsetHeight || 380; // measure after render
  let top = r.bottom + 8, left = Math.min(Math.max(8, r.left), innerWidth - pw - 8);
  if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8); // flip above
  // if still overflow (tiny viewport), clamp top=8, max-height=innerHeight-16 with scroll
  ```
- Recompute on `resize/scroll` (capture) while open.
- Dismiss: `document.addEventListener('pointerdown', handler, true)` — if click target not inside shadow host → close. Plus `keydown Escape` → close. Stop propagation for clicks inside popup.
- Header: flex row, left `button.skillify-add-btn "+ Add"`, right optional `button.skillify-clear "Clear"`.
- Rows: `div.skillify-row[data-id]` → `span.skillify-tick` + `div (name + desc preview)` + `edit/del buttons`. Tick CSS: hollow grey; `.selected` → green fill + `::after ✓`.
- Empty state + footer hint (“Click skill to inject at top”).

### Step 4 — Add-Skill Form
- Toggled by `+ Add`. Inline panel at top of popup (or modal overlay inside shadow).
- Fields: `<input maxlength=60 placeholder="skill_name e.g. formal-tone">` + `<textarea maxlength=5000 placeholder="Instruction text…">` + Save/Cancel.
- On Save: call `addSkill()` → on success: prepend row, auto-select (append id to selected list), call `rebuildEditor()`, toast “Skill added & injected”, reset form, keep popup open.
- On error: inline red message, keep form open.

### Step 5 — Editor Detection (`editor.ts`)
```ts
let lastFocusedEditable: HTMLElement | null = null;
document.addEventListener('focusin', e => {
  const t = e.target as HTMLElement;
  if (isEditable(t)) lastFocusedEditable = t;
});
export function isEditable(el: HTMLElement): boolean {
  return el instanceof HTMLTextAreaElement
    || (el instanceof HTMLInputElement && /^(text|search)$/i.test(el.type))
    || el.isContentEditable;
}
export function findTargetEditor(): HTMLElement | null {
  if (lastFocusedEditable && document.contains(lastFocusedEditable)) return lastFocusedEditable;
  if (document.activeElement && isEditable(document.activeElement as HTMLElement))
    return document.activeElement as HTMLElement;
  return document.querySelector('textarea, input[type=text], input[type=search], [contenteditable=true]');
}
export function getEditorText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return (el as HTMLElement).innerText ?? el.textContent ?? "";
}
export function setEditorText(el: HTMLElement, text: string): void {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.value = text;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.setSelectionRange?.(el.value.length, el.value.length);
  } else {
    // contenteditable: replace text preserving line breaks crudely for MVP
    (el as HTMLElement).innerText = text;
    el.dispatchEvent(new InputEvent('input', {bubbles:true} as any));
    // move caret to end
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);
  }
}
```
- Note: rich editors (ChatGPT uses ProseMirror-like divs with `<p>`). `innerText` MVP is acceptable; v2 should preserve nodes and insert skill `<p>` nodes at top.

### Step 6 — Injector Core (`injector.ts`) — Most Important
Delimiter spec (exact per requirements):
```ts
export function buildSkillBlock(name: string, description: string): string {
  const n = name.trim();
  const d = description.trim();
  return `<skill : ${n}>\n${d}\n<skill : ${n}>`;
}
export function buildHeader(selected: Skill[]): string {
  return selected.map(s => buildSkillBlock(s.name, s.description)).join("\n");
}
function escapeRegExp(s: string){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function stripAllSkillBlocks(text: string): string {
  // matches <skill : anything> ... <skill : same-anything> non-greedy, multiline
  return text.replace(/<skill\s*:\s*(.+?)\s*>\s*[\s\S]*?\s*<skill\s*:\s*\1\s*>/g, "").replace(/^\n+/, "");
}
export function rebuildEditorText(currentFullText: string, selected: Skill[]): string {
  const userPrompt = stripAllSkillBlocks(currentFullText).replace(/^\n+/, "");
  if (selected.length === 0) return userPrompt;
  const header = buildHeader(selected);
  if (!userPrompt.trim()) return header;
  return header + "\n" + userPrompt;
}
// Usage on toggle:
export async function rebuildEditor(): Promise<void> {
  const editor = findTargetEditor();
  if (!editor) { toast("No text editor found"); return; }
  const skills = await getSkills();
  const ids = await getSelectedIds();
  const ordered = ids.map(id => skills.find(s=>s.id===id)).filter(Boolean) as Skill[];
  const current = getEditorText(editor);
  setEditorText(editor, rebuildEditorText(current, ordered));
}
```
- **Why rebuild-from-scratch:** satisfies FR-INJ-5 (prompt typed first still gets header prepended) and prevents duplicates and preserves order.
- Selection toggle flow:
  ```ts
  onRowClick(id): ids = await getSelectedIds();
  if (ids.includes(id)) ids = ids.filter(x=>x!==id);
  else ids = [...ids, id]; // append → preserves chosen order
  await setSelectedIds(ids); updateTickUI(); await rebuildEditor();
  ```
- Delete flow: remove skill, remove id from selected, `rebuildEditor()`.
- Rename flow: update skill, `rebuildEditor()` (rebuild uses new name).

> Future delimiter note: second tag ideally `</skill : name>` — keep single-tag per spec for v1, isolate in `buildSkillBlock` so migration is one-line change.

### Step 7 — Toast & Polish
- Toast div inside shadow, `showToast(msg)`, auto-hide 2s, `role=status`.
- Focus management, `aria-expanded` on fab, `role=listbox`.
- Prevent host-page interference: all classes prefixed, `:host { all: initial }` where feasible.

## 5. Testing Plan

### Unit (Vitest/Jest, add later)
- `buildSkillBlock` exact string match.
- `stripAllSkillBlocks` removes 1, 2, 0 blocks; handles extra whitespace/newlines.
- `rebuildEditorText`: empty editor + 1 skill; prompt-first + 2 skills order B→A; deselect middle; rename.
- Name escaping with regex chars.

### Manual Checklist
Same as requirements §9 — drag, flip, outside-dismiss, Esc, prepend, order, newline, reload persistence, delete cleanup.

Debug tip: `chrome.storage.local.get(null, console.log)` in service-worker console; content logs prefixed `[skillify]`.

## 6. Build Order (Do NOT skip)
1. Scaffolding + manifest + icons + load unpacked → verify empty `S` appears.
2. Drag + click-distinguish + position persist.
3. Popup shell + flip positioning + outside-dismiss.
4. Storage CRUD + list render + empty state.
5. Add form + validation.
6. Editor detect + injector (`rebuildEditor`) + tick toggle + delete/edit.
7. Toast, a11y, CSS polish, README screenshots.
8. `npm run build`, zip `skillify/` for sharing, manual test on ChatGPT + Gmail + generic textarea.

## 7. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| React-controlled editors ignore `value=` | Dispatch `input` events + `native setter` hack (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set`) if needed. |
| Contenteditable rich structure flattened | Accept for v1; document; v2 inserts DOM nodes instead of `innerText`. |
| Host page CSP blocks inline styles | Use external `content.css`, no inline `<script>`, no `eval`. |
| Popup clipped by host `overflow:hidden` ancestor | Using `position:fixed` in light DOM host at `body` level avoids most clipping; Shadow DOM keeps styles safe. |
| MV3 review `<all_urls>` friction | Scope down to listed AI/productivity domains if publishing to Web Store. |



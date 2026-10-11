# Requirements — Skill Injector Extension (Skillify)

## 1. Project Overview

**Project name (proposed):** Skillify / Agonistic Skill Injector  
**Type:** Browser Extension (Manifest V3 — Chrome / Edge / Brave compatible, Firefox adaptable)  
**One-line purpose:** Let a user define reusable “skills” (predefined instruction text) and inject one or more skills into any web page text-editor area via a floating draggable “S” button.

**Definition of Skill:**
```text
Skill = { skill_name: string, skill_description: string }
```
- `skill_name`: short, unique, human-readable identifier (e.g. `formal-email`, `python-reviewer`).
- `skill_description`: full predefined instruction text that controls behavior / how to do the task (e.g. “Always respond in formal tone, bullet points…”).

No backend. All data stored locally in the browser.

## 2. Goals & Non-Goals

### Goals
1. Provide persistent, draggable floating UI (`S` button) on every tab page.
2. Provide skill CRUD (create/list/select/deselect/delete in v1 scope) from content page itself, no separate options page required for MVP.
3. Inject selected skills at the **very beginning** of the active text editor, wrapped in delimiters, preserving user prompt.
4. Support multi-skill sequential injection in selection order.

### Non-Goals (v1)
- No cloud sync, no accounts, no sharing.
- No LLM API calls, no prompt execution — extension only edits text.
- No rich-text formatting inside skill body (plain text only in v1).
- No automatic skill triggering (no AI detection).

## 3. Target Environment & Assumptions

1. **Browser:** Chromium MV3 (Chrome 116+). Architecture must allow Firefox MV2/MV3 port later.
2. **Pages:** Any normal `http/https` tab. Excluded: `chrome://`, `edge://`, Chrome Web Store, PDF viewer.
3. **Editor types to support (v1 must):**
   - `textarea`
   - `input[type=text/search]`
   - `contenteditable="true"` divs / rich editors (ChatGPT, Claude, Gemini, Gmail compose, etc.)
4. **Active editor resolution:** Last-focused editable element; if none focused, first visible editable element in DOM; if none found, show toast “No text editor found”.
5. **Permissions:** `storage`, `activeTab`, `scripting` (content-scripts declared in manifest, no broad `<all_urls>` code execution beyond CSS/DOM injection).
6. **Offline:** Fully functional offline.

## 4. Functional Requirements

### 4.1 Floating “S” Button — FR-UI

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-UI-1 | Circular floating button with letter `S`, draggable across complete tab page viewport. | 48x48px circle, `position:fixed`, `z-index: 2147483647`, draggable by pointer/mouse drag, clamped to viewport, position persists per session (and optionally per reload via `sessionStorage`). Page scroll does not detach it. Distinguish click vs drag (>5px movement = drag). |
| FR-UI-2 | Click on `S` (without drag) opens skill list popup showing complete list of recently added skills. | Toggle open/close on click. List sorted newest-first. Shows empty state if zero skills: “No skills yet. Click + Add”. |
| FR-UI-3 | Selecting skill: click on skill row shows circular tick mark in front of skill name that turns green. | Each row has 18px circle outline left of name. Default: grey hollow. Selected: green fill + white check. Multi-select allowed. Click again toggles off (tick returns to grey, skill removed from editor). Selection order tracked. |
| FR-UI-4 | Click anywhere else on screen (outside `S` button + popup) dismisses skill list. | `pointerdown` outside listener + `Escape` key closes. Click inside popup does not close. Focus returns to previous element. |
| FR-UI-5 | Popup appears just below `S` button; if insufficient space below, appears above it. | Calculate with `getBoundingClientRect()`. Default: `top = S.bottom + 8px, left = clamp(S.left)`. If `S.bottom + popupHeight + 8 > window.innerHeight`, flip to `top = S.top - popupHeight - 8`. Horizontal clamp to `8px < left < innerWidth - popupWidth - 8`. Recompute on open, scroll, resize. |
| FR-UI-6 | “Add” option at very top-left of skill list for creating new skill. | Popup header row: `[+ Add]` left-aligned + optional search/clear on right. Clicking `+ Add` opens add-skill form (inline expand or modal) without closing list. |

### 4.2 Skill Management — FR-SKILL

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-SKILL-1 | Add skill via form with `skill_name` + `skill_description`. | Name: required, 1–60 chars, unique (case-insensitive trim), allowed `[A-Za-z0-9-_ ]`. Description: required, 1–5000 chars. Validation errors inline. On save: persist to `chrome.storage.local`, prepend to list, auto-select it (per Working-2 order). |
| FR-SKILL-2 | List skills persistently. | Stored in `chrome.storage.local` key `skillify.skills.v1` as array. Survives reload/restart. Render name + truncated description preview + tick state. |
| FR-SKILL-3 | Delete / Edit skill (necessary filler). | Each row hover reveals edit (pencil) + delete (trash). Delete asks confirm, removes skill text block from editor if currently injected, updates selection order. Edit allows rename (must update injected block if already injected). |
| FR-SKILL-4 | Selection order preserved. | Maintain `selectedSkillIds: string[]` in insertion order. Re-click toggles. “Clear all” optional in header. |

### 4.3 Injection / Working Logic — FR-INJ

| ID | Requirement (from user spec) | Acceptance Criteria |
|----|------------------------------|---------------------|
| FR-INJ-1 | On click of skill name, its text injected at very beginning of text editor area. | Prepend, not append, not replace. Preserve existing user prompt, caret, focus. Dispatch `input`/`change` events so frameworks (React) detect change. |
| FR-INJ-2 | Multiple skills injected sequentially in order chosen. | If user picks A then B then C, editor top = block-A + newline + block-B + newline + block-C + newline + originalPrompt. Toggling off B removes only B block, order of A,C retained. Re-selecting B appends B to end of skill block sequence. |
| FR-INJ-3 | Every skill text wrapped between delimiters: `<skill : skill_name> skill_description <skill : skill_name>`. | Exact template (per spec): `newline + <skill : {name}> + newline + {description.trim()} + newline + <skill : {name}> + newline`. Name normalized (trim). Delimiters on own lines for readability. Parser must be able to regex-detect existing blocks to avoid duplicates. |
| FR-INJ-4 | Every skill addition starts with new line. | Skill block always starts with `\n` (or `\n\n` if editor not empty). No inline concatenation. If editor empty, leading `\n` trimmed to single block. |
| FR-INJ-5 | Even if user writes prompt first and adds skill last, skill is still pre-appended in same chosen sequence. | Implementation: always reconstruct as `buildSkillHeader(selectedInOrder) + originalUserPromptWithoutHeader`. Must strip previously injected header before rebuild to avoid duplication, then prepend fresh header. `originalUserPrompt` = current editor value minus all `<skill : …>` blocks. |

### 4.4 Edge Cases
1. **No editor found:** Toast warning, do not throw.
2. **Duplicate name:** Block save, show “Skill name already exists”.
3. **Duplicate injection:** Re-clicking already-selected skill must not duplicate; toggle logic + rebuild-from-scratch prevents it.
4. **Manual user edit of delimiter:** On next rebuild, stale blocks removed by regex, fresh blocks generated. User edits inside skill body are overwritten — document this.
5. **Very long skill (>5000 chars):** Truncate with warning or block; v1 blocks at 5000.
6. **Special characters in name:** Must escape in regex; delimiter matching uses escaped name.
7. **Shadow DOM editors:** Best-effort support; v1 targets light DOM only, document limitation.

## 5. UI / UX Requirements

1. **Visual:** `S` button: 48px circle, indigo/blue background (#4F46E5), white bold “S”, subtle shadow, hover scale 1.05, drag cursor `grab/grabbing`.
2. **Popup:** min-width 280px, max-width 340px, max-height 380px with scroll, white card, 12px radius, shadow, font 14px system-ui.
3. **Tick:** 18px circle border 2px #CBD5E1; selected: background #22C55E, border #22C55E, white ✓.
4. **Add form:** Two fields (Name input, Description textarea) + Save/Cancel. Inline validation.
5. **Feedback:** Toast (bottom-center, 2s) for “Skill added”, “Skill injected”, “No editor found”.
6. **Accessibility:** Keyboard navigable (Tab, Enter to select, Esc to close), `aria-expanded`, `role=listbox/option`, focus trap in Add form, contrast AA.
7. **No interference:** Content CSS namespaced with `skillify-` prefix + Shadow DOM encapsulation recommended so host page styles don’t leak.

## 6. Data Requirements

```ts
type Skill = {
  id: string;            // uuid / Date.now-random
  name: string;          // unique, trimmed
  description: string;   // trimmed, 1..5000
  createdAt: number;     // epoch ms
};

Storage:
chrome.storage.local {
  "skillify.skills.v1": Skill[],
  "skillify.ui.v1": { x: number, y: number } | null,
  "skillify.selected.v1": string[]  // selected skill ids in order (per tab session or global)
}
```

- Sorting: `createdAt DESC` for display; selection order separate.
- Quota: local ~5MB; enough for ~500 skills; enforce 200-skill cap in v1 with message.

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Content script <100KB, open popup <100ms, injection <50ms, no polling (use focus tracking events only). |
| Reliability | No unhandled exceptions on pages without editors; all DOM queries null-safe. |
| Privacy | No network calls, no analytics in v1. All data local. State in privacy policy. |
| Compatibility | Works on ChatGPT, Claude, Gemini, Gmail, GitHub, StackOverflow, generic textarea. Chrome + Edge v1. |
| Maintainability | TypeScript, ESLint, separate modules for UI/drag/storage/injector. |
| Testability | Unit tests for delimiter build/parse + rebuild logic; manual checklist for drag/flip/dismiss. |

## 8. Out of Scope / Future (v2+)
- Skill import/export JSON, sync (`chrome.storage.sync`), categories/tags, search.
- Custom delimiter styles (`</skill>` closing tag, XML style).
- Auto-inject per domain, keyboard shortcut (`Alt+S`), options page.
- Toggle-off behavior customization, skill variables (`{{tone}}`).

## 9. Acceptance Test Checklist (MVP)
1. Install → `S` appears on any page, draggable everywhere, survives scroll.
2. Click `S` → empty state + `[+ Add]` top-left.
3. Add `code-review` skill → appears in list, auto-ticked green, injected at top of editor with delimiters + newline.
4. Type prompt first, then select 2 skills in order B→A → editor = block-B + block-A + prompt.
5. Deselect B → only block-A + prompt remains.
6. Move `S` near bottom edge → popup flips above.
7. Click outside → popup closes. `Esc` closes.
8. Reload page → skills persist, `S` position restored, selection restored (or cleared per design decision).
9. Delete skill → removed from list + editor header cleaned.
10. No editor page → toast “No text editor found”, no crash.

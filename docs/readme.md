# Skillify — Skill Injector Extension

A lightweight browser extension that lets you save reusable **skills** (predefined instruction texts) and inject them into any text box on any web page with one click.

A floating circular **“S”** button follows you across tabs. Click it to pick skills — selected skills are automatically **pre-pended** to your prompt inside delimiters, in the order you chose them.

## Features

- 🔵 **Floating “S” button** — draggable anywhere on the page, always on top.
- 📋 **Skill list popup** — click `S` to see all your recently added skills.
- ✅ **One-click select** — circular tick turns green when a skill is active. Multi-select supported.
- ➕ **Add inline** — `+ Add` button at the very top-left of the list to create a new skill (name + instruction text).
- 🧲 **Smart popup** — appears just below `S`; flips above if there’s no space. Click anywhere else or press `Esc` to dismiss.
- ✍️ **Auto-prepend** — skill text is inserted at the **very beginning** of the text editor (works even if you already typed your prompt).
- 🙈 **Hidden in AI chat boxes** — in rich editors (ChatGPT/Claude/Gemini) skill blocks + delimiters are wrapped in zero-font spans: invisible in the compose box, but still submitted to the AI. Only marked spans match the hiding rule, so **your prompt font is never affected**. Plain `textarea`/`input` boxes show skills visibly (per-skill hiding is impossible there).
- 🔢 **Attached counter** — the `S` button shows a green count badge while skills are attached (since hidden skills can't be seen in the box).
- 🔢 **Ordered injection** — multiple skills are injected sequentially in selection order, each starting on a new line.
- 🏷️ **Delimited format** — each skill is wrapped so LLMs / readers can see boundaries:
  ```text
  <skill : skill_name>
  skill_description
  <skill : skill_name>
  ```
- 💾 **Local-first** — no account, no server. Skills stored in `chrome.storage.local`.

## Demo (conceptual)

Editor before selecting skills:
```text
Write an email to my manager about leave.
```

Select `formal-tone` then `concise` from the `S` menu → editor becomes:
```text
<skill : formal-tone>
Always use formal, polite business language.
<skill : formal-tone>
<skill : concise>
Keep the answer under 80 words with bullet points.
<skill : concise>
Write an email to my manager about leave.
```

Deselect `formal-tone` → only `concise` block + your prompt remains.

## Installation (Developer Mode, v0.1.2)

1. Clone / download this folder (`skillify/`). `dist/` is committed load-ready — no build needed.
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `skillify/` folder.
3. **Hard-reload every ChatGPT/Gemini/Claude tab** (required after install/update, otherwise the content script isn't in the page).
4. Look for the indigo circular `S` button bottom-right. If missing: click the pinned Skillify toolbar icon → **Show / re-inject S button**.
5. Optional rebuild from source: `npm install` then `npm run build`.

> Publishing to Chrome Web Store / Edge Add-ons: zip the `skillify/` folder after build.

## Usage

1. **Move it:** drag the `S` circle anywhere. Click (without dragging) to open the list.
2. **Add a skill:** click `+ Add` (top-left) → enter `skill_name` (unique, e.g. `python-reviewer`) + `skill_description` (the instruction, e.g. “Review code for bugs, suggest type hints…”) → Save. It’s auto-selected and injected.
3. **Select / deselect:** click a skill row. Green tick = active and injected. Click again to remove just that skill’s block from the editor.
4. **Close:** click anywhere else on the page or press `Esc`.
5. **Edit / delete:** hover a row for pencil / trash icons. Deleting also cleans its block from the editor.

Works with plain `textarea`, `input[type=text]`, and rich `contenteditable` editors (ChatGPT/Claude/Gemini/Gmail).

## Project Structure

```
skillify/
 ├─ docs/                 # requirements.md, implementation.md, readme.md (this file)
 ├─ manifest.json        # MV3 manifest (v0.1.1)
 ├─ background.js        # toolbar-click fallback injection
 ├─ action_popup.html/js # toolbar popup (show/re-inject S)
 ├─ icons/               # 16/48/128 S-logo
 ├─ src/                 # TS source: content, ui, shadow-css, drag, popup-position, storage, editor, injector
 ├─ dist/                # load-ready bundled content.js + content.css
 └─ tests/               # injector unit tests
```

See `docs/requirements.md` for acceptance criteria and `docs/implementation.md` for the delimiter logic, drag-vs-click handling, and flip-positioning algorithm.

## Skill Format Details

- Each block starts on a **new line**.
- Open and close delimiters are identical per v0.1 spec: `<skill : name>`.
- In rich AI-chat editors the whole block (delimiters included) is wrapped in `<span data-skillify-skill="name">` with zero-font page CSS (`font-size:0 !important; color:transparent`, never `display:none` so the text still sends). The hiding selector matches **only** these spans — prompt nodes never match, so prompt styling is untouched. The sent message bubble will still show the skill text (server echo); hiding covers the compose box only.
- Parser strips old blocks and rebuilds the header on every toggle, so order is always correct and duplicates never occur — even if you type your prompt first.

Example with two skills:
```text
<skill : skill_a>
Description of A.
<skill : skill_a>
<skill : skill_b>
Description of B.
<skill : skill_b>
Your original prompt stays here untouched.
```

## Permissions & Privacy

- Uses `storage` (to save skills locally) + content-script access to detect text boxes.
- **No network requests, no tracking, no analytics.** All data stays on your machine.
- Code is content-script only; it never reads history or passwords — only the currently focused text box when you explicitly select a skill.

## Roadmap

- [ ] `</skill : name>` proper closing tag option
- [ ] Search, tags, import/export JSON
- [ ] `chrome.storage.sync` + per-site auto-inject
- [ ] Keyboard shortcut (`Alt+S`)
- [ ] Options page + bulk management

## Troubleshooting — skills visible instead of hidden?

1. Check the version in `chrome://extensions` is **0.1.2** (hiding fixes landed there; 0.1.1 inserts spans but can't survive ChatGPT's editor normalization).
2. After selecting a skill, DevTools Console should show `[skillify] rich inject: N skills, marked=N, page-style=true`. If `marked=0`, ChatGPT's Lexical editor unwrapped the marker spans — the built-in guard re-wraps them within ~4s (watch for `[skillify] re-wrapped hidden skills`); if it keeps failing it logs a warning and leaves text visible.
3. Elements checks: `<head>` must contain `style#skillify-page-style`; `#prompt-textarea` should contain `span[data-skillify-skill]`; a marked span's computed `font-size` must be `0px`.
4. Reload the extension + hard-reload the ChatGPT tab after every update.

## Troubleshooting — no S button?

1. Reload the ChatGPT tab (Ctrl/Cmd+Shift+R). Already-open tabs don't get the script until reload.
2. After reloading the extension in `chrome://extensions`, reload the ChatGPT tab again.
3. Click the pinned Skillify icon → **Show / re-inject S button**.
4. Won't ever appear on `chrome://`, Chrome Web Store, or New Tab pages (Chrome blocks content scripts there).
5. DevTools check: Elements should contain `#skillify-root` with an inner `<style>`; Console should show `[skillify] mounted`. Check `chrome://extensions` → **Errors** for details.

## Contributing / Support

This is an MVP spec + scaffold. To contribute: implement per `implementation.md` build order, add unit tests for `injector.ts`, and manually verify on at least one plain textarea + one rich editor.

Found a bug with a specific site’s editor? File an issue with URL + editorHTML snippet.

---
Built for fast, repeatable prompting — define once, inject anywhere.

import { getSkills, addSkill, updateSkill, deleteSkill, getSelectedIds, setSelectedIds, type Skill } from "./storage";
import { setActiveSkills, installSendHijack } from "./sender";
import { startChips } from "./chips";
import { makeDraggable } from "./drag";
import { computePopupPosition } from "./popup-position";
import { getButtonPos, setButtonPos } from "./storage";
import { SHADOW_CSS } from "./shadow-css";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Selection no longer touches the editor: it only tells the send-hijack which skills to attach. */
export async function syncSelection(): Promise<void> {
  const skills = await getSkills();
  const ids = await getSelectedIds();
  setActiveSkills(ids.map((id) => skills.find((s) => s.id === id)).filter((s): s is Skill => !!s));
}

export function initSkillifyUI(): void {
  if (document.getElementById("skillify-root")) return;

  const host = document.createElement("div");
  host.id = "skillify-root";
  // Host itself must not affect page layout; children use position:fixed.
  host.setAttribute("style", "all:initial;position:static !important;display:block !important;width:0 !important;height:0 !important;overflow:visible !important;");
  (document.body ?? document.documentElement).appendChild(host);
  let shadow: ShadowRoot;
  try {
    shadow = host.attachShadow({ mode: "open" });
  } catch (err) {
    console.warn("[skillify] shadow DOM unavailable:", err);
    return;
  }

  const style = document.createElement("style");
  // Manifest CSS cannot pierce Shadow DOM — styles MUST live here.
  style.textContent = SHADOW_CSS;
  shadow.appendChild(style);
  console.log("[skillify] mounted");

  const wrap = document.createElement("div");
  wrap.setAttribute("class", "skillify-wrap");
  wrap.innerHTML = `
    <button class="skillify-fab" aria-label="Skills" aria-expanded="false" title="Skills (drag to move, click to open)">S<span class="skillify-count" hidden></span></button>
    <div class="skillify-popup" hidden role="listbox" aria-label="Skills">
      <div class="skillify-popup-header">
        <button class="skillify-add-btn" type="button">+ Add</button>
        <button class="skillify-clear-btn" type="button" title="Deselect all">Clear</button>
      </div>
      <div class="skillify-form" hidden>
        <div class="skillify-form-title">New skill</div>
        <slot name="skillify-name"></slot>
        <slot name="skillify-desc"></slot>
        <div class="skillify-form-error" hidden></div>
        <div class="skillify-form-actions">
          <button class="skillify-save" type="button">Save</button>
          <button class="skillify-cancel" type="button">Cancel</button>
        </div>
      </div>
      <div class="skillify-list"></div>
      <div class="skillify-empty" hidden>No skills yet. Click + Add.</div>
      <div class="skillify-hint">Ticked skills are attached to your next message only, then auto-deselected.</div>
    </div>
    <div class="skillify-toast" hidden role="status"></div>
  `;
  shadow.appendChild(wrap);

  const fab = wrap.querySelector(".skillify-fab") as HTMLButtonElement;
  const popup = wrap.querySelector(".skillify-popup") as HTMLDivElement;
  const listEl = wrap.querySelector(".skillify-list") as HTMLDivElement;
  const emptyEl = wrap.querySelector(".skillify-empty") as HTMLDivElement;
  const formEl = wrap.querySelector(".skillify-form") as HTMLDivElement;
  // The two text fields live in the LIGHT DOM of the host and are projected into the form through <slot>s.
  // Why: sites like Claude.ai have a global "type anywhere -> focus the prompt box" handler. For a field inside
  // a shadow root the page only sees the retargeted host <div> (not editable) and steals every keystroke.
  // A real light-DOM <input>/<textarea> is recognised as editable, so the page leaves the typing alone.
  const FIELD_CSS =
    "width:100%!important;box-sizing:border-box!important;border:1px solid #cbd5e1!important;border-radius:8px!important;" +
    "padding:6px 8px!important;font:13px system-ui,-apple-system,Segoe UI,sans-serif!important;margin:0 0 6px 0!important;" +
    "color:#0f172a!important;background:#fff!important;outline:none;display:block!important;";
  const nameInput = document.createElement("input");
  nameInput.className = "skillify-name";
  nameInput.maxLength = 60;
  nameInput.placeholder = "skill_name e.g. formal-tone";
  nameInput.slot = "skillify-name";
  nameInput.style.cssText = FIELD_CSS;
  const descInput = document.createElement("textarea");
  descInput.className = "skillify-desc";
  descInput.maxLength = 5000;
  descInput.rows = 3;
  descInput.placeholder = "Instruction text...";
  descInput.slot = "skillify-desc";
  descInput.style.cssText = FIELD_CSS + "resize:vertical!important;min-height:56px!important;";
  host.append(nameInput, descInput);
  // Keep typing private: page-level shortcut/focus handlers must not see keystrokes typed in our fields.
  const KEEP_PRIVATE = ["keydown", "keyup", "keypress", "beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "paste", "cut", "copy"];
  for (const type of KEEP_PRIVATE) {
    host.addEventListener(type, (e) => {
      if (type === "keydown" && (e as KeyboardEvent).key === "Escape") return; // let Esc close the popup
      e.stopPropagation();
    });
  }
  const formError = wrap.querySelector(".skillify-form-error") as HTMLDivElement;
  const toastEl = wrap.querySelector(".skillify-toast") as HTMLDivElement;

  let toastTimer: number | undefined;
  const showToast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2000);
  };

  let editingId: string | null = null;
  let isOpen = false;

  const positionPopup = () => {
    const r = fab.getBoundingClientRect();
    popup.hidden = false;
    const ph = popup.offsetHeight || 380;
    const pos = computePopupPosition({ top: r.top, bottom: r.bottom, left: r.left }, ph);
    popup.style.top = `${pos.top}px`;
    popup.style.left = `${pos.left}px`;
    popup.dataset.flipped = pos.flipped ? "true" : "false";
  };

  const setFormMode = (mode: "hidden" | "add" | "edit") => {
    if (mode === "hidden") {
      formEl.hidden = true;
      editingId = null;
      formError.hidden = true;
      nameInput.value = "";
      descInput.value = "";
      (wrap.querySelector(".skillify-form-title") as HTMLElement).textContent = "New skill";
    } else {
      formEl.hidden = false;
      (wrap.querySelector(".skillify-form-title") as HTMLElement).textContent =
        mode === "edit" ? "Edit skill" : "New skill";
    }
  };

  const countBadge = wrap.querySelector(".skillify-count") as HTMLElement;
  const updateBadge = (n: number) => {
    countBadge.hidden = n === 0;
    countBadge.textContent = n > 99 ? "99+" : String(n);
    fab.setAttribute("aria-label", n === 0 ? "Skills" : `${n} skill${n === 1 ? "" : "s"} attached`);
    fab.title = n === 0
      ? "Skills (drag to move, click to open)"
      : `${n} skill${n === 1 ? "" : "s"} selected (sent with your next message) — click to manage`;
  };

  // Show attached-count badge immediately, even before first open.
  void getSelectedIds().then((ids) => updateBadge(ids.length)).catch(() => undefined);

  const renderList = async () => {
    const skills = await getSkills();
    const selected = await getSelectedIds();
    updateBadge(selected.length);
    listEl.innerHTML = "";
    emptyEl.hidden = skills.length !== 0;
    for (const s of skills) {
      const row = document.createElement("div");
      row.className = "skillify-row" + (selected.includes(s.id) ? " selected" : "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected.includes(s.id) ? "true" : "false");
      row.dataset.id = s.id;
      row.tabIndex = 0;
      const preview = s.description.length > 80 ? s.description.slice(0, 80) + "…" : s.description;
      row.innerHTML = `
        <span class="skillify-tick" aria-hidden="true"></span>
        <span class="skillify-text"><span class="skillify-name-label">${esc(s.name)}</span>
        <span class="skillify-desc-preview">${esc(preview)}</span></span>
        <span class="skillify-row-actions">
          <button class="skillify-edit" type="button" title="Edit">✎</button>
          <button class="skillify-del" type="button" title="Delete">🗑</button>
        </span>`;
      row.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".skillify-edit")) {
          editingId = s.id;
          setFormMode("edit");
          nameInput.value = s.name;
          descInput.value = s.description;
          formError.hidden = true;
          nameInput.focus();
          return;
        }
        if (target.closest(".skillify-del")) {
          if (!window.confirm(`Delete skill "${s.name}"?`)) return;
          await deleteSkill(s.id);
          await renderList();
          await syncSelection();
          showToast("Skill deleted.");
          return;
        }
        // Toggle select (FR-UI-3, FR-INJ-2: order = order chosen)
        const ids = await getSelectedIds();
        const next = ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id];
        await setSelectedIds(next);
        await renderList();
        await syncSelection();
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
      });
      listEl.appendChild(row);
    }
    if (isOpen) positionPopup();
  };

  const openPopup = async () => {
    isOpen = true;
    fab.setAttribute("aria-expanded", "true");
    setFormMode("hidden");
    await renderList();
    popup.hidden = false;
    positionPopup();
  };
  const closePopup = () => {
    isOpen = false;
    fab.setAttribute("aria-expanded", "false");
    popup.hidden = true;
    setFormMode("hidden");
  };
  const togglePopup = () => (isOpen ? closePopup() : void openPopup());

  // Restore position, default bottom-right.
  const applyDefaultPos = () => {
    fab.style.left = `${Math.max(8, window.innerWidth - 72)}px`;
    fab.style.top = `${Math.max(8, window.innerHeight - 72)}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
  };
  getButtonPos().then((p) => {
    if (p) {
      const maxX = Math.max(0, window.innerWidth - 48);
      const maxY = Math.max(0, window.innerHeight - 48);
      fab.style.left = `${Math.min(Math.max(0, p.x), maxX)}px`;
      fab.style.top = `${Math.min(Math.max(0, p.y), maxY)}px`;
    } else {
      applyDefaultPos();
    }
  }).catch(() => applyDefaultPos());

  makeDraggable(fab, {
    onClick: togglePopup,
    onDragEnd: (pos) => { void setButtonPos(pos); if (isOpen) positionPopup(); },
  });

  (wrap.querySelector(".skillify-add-btn") as HTMLButtonElement).addEventListener("click", () => {
    setFormMode("add");
    editingId = null;
    nameInput.focus();
  });
  (wrap.querySelector(".skillify-cancel") as HTMLButtonElement).addEventListener("click", () => setFormMode("hidden"));
  (wrap.querySelector(".skillify-clear-btn") as HTMLButtonElement).addEventListener("click", async () => {
    await setSelectedIds([]);
    await renderList();
    await syncSelection();
  });
  (wrap.querySelector(".skillify-save") as HTMLButtonElement).addEventListener("click", async () => {
    try {
      if (editingId) {
        await updateSkill(editingId, { name: nameInput.value, description: descInput.value });
        showToast("Skill updated.");
      } else {
        const created = await addSkill(nameInput.value, descInput.value);
        const ids = await getSelectedIds();
        if (!ids.includes(created.id)) await setSelectedIds([...ids, created.id]); // auto-select new
        showToast("Skill added & selected.");
      }
      formError.hidden = true;
      setFormMode("hidden");
      await renderList();
      await syncSelection();
    } catch (err) {
      formError.textContent = err instanceof Error ? err.message : "Could not save skill.";
      formError.hidden = false;
    }
  });

  // Dismiss on outside click (FR-UI-4) + Escape.
  document.addEventListener("pointerdown", (e) => {
    if (!isOpen) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(host)) return;
    if (e.target === host || (e.target instanceof Node && host.contains(e.target))) return;
    closePopup();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closePopup();
  }, true);
  window.addEventListener("resize", () => { if (isOpen) positionPopup(); }, true);
  window.addEventListener("scroll", () => { if (isOpen) positionPopup(); }, true);

  // Keep list fresh when storage changes in another tab.
  try {
    const ch = (globalThis as unknown as { chrome?: { storage?: { onChanged?: { addListener(fn: () => void): void } } } }).chrome;
    ch?.storage?.onChanged?.addListener(() => {
      if (isOpen) void renderList();
      void syncSelection();
    });
  } catch { /* non-extension context */ }

  void syncSelection();
  installSendHijack(showToast, async () => {
    await setSelectedIds([]);   // skills apply to ONE message only
    await syncSelection();
    updateBadge(0);
    if (isOpen) await renderList();
  });
  startChips();

  // SPA guard: if the app replaces <body> and drops our host, re-mount once.
  try {
    const obs = new MutationObserver(() => {
      if (!document.contains(host) && !document.getElementById("skillify-root")) {
        try { (document.body ?? document.documentElement).appendChild(host); } catch { /* noop */ }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: false });
    window.setTimeout(() => { try { obs.disconnect(); } catch { /* noop */ } }, 30000);
  } catch { /* MutationObserver unavailable */ }
}

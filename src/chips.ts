import { findSkillBlock } from "./injector";

export const CHIP_ATTR = "data-skillify-chip";
const DESC_ATTR = "data-skillify-desc";
const SKIP = `[contenteditable]:not([contenteditable="false"]),textarea,input,pre,code,script,style,[${CHIP_ATTR}]`;

function skippable(n: Node): boolean {
  const el = n instanceof Element ? n : n.parentElement;
  return !el || !!el.closest(SKIP);
}

function textNodes(scope: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (!skippable(n)) out.push(n as Text);
  return out;
}

function makeChip(name: string, desc: string): HTMLElement {
  const c = document.createElement("span");
  c.setAttribute(CHIP_ATTR, name);
  c.setAttribute(DESC_ATTR, desc);
  c.setAttribute("role", "button");
  c.setAttribute("tabindex", "0");
  c.setAttribute("contenteditable", "false");
  c.setAttribute("title", "Click to view skill");
  c.style.cssText =
    "display:inline-flex!important;align-items:center;margin:2px 6px 2px 0;padding:2px 10px;border-radius:999px;" +
    "background:#4f46e5;color:#fff;font:600 12px/18px system-ui,-apple-system,Segoe UI,sans-serif;" +
    "cursor:pointer;user-select:none;white-space:nowrap;vertical-align:middle;";
  c.textContent = "\u2726 " + name;
  return c;
}

function isSameChip(n: Node | null, name: string, desc: string): boolean {
  return n instanceof Element && n.getAttribute(CHIP_ATTR) === name && n.getAttribute(DESC_ATTR) === desc;
}

const hasChip = (el: Element) => !!el.querySelector(`[${CHIP_ATTR}]`);

/** Collapse the empty lines left behind after blanking: hide emptied blocks and surplus <br>s after chips. */
function tidy(scope: Node, touched: Set<Element>, chips: HTMLElement[]): void {
  for (const el of touched) {
    if (el === scope || !el.isConnected || hasChip(el) || el.tagName === "BODY") continue;
    if (!(el.textContent ?? "").trim() && !el.querySelector("img,video,canvas,svg,input,textarea")) (el as HTMLElement).style.display = "none";
  }
  for (const chip of chips) {
    let n: Node | null = chip.nextSibling;
    let keptOne = false;
    while (n) {
      if (n.nodeType === 3 && !(n.nodeValue ?? "").trim() && !/\n/.test(n.nodeValue ?? "")) { n = n.nextSibling; continue; }
      if (n instanceof HTMLElement && n.tagName === "BR") {
        if (keptOne) n.style.display = "none"; else keptOne = true; // keep ONE line break before the prompt
        n = n.nextSibling;
        continue;
      }
      if (n.nodeType === 3 && !(n.nodeValue ?? "").trim()) { n = n.nextSibling; continue; }
      break;
    }
  }
}

/** Replace every `<skill : x> ... <skill : x>` block inside `scope` with a chip. Returns count replaced. */
export function replaceBlocks(scope: Node): number {
  let count = 0;
  const touched = new Set<Element>();
  const made: HTMLElement[] = [];
  let lastChip: HTMLElement | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const nodes = textNodes(scope);
    const starts: number[] = [];
    let full = "";
    for (const n of nodes) { starts.push(full.length); full += n.nodeValue ?? ""; }
    const m = findSkillBlock(full);
    if (!m) break;
    const locate = (pos: number, isEnd: boolean): number => {
      for (let i = 0; i < nodes.length; i++) {
        const len = nodes[i].nodeValue!.length;
        if (len > 0 && (isEnd ? starts[i] + len >= pos : starts[i] + len > pos)) return i;
      }
      return nodes.length - 1;
    };
    const si = locate(m.start, false);
    const ei = locate(m.end, true);
    const first = nodes[si], last = nodes[ei];
    const sOff = m.start - starts[si];
    const eOff = m.end - starts[ei];
    const prefix = first.nodeValue!.slice(0, sOff);
    // Chips sit one after another on the first line; the prompt starts on the next line.
    const rest = last.nodeValue!.slice(eOff).replace(/^\s+/, "");
    const suffix = !rest ? "" : /^<skill\s*:/.test(rest) ? rest : "\n" + rest;
    const dup = isSameChip(first.nextSibling, m.name, m.description) || isSameChip(first.previousSibling, m.name, m.description);
    const chip = dup ? null : makeChip(m.name, m.description);
    for (let i = si; i <= ei; i++) { const pe = nodes[i].parentElement; if (pe) touched.add(pe); }
    if (first === last) {
      first.nodeValue = prefix;
      if (chip) first.after(chip);
      if (suffix) (chip ?? first).after(document.createTextNode(suffix));
    } else {
      first.nodeValue = prefix;
      for (let i = si + 1; i < ei; i++) nodes[i].nodeValue = "";
      last.nodeValue = suffix;
      const leadingBlank = !full.slice(0, m.start).trim();
      if (chip) { if (leadingBlank && lastChip?.isConnected) lastChip.after(chip); else first.after(chip); }
    }
    if (chip) { lastChip = chip; made.push(chip); }
    count++;
  }
  if (count) tidy(scope, touched, made);
  return count;
}

function scopeFor(textNode: Node): Element | null {
  let el: Element | null = textNode.parentElement;
  for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
    if (findSkillBlock(el.textContent ?? "")) return el;
  }
  return null;
}

function scanBody(): void {
  if (!document.body) return;
  const scopes: Element[] = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!(n.nodeValue ?? "").includes("<skill") || skippable(n)) continue;
    const s = scopeFor(n);
    if (s && !scopes.some((x) => x.contains(s))) scopes.push(s);
  }
  for (const s of scopes) { try { replaceBlocks(s); } catch (err) { console.warn("[skillify] chip replace failed:", err); } }
}

/* ---------- Popover that grows out of the chip ---------- */
const PW = 320, PH = 220, GAP = 12, MARGIN = 8; // FIXED size: long skills scroll inside, the box never grows
let panelHost: HTMLElement | null = null;
let card: HTMLElement | null = null;
let arrow: HTMLElement | null = null;
let panelTitle: HTMLElement | null = null;
let panelBody: HTMLElement | null = null;
let openChip: Element | null = null;

function ensurePanel(): void {
  if (panelHost && document.contains(panelHost)) return;
  panelHost = document.createElement("div");
  panelHost.id = "skillify-viewer";
  panelHost.style.cssText = `all:initial;position:fixed;left:0;top:0;width:${PW}px;height:${PH}px;z-index:2147483646;display:none;`;
  const sh = panelHost.attachShadow({ mode: "open" });
  sh.innerHTML = `
    <style>
      .c{position:relative;width:${PW}px;height:${PH}px;display:flex;flex-direction:column;background:#fff;color:#0f172a;border-radius:14px;
        box-shadow:0 14px 44px rgba(0,0,0,.38);font:14px system-ui,-apple-system,Segoe UI,sans-serif;transform-origin:var(--ox,0) var(--oy,0)}
      .c.go{animation:pop .2s cubic-bezier(.2,.85,.3,1.15)}
      @keyframes pop{from{opacity:0;transform:scale(.12)}to{opacity:1;transform:scale(1)}}
      .in{display:flex;flex-direction:column;flex:1;min-height:0;border-radius:14px;overflow:hidden}
      .h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#4f46e5;color:#fff;font-weight:700}
      .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .x{all:unset;cursor:pointer;padding:0 6px;font-size:15px;opacity:.85}.x:hover{opacity:1}
      .b{flex:1 1 auto;min-height:0;padding:12px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;line-height:1.55;
        scrollbar-width:thin;scrollbar-color:#a5b4fc transparent}
      .a{position:absolute;width:14px;height:14px;background:#fff;transform:rotate(45deg);border-radius:3px}
    </style>
    <div class="c" id="c"><div class="a" id="a"></div>
      <div class="in"><div class="h"><span class="t" id="t"></span><button class="x" id="x" aria-label="Close">\u2715</button></div><div class="b" id="b"></div></div>
    </div>`;
  card = sh.getElementById("c");
  arrow = sh.getElementById("a");
  panelTitle = sh.getElementById("t");
  panelBody = sh.getElementById("b");
  sh.getElementById("x")!.addEventListener("click", closePanel);
  (document.body ?? document.documentElement).appendChild(panelHost);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Place the popover beside the chip (right, else left, else below/above) and point its arrow at the chip. */
function placePanel(chip: Element, animate: boolean): void {
  if (!panelHost || !card || !arrow) return;
  const r = chip.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let x: number, y: number;
  let side: "right" | "left" | "below" | "above";
  if (r.right + GAP + PW <= vw - MARGIN) { side = "right"; x = r.right + GAP; y = clamp(cy - 48, MARGIN, vh - PH - MARGIN); }
  else if (r.left - GAP - PW >= MARGIN) { side = "left"; x = r.left - GAP - PW; y = clamp(cy - 48, MARGIN, vh - PH - MARGIN); }
  else {
    x = clamp(cx - PW / 2, MARGIN, vw - PW - MARGIN);
    if (r.bottom + GAP + PH <= vh - MARGIN) { side = "below"; y = r.bottom + GAP; } else { side = "above"; y = Math.max(MARGIN, r.top - GAP - PH); }
  }
  panelHost.style.left = `${x}px`;
  panelHost.style.top = `${y}px`;
  const ox = clamp(cx - x, 0, PW), oy = clamp(cy - y, 0, PH);
  card.style.setProperty("--ox", `${ox}px`);
  card.style.setProperty("--oy", `${oy}px`);
  arrow.style.cssText = "";
  if (side === "right") arrow.style.cssText = `left:-6px;top:${clamp(oy, 56, PH - 24) - 7}px`;
  else if (side === "left") arrow.style.cssText = `right:-6px;top:${clamp(oy, 56, PH - 24) - 7}px`;
  else if (side === "below") arrow.style.cssText = `top:-6px;left:${clamp(ox, 20, PW - 20) - 7}px;background:#4f46e5`;
  else arrow.style.cssText = `bottom:-6px;left:${clamp(ox, 20, PW - 20) - 7}px`;
  if (animate) { card.classList.remove("go"); void card.offsetWidth; card.classList.add("go"); }
}

function closePanel(): void {
  if (panelHost) panelHost.style.display = "none";
  card?.classList.remove("go");
  if (openChip instanceof HTMLElement) openChip.style.outline = "";
  openChip = null;
}

function openPanel(chip: Element): void {
  ensurePanel();
  if (openChip instanceof HTMLElement) openChip.style.outline = "";
  openChip = chip;
  if (chip instanceof HTMLElement) chip.style.outline = "2px solid #a5b4fc";
  panelTitle!.textContent = chip.getAttribute(CHIP_ATTR) ?? "";
  panelBody!.textContent = chip.getAttribute(DESC_ATTR) ?? "";
  panelBody!.scrollTop = 0;
  panelHost!.style.display = "block";
  placePanel(chip, true);
}

const insidePanel = (e: Event) => !!panelHost && (e.composedPath ? e.composedPath().includes(panelHost) : false);
const chipOf = (e: Event) => (e.target as Element | null)?.closest?.(`[${CHIP_ATTR}]`) ?? null;

function onPointerDown(e: Event): void {
  if (openChip && !chipOf(e) && !insidePanel(e)) closePanel(); // press anywhere else closes
}
function onClick(e: Event): void {
  const chip = chipOf(e);
  if (chip) {
    e.preventDefault();
    e.stopPropagation();
    if (openChip === chip) closePanel(); else openPanel(chip);
    return;
  }
  if (openChip && !insidePanel(e)) closePanel();
}

let rePlaceQueued = false;
function onViewportChange(): void {
  if (!openChip || rePlaceQueued) return;
  rePlaceQueued = true;
  window.requestAnimationFrame(() => {
    rePlaceQueued = false;
    if (!openChip) return;
    const r = openChip.getBoundingClientRect();
    if (!openChip.isConnected || r.bottom < 0 || r.top > window.innerHeight) closePanel(); else placePanel(openChip, false);
  });
}

export function startChips(): void {
  scanBody();
  // window + capture: runs before page handlers, so apps that stopPropagation can't swallow the outside-click.
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("mousedown", onPointerDown, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange, true);
  window.addEventListener("keydown", (e) => {
    const t = e.target as Element | null;
    if (e.key === "Escape" && openChip) closePanel();
    if ((e.key === "Enter" || e.key === " ") && t?.hasAttribute?.(CHIP_ATTR)) { e.preventDefault(); (t as HTMLElement).click(); }
  }, true);

  let queued = false;
  const mentions = (n: Node): boolean => (n.nodeType === 3 ? n.nodeValue : n.textContent)?.includes("<skill") ?? false;
  new MutationObserver((muts) => {
    if (queued) return;
    const hit = muts.some((m) => (m.type === "characterData" ? mentions(m.target) : Array.from(m.addedNodes).some(mentions)));
    if (!hit) return;
    queued = true;
    window.requestAnimationFrame(() => { queued = false; scanBody(); });
  }).observe(document.body ?? document.documentElement, { childList: true, subtree: true, characterData: true });
}

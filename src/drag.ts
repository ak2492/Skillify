export interface DragHandlers {
  onClick: () => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
}

const CLICK_THRESHOLD_PX = 5;

/** Pointer-drag for the floating S button. Distinguishes click vs drag. */
export function makeDraggable(el: HTMLElement, handlers: DragHandlers): () => void {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  const clampPos = (x: number, y: number): { x: number; y: number } => {
    const w = el.offsetWidth || 48;
    const h = el.offsetHeight || 48;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const r = el.getBoundingClientRect();
    baseX = r.left;
    baseY = r.top;
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    el.style.cursor = "grabbing";
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) moved = true;
    if (moved) {
      const p = clampPos(baseX + dx, baseY + dy);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    }
  };

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = "grab";
    try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (!moved) {
      handlers.onClick();
    } else {
      const r = el.getBoundingClientRect();
      handlers.onDragEnd(clampPos(r.left, r.top));
    }
  };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  return () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", endDrag);
    el.removeEventListener("pointercancel", endDrag);
  };
}

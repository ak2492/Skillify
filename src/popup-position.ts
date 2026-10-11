export interface PopupPos { top: number; left: number; flipped: boolean; }

const POPUP_WIDTH = 320;
const GAP = 8;

/** Popup goes just below S; flips above when there is no space. Horizontally clamped. */
export function computePopupPosition(
  fabRect: { top: number; bottom: number; left: number },
  popupHeight: number,
  viewport: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight }
): PopupPos {
  const ph = Math.max(120, popupHeight || 380);
  const maxLeft = Math.max(GAP, viewport.width - POPUP_WIDTH - GAP);
  const left = Math.min(Math.max(GAP, fabRect.left), maxLeft);
  let top = fabRect.bottom + GAP;
  let flipped = false;
  if (top + ph > viewport.height - GAP) {
    top = fabRect.top - ph - GAP;
    flipped = true;
  }
  if (top < GAP) top = GAP;
  if (top + ph > viewport.height - GAP && viewport.height > ph + GAP * 2) {
    top = viewport.height - ph - GAP;
  }
  return { top: Math.round(top), left: Math.round(left), flipped };
}

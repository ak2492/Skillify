import type { Skill } from "./storage";

/** Build one delimited skill block. Spec: `<skill : name>\ndescription\n<skill : name>` */
export function buildSkillBlock(name: string, description: string): string {
  const n = name.trim();
  const d = description.trim();
  return `<skill : ${n}>\n${d}\n<skill : ${n}>`;
}

/** Join selected skills (already in chosen order) with newlines. */
export function buildHeader(selected: Skill[]): string {
  return selected.map((s) => buildSkillBlock(s.name, s.description)).join("\n");
}

// Matches `<skill : anything> ... <skill : same-anything>` non-greedy, multiline.
const SKILL_BLOCK_RE = /<skill\s*:\s*(.+?)\s*>\s*[\s\S]*?\s*<skill\s*:\s*\1\s*>/g;

/** Remove every skill block from text (used to recover the user's original prompt). */
export function stripAllSkillBlocks(text: string): string {
  return text.replace(SKILL_BLOCK_RE, "").replace(/^\n+/, "");
}

/**
 * Rebuild full editor text: header (selected in order) + original prompt.
 * - Every skill addition starts on a new line (FR-INJ-4).
 * - Prompt typed first still gets header prepended (FR-INJ-5).
 * - Empty prompt returns header only; no selection returns prompt only.
 */
export function rebuildEditorText(currentFullText: string, selected: Skill[]): string {
  const userPrompt = stripAllSkillBlocks(currentFullText).replace(/^\n+/, "");
  if (selected.length === 0) return userPrompt;
  const header = buildHeader(selected);
  if (!userPrompt.trim()) return header;
  return header + "\n" + userPrompt;
}

/** One parsed skill block found in text. `start`/`end` are offsets into the scanned string. */
export interface FoundBlock { name: string; description: string; start: number; end: number }

/** Find the first skill block at or after `from` (non-global regex; safe to call repeatedly). */
export function findSkillBlock(text: string, from = 0): FoundBlock | null {
  // An optional preamble directly before the block is part of the match, so chips remove it too.
  const pre = SKILL_PREAMBLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:${pre}\\s*)?<skill\\s*:\\s*(.+?)\\s*>\\s*([\\s\\S]*?)\\s*<skill\\s*:\\s*\\1\\s*>`);
  const m = re.exec(text.slice(from));
  if (!m) return null;
  const start = from + m.index;
  return { name: m[1], description: m[2], start, end: start + m[0].length };
}

/**
 * A plain first line placed BEFORE the skill blocks. Some editors (seen on Claude.ai) lose the very first
 * pasted line; if that happens only this line is lost and every real delimiter survives. Chips swallow it.
 */
export const SKILL_PREAMBLE = "[Skills attached to this message]";

/** Full text to paste: preamble line + all skill blocks. */
export function buildInjection(selected: Skill[]): string {
  return SKILL_PREAMBLE + "\n" + buildHeader(selected);
}

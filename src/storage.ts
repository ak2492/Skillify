export interface Skill {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

export const SKILLS_KEY = "skillify.skills.v1";
export const UI_KEY = "skillify.ui.v1";
export const SELECTED_KEY = "skillify.selected.v1";
export const MAX_SKILLS = 200;
export const NAME_RE = /^[A-Za-z0-9\-_ ]+$/;

function makeId(): string {
  try {
    const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch { /* fallback below */ }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

type Store = Record<string, unknown>;

function storageArea(): {
  get(keys: string[]): Promise<Store>;
  set(items: Store): Promise<void>;
} {
  const c = (globalThis as unknown as { chrome?: { storage?: { local?: unknown } } }).chrome;
  if (c && c.storage && c.storage.local) {
    const local = c.storage.local as {
      get(keys: string[]): Promise<Store>;
      set(items: Store): Promise<void>;
    };
    return local;
  }
  // Fallback for demo page / non-extension context: in-memory + localStorage
  const mem: Store = {};
  return {
    async get(keys: string[]): Promise<Store> {
      const out: Store = {};
      for (const k of keys) {
        if (k in mem) { out[k] = mem[k]; continue; }
        try {
          const raw = window.localStorage.getItem(k);
          out[k] = raw ? JSON.parse(raw) : undefined;
        } catch { out[k] = mem[k]; }
      }
      return out;
    },
    async set(items: Store): Promise<void> {
      for (const [k, v] of Object.entries(items)) {
        mem[k] = v;
        try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
      }
    },
  };
}

export async function getSkills(): Promise<Skill[]> {
  const res = await storageArea().get([SKILLS_KEY]);
  const list = (res[SKILLS_KEY] as Skill[] | undefined) ?? [];
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export function validateSkillInput(name: string, description: string, existing: Skill[], ignoreId?: string): string | null {
  const n = name.trim();
  const d = description.trim();
  if (!n) return "Skill name is required.";
  if (n.length > 60) return "Skill name must be 60 characters or fewer.";
  if (!NAME_RE.test(n)) return "Name may only contain letters, numbers, spaces, - and _.";
  if (!d) return "Skill description is required.";
  if (d.length > 5000) return "Description must be 5000 characters or fewer.";
  const dup = existing.some((s) => s.id !== ignoreId && s.name.trim().toLowerCase() === n.toLowerCase());
  if (dup) return "Skill name already exists.";
  if (!ignoreId && existing.length >= MAX_SKILLS) return `Skill limit reached (${MAX_SKILLS}). Delete one first.`;
  return null;
}

export async function addSkill(name: string, description: string): Promise<Skill> {
  const existing = await getSkills();
  const err = validateSkillInput(name, description, existing);
  if (err) throw new Error(err);
  const skill: Skill = { id: makeId(), name: name.trim(), description: description.trim(), createdAt: Date.now() };
  const next = [skill, ...existing];
  await storageArea().set({ [SKILLS_KEY]: next });
  return skill;
}

export async function updateSkill(id: string, patch: { name?: string; description?: string }): Promise<Skill> {
  const existing = await getSkills();
  const idx = existing.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error("Skill not found.");
  const nextName = (patch.name ?? existing[idx].name).trim();
  const nextDesc = (patch.description ?? existing[idx].description).trim();
  const err = validateSkillInput(nextName, nextDesc, existing, id);
  if (err) throw new Error(err);
  const updated: Skill = { ...existing[idx], name: nextName, description: nextDesc };
  existing[idx] = updated;
  await storageArea().set({ [SKILLS_KEY]: existing });
  return updated;
}

export async function deleteSkill(id: string): Promise<void> {
  const existing = await getSkills();
  const next = existing.filter((s) => s.id !== id);
  await storageArea().set({ [SKILLS_KEY]: next });
  const selected = await getSelectedIds();
  if (selected.includes(id)) {
    await setSelectedIds(selected.filter((x) => x !== id));
  }
}

export async function getSelectedIds(): Promise<string[]> {
  const res = await storageArea().get([SELECTED_KEY]);
  const v = res[SELECTED_KEY] as string[] | undefined;
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export async function setSelectedIds(ids: string[]): Promise<void> {
  await storageArea().set({ [SELECTED_KEY]: [...ids] });
}

export interface ButtonPos { x: number; y: number; }

export async function getButtonPos(): Promise<ButtonPos | null> {
  const res = await storageArea().get([UI_KEY]);
  const v = res[UI_KEY] as ButtonPos | undefined | null;
  if (v && typeof v.x === "number" && typeof v.y === "number") return v;
  return null;
}

export async function setButtonPos(pos: ButtonPos): Promise<void> {
  await storageArea().set({ [UI_KEY]: pos });
}

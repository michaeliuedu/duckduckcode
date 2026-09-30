/**
 * Who you are in a room: a display name and a colour, used for the caret and
 * selection other people see. Persisted locally so a refresh keeps the same
 * identity; there are no accounts.
 */

import { observable, useObservable } from "./observable";
import { readJson, writeJson } from "./storage";

export interface Participant {
  readonly name: string;
  readonly color: string;
}

export const STORAGE_KEY = "duckduckcode.participant";

export const MAX_NAME_LENGTH = 24;

/** Caret colours. Chosen to stay legible on both the light and dark canvas. */
export const PALETTE: readonly string[] = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#ef4444",
];

const ADJECTIVES = ["Curious", "Quick", "Calm", "Bright", "Clever", "Patient", "Bold", "Gentle"];
const ANIMALS = ["Duck", "Otter", "Heron", "Fox", "Owl", "Newt", "Crane", "Lynx"];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** The translucent companion to a caret colour, used for remote selections. */
export function selectionColor(color: string, alpha = 0.25): string {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(125, 125, 125, ${alpha})`;
  const int = Number.parseInt(full, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/** Trims, collapses whitespace and caps the length. Empty input is rejected. */
export function sanitizeName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

export function randomParticipant(): Participant {
  return { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(PALETTE) };
}

/** Accepts a stored value, repairing or rejecting anything unexpected. */
export function acceptParticipant(raw: unknown): Participant | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { name?: unknown; color?: unknown };
  if (typeof candidate.name !== "string" || typeof candidate.color !== "string") return null;
  const name = sanitizeName(candidate.name);
  if (!name) return null;
  const color = /^#[0-9a-fA-F]{3,6}$/.test(candidate.color.trim()) ? candidate.color.trim() : PALETTE[0]!;
  return { name, color };
}

const store = observable<Participant>(() => readJson(STORAGE_KEY, acceptParticipant) ?? randomParticipant(), {
  onChange: (participant) => writeJson(STORAGE_KEY, participant),
  equals: (a, b) => a.name === b.name && a.color === b.color,
});

// Persist the generated identity immediately so the first reload keeps it.
writeJson(STORAGE_KEY, store.get());

export function useParticipant(): Participant {
  return useObservable(store);
}

export function renameParticipant(raw: string): void {
  const name = sanitizeName(raw);
  if (name) store.update((previous) => ({ ...previous, name }));
}

export function recolorParticipant(color: string): void {
  store.update((previous) => ({ ...previous, color }));
}

export function getParticipant(): Participant {
  return store.get();
}

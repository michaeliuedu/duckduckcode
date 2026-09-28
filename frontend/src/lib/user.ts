// Participant identity used for awareness (remote cursors). Persisted in
// localStorage so a refresh keeps the same name and colour.

import { useSyncExternalStore } from "react";

export interface Participant {
  name: string;
  color: string;
  colorLight: string;
}

const STORAGE_KEY = "duckduckcode.participant";

const ADJECTIVES = ["Curious", "Quick", "Calm", "Bright", "Clever", "Patient", "Bold", "Gentle"];
const ANIMALS = ["Duck", "Otter", "Heron", "Fox", "Owl", "Newt", "Crane", "Lynx"];

// Colour pairs: strong caret colour + translucent selection colour.
const PALETTE: Array<[string, string]> = [
  ["#f97316", "rgba(249,115,22,0.25)"],
  ["#22c55e", "rgba(34,197,94,0.25)"],
  ["#3b82f6", "rgba(59,130,246,0.25)"],
  ["#a855f7", "rgba(168,85,247,0.25)"],
  ["#ec4899", "rgba(236,72,153,0.25)"],
  ["#14b8a6", "rgba(20,184,166,0.25)"],
  ["#eab308", "rgba(234,179,8,0.3)"],
  ["#ef4444", "rgba(239,68,68,0.25)"],
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomParticipant(): Participant {
  const [color, colorLight] = pick(PALETTE);
  return { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color, colorLight };
}

export function loadParticipant(): Participant {
  if (typeof window === "undefined") return randomParticipant();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Participant>;
      if (p.name && p.color && p.colorLight) return p as Participant;
    }
  } catch {
    // fall through
  }
  const p = randomParticipant();
  saveParticipant(p);
  return p;
}

export function saveParticipant(p: Participant): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage may be unavailable (private mode); identity is then per-page-load
  }
}

// --- Tiny external store so components can read browser-only values with
// useSyncExternalStore (null during server rendering, no effects needed).

let current: Participant | null = null;
const listeners = new Set<() => void>();

export function getParticipantSnapshot(): Participant | null {
  if (current === null && typeof window !== "undefined") current = loadParticipant();
  return current;
}

export function getParticipantServerSnapshot(): Participant | null {
  return null;
}

export function subscribeParticipant(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateParticipant(patch: Partial<Participant>): Participant | null {
  const base = getParticipantSnapshot();
  if (!base) return null;
  current = { ...base, ...patch };
  saveParticipant(current);
  listeners.forEach((l) => l());
  return current;
}

export function useParticipant(): Participant | null {
  return useSyncExternalStore(subscribeParticipant, getParticipantSnapshot, getParticipantServerSnapshot);
}

const noopSubscribe = () => () => {};

/** window.location.origin on the client, "" during SSR. */
export function usePageOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

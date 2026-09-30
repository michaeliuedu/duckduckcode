import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { jsonCodec, numberCodec, sharedCell } from "./sharedCell";

function map() {
  return new Y.Doc().getMap<string>("meta");
}

interface Note {
  text: string;
}

const noteCodec = jsonCodec<Note | null>((raw) => {
  if (!raw || typeof raw !== "object" || typeof (raw as Note).text !== "string") return null;
  return { text: (raw as Note).text };
}, null);

describe("sharedCell", () => {
  it("round-trips a value through the Yjs map", () => {
    const cell = sharedCell(map(), "note", noteCodec);
    expect(cell.get()).toBeNull();
    cell.set({ text: "hello" });
    expect(cell.get()).toEqual({ text: "hello" });
  });

  it("returns the identical object while the stored string is unchanged", () => {
    // This is what keeps useSyncExternalStore from re-rendering forever.
    const cell = sharedCell(map(), "note", noteCodec);
    cell.set({ text: "hello" });
    expect(cell.get()).toBe(cell.get());
  });

  it("decodes again once the stored string changes", () => {
    const cell = sharedCell(map(), "note", noteCodec);
    cell.set({ text: "one" });
    const first = cell.get();
    cell.set({ text: "two" });
    expect(cell.get()).not.toBe(first);
    expect(cell.get()).toEqual({ text: "two" });
  });

  it("decodes a rejected or unparsable value to the fallback", () => {
    const shared = map();
    const cell = sharedCell(shared, "note", noteCodec);
    shared.set("note", "{not json");
    expect(cell.get()).toBeNull();
    shared.set("note", '{"text":42}');
    expect(cell.get()).toBeNull();
  });

  it("notifies subscribers when the map changes", () => {
    const shared = map();
    const cell = sharedCell(shared, "note", noteCodec);
    const listener = vi.fn();
    const unsubscribe = cell.subscribe(listener);

    cell.set({ text: "hello" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    cell.set({ text: "again" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("sees a value written by a peer", () => {
    const local = new Y.Doc();
    const remote = new Y.Doc();
    const cell = sharedCell(local.getMap<string>("meta"), "note", noteCodec);

    remote.getMap<string>("meta").set("note", JSON.stringify({ text: "from lin" }));
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));

    expect(cell.get()).toEqual({ text: "from lin" });
  });
});

describe("numberCodec", () => {
  it("stores numbers as strings, the way the room's step pointer does", () => {
    const cell = sharedCell(map(), "step", numberCodec);
    cell.set(7);
    expect(cell.get()).toBe(7);
  });

  it("decodes junk as zero", () => {
    const shared = map();
    const cell = sharedCell(shared, "step", numberCodec);
    shared.set("step", "later");
    expect(cell.get()).toBe(0);
  });
});

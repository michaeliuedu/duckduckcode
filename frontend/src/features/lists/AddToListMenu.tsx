/**
 * "Add to list" on a problem page.
 *
 * Uses a fetcher rather than a navigation: ticking a list should not leave the
 * problem you are reading. The list of lists is loaded when the menu opens, so
 * the page does not pay for it on every view.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { List } from "@/api/types";
import { Button } from "@/ui/Button";
import { CheckIcon, PlusIcon } from "@/ui/Icons";
import { Spinner } from "@/ui/Spinner";

export function AddToListMenu({ problemId }: { problemId: string }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<List[] | null>(null);
  const [containing, setContaining] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const load = async () => {
    setError("");
    try {
      const { lists: loaded, containing: ids } = await api.myLists(problemId);
      setLists(loaded);
      setContaining(new Set(ids));
    } catch {
      setError("Could not load your lists.");
      setLists([]);
    }
  };

  /**
   * Creating a list is done directly rather than through a router form.
   *
   * A form that hides itself on submit unmounts while the submission is still
   * being set up, and the request never leaves — which is exactly the bug this
   * replaced. Two awaited calls have no such window.
   */
  const createList = async () => {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    setError("");
    try {
      const { list } = await api.createList({ title, description: "", visibility: "private" });
      await api.addToList(list.id, problemId);
      setNewTitle("");
      setCreating(false);
      await load();
    } catch {
      setError("Could not create that list.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Ticks a list on or off.
   *
   * The tick moves immediately and the request is awaited behind it: a fetcher
   * submission can be cancelled by navigating away, and "I ticked it and it did
   * not save" is the one failure this control must not have. Reloading
   * afterwards also keeps the item counts honest.
   */
  const toggle = async (listId: string, isIn: boolean) => {
    setContaining((previous) => {
      const next = new Set(previous);
      if (isIn) next.delete(listId);
      else next.add(listId);
      return next;
    });
    setBusy(true);
    try {
      if (isIn) await api.removeFromList(listId, problemId);
      else await api.addToList(listId, problemId);
      await load();
    } catch {
      setError("Could not update that list.");
      // Put the tick back where it was.
      setContaining((previous) => {
        const next = new Set(previous);
        if (isIn) next.add(listId);
        else next.delete(listId);
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <Button
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="add-to-list"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && lists === null) void load();
        }}
      >
        Add to list
      </Button>

      {open && (
        <div
          role="menu"
          data-testid="list-menu"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-[var(--shadow-lifted)]"
        >
          {lists === null ? (
            <p className="flex items-center gap-2 px-2 py-3 text-[13px] text-[var(--muted)]">
              <Spinner />
              Loading your lists…
            </p>
          ) : error ? (
            <p className="px-2 py-3 text-[13px] text-[var(--error)]">{error}</p>
          ) : (
            <>
              {lists.length === 0 && (
                <p className="px-2 py-2 text-[13px] text-[var(--muted)]">
                  No lists yet. Make one below — a list is a good way to hand someone a week's worth of practice.
                </p>
              )}
              <ul className="max-h-56 overflow-y-auto">
                {lists.map((list) => {
                  const isIn = containing.has(list.id);
                  return (
                    <li key={list.id}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={isIn}
                        data-testid={`list-option-${list.slug}`}
                        onClick={() => void toggle(list.id, isIn)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[var(--chip)]"
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--brand)]">
                          {isIn && <CheckIcon size={13} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{list.title}</span>
                        <span
                          className="shrink-0 text-[11px] text-[var(--muted)]"
                          data-testid={`list-count-${list.slug}`}
                        >
                          {list.itemCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-1 border-t border-[var(--line)] pt-1">
                {creating ? (
                  <div className="flex gap-1.5 p-1">
                    <input
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createList();
                        }
                      }}
                      autoFocus
                      maxLength={120}
                      placeholder="New list name"
                      aria-label="New list name"
                      data-testid="new-list-title"
                      className="field flex-1 text-[13px]"
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      busy={busy}
                      data-testid="create-list-confirm"
                      onClick={() => void createList()}
                    >
                      Add
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    data-testid="new-list"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--brand)] hover:bg-[var(--chip)]"
                  >
                    <PlusIcon size={13} />
                    New list
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

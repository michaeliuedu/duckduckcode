/**
 * Your name and caret colour.
 *
 * The name is a plain text field — the fastest thing to change when someone
 * else sits down — with the colour swatches next to it, because two people who
 * land on the same colour cannot tell their cursors apart.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useIdentity } from "@/auth/identity";
import { useCurrentUser } from "@/auth/session";
import { MAX_NAME_LENGTH, PALETTE, recolorParticipant, renameParticipant } from "@/lib/participant";
import { IconButton } from "@/ui/IconButton";

export function IdentityControl() {
  const participant = useIdentity();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex shrink-0 items-center gap-1.5">
      {user ? (
        // Signed in, the caret name is the account's display name: a room is
        // not the place to appear as someone else. Changing it is a profile
        // edit, one click away.
        <Link
          to="/settings"
          data-testid="name-display"
          title={`Signed in as ${user.displayName}. Change it in settings.`}
          className="field flex w-[6.5rem] items-center truncate text-[12px] hover:border-[var(--brand)] sm:w-[7.5rem]"
        >
          {user.displayName}
        </Link>
      ) : (
        <input
          aria-label="Your display name"
          data-testid="name-input"
          className="field w-[6.5rem] sm:w-[7.5rem]"
          maxLength={MAX_NAME_LENGTH}
          defaultValue={participant.name}
          // Committed on blur and on Enter; `key` re-seeds the field if the name
          // changes from elsewhere.
          key={participant.name}
          onBlur={(event) => renameParticipant(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            renameParticipant(event.currentTarget.value);
            event.currentTarget.blur();
          }}
        />
      )}
      <IconButton
        label="Change your cursor colour"
        active={open}
        aria-expanded={open}
        aria-haspopup="true"
        data-testid="color-button"
        onClick={() => setOpen((previous) => !previous)}
        icon={
          <span
            className="h-3.5 w-3.5 rounded-full border border-black/10"
            style={{ backgroundColor: participant.color }}
            aria-hidden
          />
        }
      />
      {open && (
        <div
          role="group"
          aria-label="Cursor colour"
          data-testid="color-palette"
          className="absolute right-0 top-full z-20 mt-1.5 flex gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[var(--shadow-lifted)]"
        >
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Use ${color}`}
              aria-pressed={color === participant.color}
              data-testid={`color-${color.replace("#", "")}`}
              className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: color,
                borderColor: color === participant.color ? "var(--ink)" : "transparent",
              }}
              onClick={() => {
                recolorParticipant(color);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

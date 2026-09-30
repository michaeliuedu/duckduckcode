/**
 * Connection state in four words.
 *
 * The `data-*` attributes are the contract the end-to-end tests wait on, so they
 * describe the state rather than the styling.
 */

import type { ConnectionState } from "@/collab/session";

interface Described {
  label: string;
  hint: string;
  dot: string;
}

function describe({ status, synced, offline }: ConnectionState): Described {
  if (offline) {
    return { label: "Offline", hint: "You are working offline. Edits merge when you reconnect.", dot: "bg-[var(--muted)]" };
  }
  if (status === "connected" && synced) {
    return { label: "Live", hint: "Connected and in sync with everyone else.", dot: "bg-[var(--run)]" };
  }
  if (status === "connected") {
    return { label: "Syncing", hint: "Connected, catching up with the server.", dot: "bg-[var(--warn)]" };
  }
  if (status === "connecting") {
    return { label: "Connecting", hint: "Opening the connection to the server.", dot: "bg-[var(--warn)]" };
  }
  return { label: "Reconnecting", hint: "The connection dropped. Retrying with backoff.", dot: "bg-[var(--error)]" };
}

export function ConnectionPill({ connection }: { connection: ConnectionState }) {
  const { label, hint, dot } = describe(connection);
  return (
    <span
      data-testid="connection-status"
      data-status={connection.offline ? "offline" : connection.status}
      data-synced={connection.synced}
      title={hint}
      className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--muted)]"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only">{hint}</span>
    </span>
  );
}

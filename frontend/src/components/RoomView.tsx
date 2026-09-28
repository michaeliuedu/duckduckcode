"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getRoom, roomLink, wsServerUrl, type RoomResponse } from "@/lib/api";
import { updateParticipant, usePageOrigin, useParticipant } from "@/lib/user";
import { useConfig } from "./ConfigProvider";
import { DifficultyBadge } from "./ModeChooser";
import type { ConnectionStatus, EditorControls, PeerInfo } from "./CollabEditor";

// CodeMirror and Yjs need the DOM; never render them on the server.
const CollabEditor = dynamic(() => import("./CollabEditor"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading editor…</div>,
});

export function RoomView({ roomId }: { roomId: string }) {
  const { backendUrl } = useConfig();
  const [data, setData] = useState<RoomResponse | null>(null);
  const [loadError, setLoadError] = useState<{ status?: number; message: string } | null>(null);

  const participant = useParticipant();
  const pageOrigin = usePageOrigin();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [controls, setControls] = useState<EditorControls | null>(null);
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRoom(backendUrl, roomId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setLoadError({ status: err.status, message: err.message });
        else setLoadError({ message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [backendUrl, roomId]);

  const wsUrl = useMemo(() => (pageOrigin ? wsServerUrl(backendUrl, pageOrigin) : null), [backendUrl, pageOrigin]);
  const shareLink = pageOrigin ? roomLink(pageOrigin, roomId) : "";

  const onReady = useCallback((c: EditorControls) => setControls(c), []);

  function renameParticipant(name: string) {
    if (!participant || !name || name === participant.name) return;
    // The store update re-renders with the new participant, and CollabEditor
    // pushes it to awareness; calling setUser here is just belt-and-braces.
    const next = updateParticipant({ name });
    if (next) controls?.setUser(next);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the link is visible in the input anyway.
    }
  }

  function toggleOffline() {
    if (!controls) return;
    if (offline) {
      controls.connect();
      setOffline(false);
    } else {
      controls.disconnect();
      setOffline(true);
    }
  }

  if (loadError) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold">{loadError.status === 404 ? "Room not found" : "Could not open room"}</h1>
        <p className="mt-2 max-w-md text-zinc-400">
          {loadError.status === 404
            ? "This link does not point to an existing workspace. Check it with whoever shared it, or create a new one."
            : loadError.message}
        </p>
        <Link href="/" className="mt-6 rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-300">
          Back to start
        </Link>
      </main>
    );
  }

  const problem = data?.problem;
  const title = problem ? problem.title : data ? "Blank workspace" : "Loading…";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="text-sm font-semibold tracking-wide text-amber-400">
            duckduckcode
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="truncate text-sm font-medium" data-testid="room-title">
            {title}
          </h1>
          {problem && <DifficultyBadge level={problem.difficulty} />}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <ConnectionPill status={status} synced={synced} offline={offline} />
          <PeerList peers={peers} />
          {participant && (
            <label className="flex items-center gap-1 text-xs text-zinc-400">
              You:
              <input
                aria-label="Your display name"
                data-testid="name-input"
                className="w-28 rounded border bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
                defaultValue={participant.name}
                onBlur={(e) => renameParticipant(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const el = e.target as HTMLInputElement;
                    renameParticipant(el.value.trim());
                    el.blur();
                  }
                }}
                style={{ borderColor: participant.color }}
              />
            </label>
          )}
          <div className="flex items-center gap-1">
            <input
              readOnly
              aria-label="Shareable room link"
              data-testid="share-link"
              value={shareLink}
              onFocus={(e) => e.target.select()}
              className="w-44 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 focus:outline-none md:w-64 xl:w-80"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded bg-amber-400 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <button
            type="button"
            onClick={toggleOffline}
            disabled={!controls}
            data-testid="offline-toggle"
            title="Simulate losing the connection; edits made offline are merged when you reconnect."
            className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50"
          >
            {offline ? "Reconnect" : "Go offline"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {problem && (
          <aside className="hidden w-[38%] max-w-xl min-w-72 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-5 md:block" data-testid="problem-panel">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Practice problem · {problem.language}</p>
            <h2 className="mt-1 text-xl font-semibold">{problem.title}</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">
              {problem.statement.split(/\n\s*\n/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <h3 className="mt-6 text-sm font-semibold text-zinc-200">Examples</h3>
            <ol className="mt-2 space-y-3">
              {problem.examples.map((ex, i) => (
                <li key={i} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                  <div className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 font-mono">
                    <span className="text-zinc-500">Input</span>
                    <code className="whitespace-pre-wrap break-words text-zinc-200">{ex.input}</code>
                    <span className="text-zinc-500">Output</span>
                    <code className="whitespace-pre-wrap break-words text-zinc-200">{ex.output}</code>
                  </div>
                  {ex.explanation && <p className="mt-2 text-zinc-400">{ex.explanation}</p>}
                </li>
              ))}
            </ol>
          </aside>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-4 py-1.5 text-xs text-zinc-400">
            <span className="font-mono text-zinc-300">main.py</span>
            <span>·</span>
            <span>{data?.room.language ?? "python"}</span>
            {!synced && status === "connected" && <span className="ml-auto text-amber-400">Syncing…</span>}
          </div>
          <div className="min-h-0 flex-1">
            {data && participant && wsUrl ? (
              <CollabEditor
                roomId={roomId}
                wsServerUrl={wsUrl}
                participant={participant}
                onStatus={setStatus}
                onSynced={setSynced}
                onPeers={setPeers}
                onReady={onReady}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">Opening room…</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ConnectionPill({ status, synced, offline }: { status: ConnectionStatus; synced: boolean; offline: boolean }) {
  let label: string;
  let tone: string;
  if (offline) {
    label = "Offline (edits saved locally)";
    tone = "bg-zinc-700 text-zinc-200";
  } else if (status === "connected" && synced) {
    label = "Live";
    tone = "bg-emerald-500/20 text-emerald-300";
  } else if (status === "connected") {
    label = "Connected, syncing";
    tone = "bg-amber-500/20 text-amber-300";
  } else if (status === "connecting") {
    label = "Connecting…";
    tone = "bg-amber-500/20 text-amber-300";
  } else {
    label = "Reconnecting…";
    tone = "bg-rose-500/20 text-rose-300";
  }
  return (
    <span data-testid="connection-status" data-status={offline ? "offline" : status} data-synced={synced} className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function PeerList({ peers }: { peers: PeerInfo[] }) {
  return (
    <ul className="flex items-center -space-x-1" aria-label="Participants" data-testid="peer-list">
      {peers.map((p) => (
        <li
          key={p.clientId}
          title={p.isLocal ? `${p.name} (you)` : p.name}
          data-testid="peer"
          data-peer-name={p.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-900 text-[11px] font-semibold text-zinc-950"
          style={{ backgroundColor: p.color }}
        >
          {initials(p.name)}
        </li>
      ))}
    </ul>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

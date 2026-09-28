"use client";

// Collaborative CodeMirror editor bound to a Yjs document that is synced
// through the Go backend with y-websocket. Client-only: import via
// next/dynamic with ssr: false.

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, indentUnit } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { Participant } from "@/lib/user";

// Private message types shared with the Go server (see backend/internal/yproto).
const MSG_SNAPSHOT_REQUEST = 100;
const MSG_SNAPSHOT_RESPONSE = 101;

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface PeerInfo {
  clientId: number;
  name: string;
  color: string;
  isLocal: boolean;
}

export interface EditorControls {
  /** Drop the WebSocket (edits keep working locally). */
  disconnect(): void;
  /** Reconnect and resync. */
  connect(): void;
  /** Update the local participant shown to others. */
  setUser(p: Participant): void;
  /** Current document text (for tests/diagnostics). */
  getText(): string;
}

export interface CollabEditorProps {
  roomId: string;
  wsServerUrl: string;
  participant: Participant;
  onStatus(status: ConnectionStatus): void;
  onSynced(synced: boolean): void;
  onPeers(peers: PeerInfo[]): void;
  onReady(controls: EditorControls): void;
}

export default function CollabEditor(props: CollabEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Callbacks are kept in a ref so the effect below does not re-run (and
  // tear down the connection) whenever the parent re-renders.
  const cbRef = useRef(props);
  useEffect(() => {
    cbRef.current = props;
  });
  // Awareness setter captured by the main effect so participant changes
  // (renames) propagate without re-creating the connection.
  const setUserRef = useRef<((p: Participant) => void) | null>(null);

  const { roomId, wsServerUrl, participant } = props;
  useEffect(() => {
    setUserRef.current?.(participant);
  }, [participant]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const doc = new Y.Doc();
    const ytext = doc.getText("content");

    const provider = new WebsocketProvider(wsServerUrl, roomId, doc, {
      // Force all traffic through the server; otherwise two tabs in the same
      // browser would sync via BroadcastChannel and mask server problems.
      disableBc: true,
      maxBackoffTime: 2500,
    });

    // Server-requested compaction: reply with the full document state tagged
    // with the sequence number the server told us we have.
    provider.messageHandlers[MSG_SNAPSHOT_REQUEST] = (encoder, decoder, prov) => {
      const seq = decoding.readVarUint(decoder);
      encoding.writeVarUint(encoder, MSG_SNAPSHOT_RESPONSE);
      encoding.writeVarUint(encoder, seq);
      encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(prov.doc));
    };

    const awareness = provider.awareness;
    const setUser = (p: Participant) => {
      awareness.setLocalStateField("user", { name: p.name, color: p.color, colorLight: p.colorLight });
    };
    setUser(cbRef.current.participant);
    setUserRef.current = setUser;

    const emitPeers = () => {
      const peers: PeerInfo[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const user = (state as { user?: { name?: string; color?: string } }).user;
        if (!user) return;
        peers.push({
          clientId,
          name: user.name ?? "Anonymous",
          color: user.color ?? "#888",
          isLocal: clientId === doc.clientID,
        });
      });
      peers.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.name.localeCompare(b.name));
      cbRef.current.onPeers(peers);
    };
    awareness.on("change", emitPeers);
    emitPeers();

    const onStatus = ({ status }: { status: ConnectionStatus }) => cbRef.current.onStatus(status);
    const onSync = (synced: boolean) => cbRef.current.onSynced(synced);
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    cbRef.current.onStatus(provider.wsconnected ? "connected" : "connecting");

    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          // No CodeMirror history(): undo/redo is handled by Y.UndoManager so
          // it only reverts local edits, never a collaborator's.
          bracketMatching(),
          indentOnInput(),
          indentUnit.of("    "),
          python(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          oneDark,
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab]),
          yCollab(ytext, awareness, { undoManager }),
          EditorView.contentAttributes.of({ "aria-label": "Shared code editor", "data-testid": "editor" }),
        ],
      }),
    });

    cbRef.current.onReady({
      disconnect: () => provider.disconnect(),
      connect: () => provider.connect(),
      setUser,
      getText: () => ytext.toString(),
    });

    return () => {
      setUserRef.current = null;
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      awareness.off("change", emitPeers);
      view.destroy();
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, wsServerUrl]);

  return <div ref={hostRef} className="h-full min-h-0 [&>.cm-editor]:h-full" />;
}

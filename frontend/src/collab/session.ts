/**
 * A room session: the Yjs document, its WebSocket provider, and the shared state
 * that hangs off it.
 *
 * Deliberately framework-free — no React in this file. The hook in
 * `useRoomSession.ts` does nothing but create one of these, hand it out and
 * destroy it. Connection status and the participant list are exposed as
 * observables so components subscribe to exactly what they read.
 */

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import type { Awareness } from "y-protocols/awareness";
import { observable, type Observable } from "@/lib/observable";
import { selectionColor, type Participant } from "@/lib/participant";
import { parseRunResult, type RunResult } from "@/python/run";
import { parseTestRun, type TestRun } from "@/python/tests";
import { parseTraceResult, type TraceResult } from "@/python/trace";
import { jsonCodec, numberCodec, sharedCell, type SharedCell } from "./sharedCell";

/**
 * Private message types in the y-websocket stream. The backend cannot merge Yjs
 * updates itself, so once a room's log grows past its threshold it asks a synced
 * client for the full document state and stores that as a snapshot.
 */
const MSG_SNAPSHOT_REQUEST = 100;
const MSG_SNAPSHOT_RESPONSE = 101;

/** Keys in the room's shared metadata map. Wire-compatible with earlier builds. */
const KEY_RUN = "lastRun";
const KEY_TRACE = "lastTrace";
const KEY_TRACE_STEP = "traceStep";
const KEY_TESTS = "lastTests";

/** The single collaborative text; the backend seeds starter code into it. */
const TEXT_NAME = "content";
const META_NAME = "meta";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ConnectionState {
  status: ConnectionStatus;
  /** The document has caught up with the server at least once. */
  synced: boolean;
  /** The user asked to work offline, as opposed to the network failing. */
  offline: boolean;
}

export interface PeerInfo {
  clientId: number;
  name: string;
  color: string;
  isLocal: boolean;
}

export interface SharedRoomState {
  run: SharedCell<RunResult | null>;
  trace: SharedCell<TraceResult | null>;
  traceStep: SharedCell<number>;
  /** The last test run, so both people see the same pass/fail. */
  tests: SharedCell<TestRun | null>;
}

export interface RoomSession {
  readonly roomId: string;
  readonly doc: Y.Doc;
  readonly text: Y.Text;
  readonly undoManager: Y.UndoManager;
  readonly awareness: Awareness;
  readonly shared: SharedRoomState;
  readonly connection: Observable<ConnectionState>;
  readonly peers: Observable<readonly PeerInfo[]>;

  /** Publishes who you are to the other participants. */
  setIdentity(participant: Participant): void;
  /** The current document text. */
  getSource(): string;
  /** Publishes a trace and resets the shared step pointer in one transaction. */
  publishTrace(trace: TraceResult): void;
  goOffline(): void;
  goOnline(): void;
  destroy(): void;
}

export interface RoomSessionOptions {
  roomId: string;
  /** The `/ws/rooms` prefix; y-websocket appends `/<roomId>`. */
  wsServerUrl: string;
  participant: Participant;
}

function samePeers(a: readonly PeerInfo[], b: readonly PeerInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every((peer, index) => {
      const other = b[index]!;
      return peer.clientId === other.clientId && peer.name === other.name && peer.color === other.color;
    })
  );
}

function readPeers(awareness: Awareness, localClientId: number): PeerInfo[] {
  const peers: PeerInfo[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
    if (!user) return;
    peers.push({
      clientId,
      name: typeof user.name === "string" ? user.name : "Anonymous",
      color: typeof user.color === "string" ? user.color : "#888888",
      isLocal: clientId === localClientId,
    });
  });
  // You first, then everyone else alphabetically, so avatars do not jump around.
  peers.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.name.localeCompare(b.name));
  return peers;
}

export function createRoomSession({ roomId, wsServerUrl, participant }: RoomSessionOptions): RoomSession {
  const doc = new Y.Doc();
  const text = doc.getText(TEXT_NAME);
  const meta = doc.getMap<string>(META_NAME);
  const undoManager = new Y.UndoManager(text);

  const provider = new WebsocketProvider(wsServerUrl, roomId, doc, {
    // Cross-tab BroadcastChannel sync is off so every update really goes through
    // the server; that is what the e2e "two sessions" tests exercise.
    disableBc: true,
    maxBackoffTime: 2500,
  });

  provider.messageHandlers[MSG_SNAPSHOT_REQUEST] = (encoder, decoder, instance) => {
    const seq = decoding.readVarUint(decoder);
    encoding.writeVarUint(encoder, MSG_SNAPSHOT_RESPONSE);
    encoding.writeVarUint(encoder, seq);
    encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(instance.doc));
  };

  const { awareness } = provider;

  const connection = observable<ConnectionState>(
    { status: provider.wsconnected ? "connected" : "connecting", synced: provider.synced, offline: false },
    { equals: (a, b) => a.status === b.status && a.synced === b.synced && a.offline === b.offline },
  );

  const peers = observable<readonly PeerInfo[]>(() => readPeers(awareness, doc.clientID), { equals: samePeers });

  const onStatus = ({ status }: { status: ConnectionStatus }) => {
    connection.update((previous) => ({ ...previous, status }));
  };
  const onSync = (synced: boolean) => {
    connection.update((previous) => ({ ...previous, synced }));
  };
  const onPeers = () => peers.set(readPeers(awareness, doc.clientID));

  provider.on("status", onStatus);
  provider.on("sync", onSync);
  awareness.on("change", onPeers);

  const setIdentity = (next: Participant) => {
    // y-codemirror.next reads exactly these three fields for remote carets.
    awareness.setLocalStateField("user", {
      name: next.name,
      color: next.color,
      colorLight: selectionColor(next.color),
    });
  };
  setIdentity(participant);

  const shared: SharedRoomState = {
    run: sharedCell(meta, KEY_RUN, jsonCodec<RunResult | null>(parseRunResult, null)),
    trace: sharedCell(meta, KEY_TRACE, jsonCodec<TraceResult | null>(parseTraceResult, null)),
    traceStep: sharedCell(meta, KEY_TRACE_STEP, numberCodec),
    tests: sharedCell(meta, KEY_TESTS, jsonCodec<TestRun | null>(parseTestRun, null)),
  };

  return {
    roomId,
    doc,
    text,
    undoManager,
    awareness,
    shared,
    connection,
    peers,
    setIdentity,
    getSource: () => text.toString(),
    publishTrace: (trace) => {
      doc.transact(() => {
        shared.trace.set(trace);
        shared.traceStep.set(0);
      });
    },
    goOffline: () => {
      provider.disconnect();
      connection.update((previous) => ({ ...previous, offline: true }));
    },
    goOnline: () => {
      connection.update((previous) => ({ ...previous, offline: false }));
      provider.connect();
    },
    destroy: () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      awareness.off("change", onPeers);
      undoManager.destroy();
      provider.destroy();
      doc.destroy();
    },
  };
}

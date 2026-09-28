// Package hub relays Yjs updates between the WebSocket clients of a room and
// persists them through the store.
//
// # Design notes
//
// The server never materialises a Yjs document. Each room keeps an in-memory
// mirror of what is in PostgreSQL: an optional snapshot plus the ordered list
// of updates that came after it. New clients receive that whole sequence and
// Yjs applies it idempotently on the client side.
//
// Because the server cannot compute state-vector diffs, compaction is
// delegated to clients: once a room has accumulated SnapshotEvery updates the
// server asks a connected client (message type 100) for its full encoded
// state, tagged with the highest sequence number that client has been sent.
// The client replies (message type 101) and the server atomically replaces
// the snapshot and deletes the covered update rows.
//
// All per-room mutations happen under room.mu, which makes "persist then
// broadcast" a single ordered step: every client sees updates in exactly the
// order they received sequence numbers.
//
// Scaling: with a single backend instance the in-memory room state is
// authoritative for ordering. Running several instances requires routing all
// connections of a room to the same instance or relaying updates between
// instances (e.g. via Postgres LISTEN/NOTIFY or Redis pub/sub). See README.
package hub

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/duckduckcode/backend/internal/store"
	"github.com/duckduckcode/backend/internal/yproto"
)

const (
	// maxMessageBytes bounds a single incoming WebSocket message (snapshot
	// responses carry the whole document).
	maxMessageBytes = 16 << 20
	// sendBuffer is the per-client outbound queue; a client that cannot keep
	// up is disconnected and will resync on reconnect.
	sendBuffer = 256
	// pingInterval keeps idle connections alive through load balancers.
	pingInterval = 25 * time.Second
	// writeTimeout bounds a single WebSocket write.
	writeTimeout = 10 * time.Second
	// snapshotRequestTimeout is how long we wait for a snapshot response
	// before allowing another request.
	snapshotRequestTimeout = 30 * time.Second

	// CloseRoomNotFound is sent when the room does not exist. y-websocket
	// treats 4400-4499 as permanent and stops reconnecting.
	CloseRoomNotFound websocket.StatusCode = 4404
)

// Hub manages all live rooms.
type Hub struct {
	store          *store.Store
	log            *slog.Logger
	snapshotEvery  int
	originPatterns []string

	mu    sync.Mutex
	rooms map[string]*room
}

// Options configures a Hub.
type Options struct {
	SnapshotEvery int
	// OriginPatterns are host[:port] patterns (no scheme) allowed to open
	// WebSockets in addition to same-origin requests.
	OriginPatterns []string
}

// New creates a Hub.
func New(st *store.Store, log *slog.Logger, opts Options) *Hub {
	if opts.SnapshotEvery <= 0 {
		opts.SnapshotEvery = 200
	}
	return &Hub{
		store:          st,
		log:            log,
		snapshotEvery:  opts.SnapshotEvery,
		originPatterns: opts.OriginPatterns,
		rooms:          map[string]*room{},
	}
}

// Stats is a point-in-time view used by tests and diagnostics.
type Stats struct {
	Rooms   int
	Clients int
}

// Stats returns live room/client counts.
func (h *Hub) Stats() Stats {
	h.mu.Lock()
	defer h.mu.Unlock()
	s := Stats{Rooms: len(h.rooms)}
	for _, r := range h.rooms {
		r.mu.Lock()
		s.Clients += len(r.clients)
		r.mu.Unlock()
	}
	return s
}

// ServeRoom upgrades the request to a WebSocket and joins the client to the
// room. It blocks until the connection ends.
func (h *Hub) ServeRoom(w http.ResponseWriter, r *http.Request, roomID string) {
	ctx := r.Context()
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns:  h.originPatterns,
		CompressionMode: websocket.CompressionContextTakeover,
	})
	if err != nil {
		h.log.Warn("websocket accept failed", "room", roomID, "err", err)
		return
	}
	conn.SetReadLimit(maxMessageBytes)

	if _, err := h.store.GetRoom(ctx, roomID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			conn.Close(CloseRoomNotFound, "room not found")
			return
		}
		h.log.Error("lookup room", "room", roomID, "err", err)
		conn.Close(websocket.StatusInternalError, "database error")
		return
	}

	rm, err := h.getOrLoadRoom(ctx, roomID)
	if err != nil {
		h.log.Error("load room state", "room", roomID, "err", err)
		conn.Close(websocket.StatusInternalError, "failed to load room")
		return
	}

	c := &client{
		hub:        h,
		room:       rm,
		conn:       conn,
		send:       make(chan []byte, sendBuffer),
		yClientIDs: map[uint64]uint64{},
		remote:     r.RemoteAddr,
	}
	rm.join(c)
	h.log.Info("client joined", "room", roomID, "remote", c.remote, "clients", rm.clientCount())

	writeCtx, cancelWrite := context.WithCancel(context.Background())
	go c.writeLoop(writeCtx)

	readErr := c.readLoop(ctx)

	rm.leave(c)
	cancelWrite()
	h.maybeEvict(rm)

	var ce *closeError
	switch {
	case errors.As(readErr, &ce):
		h.log.Info("closing client", "room", roomID, "remote", c.remote, "code", ce.code, "err", ce.err)
		conn.Close(ce.code, ce.reason)
	default:
		// Normal close from the peer, context cancellation or a network error.
		conn.CloseNow()
	}
	h.log.Info("client left", "room", roomID, "remote", c.remote, "clients", rm.clientCount())
}

// closeError asks ServeRoom to end the connection with a specific status.
type closeError struct {
	code   websocket.StatusCode
	reason string
	err    error
}

func (e *closeError) Error() string { return fmt.Sprintf("%s: %v", e.reason, e.err) }
func (e *closeError) Unwrap() error { return e.err }

func protocolErr(err error) error {
	return &closeError{code: websocket.StatusPolicyViolation, reason: "protocol error", err: err}
}

func internalErr(err error) error {
	return &closeError{code: websocket.StatusInternalError, reason: "server error", err: err}
}

// Shutdown closes every connection with "going away" so clients reconnect
// (to the replacement task during a deploy).
func (h *Hub) Shutdown(ctx context.Context) {
	h.mu.Lock()
	rooms := make([]*room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.mu.Unlock()
	var wg sync.WaitGroup
	for _, r := range rooms {
		r.mu.Lock()
		for c := range r.clients {
			wg.Add(1)
			go func(c *client) {
				defer wg.Done()
				c.conn.Close(websocket.StatusGoingAway, "server shutting down")
			}(c)
		}
		r.mu.Unlock()
	}
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-ctx.Done():
	case <-done:
	}
}

func (h *Hub) getOrLoadRoom(ctx context.Context, roomID string) (*room, error) {
	h.mu.Lock()
	rm, ok := h.rooms[roomID]
	if !ok {
		rm = &room{
			id:        roomID,
			hub:       h,
			clients:   map[*client]struct{}{},
			awareness: map[uint64]yproto.AwarenessEntry{},
		}
		h.rooms[roomID] = rm
	}
	h.mu.Unlock()

	rm.mu.Lock()
	defer rm.mu.Unlock()
	if !rm.loaded {
		st, err := h.store.LoadDocState(ctx, roomID)
		if err != nil {
			return nil, err
		}
		rm.snapshot = st.Snapshot
		rm.updates = st.Updates
		rm.loaded = true
		h.log.Debug("room state loaded", "room", roomID, "hasSnapshot", st.Snapshot != nil, "updates", len(st.Updates))
	}
	return rm, nil
}

// maybeEvict drops an empty room from memory so it is reloaded fresh from the
// database on the next join.
func (h *Hub) maybeEvict(rm *room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if len(rm.clients) == 0 && h.rooms[rm.id] == rm {
		delete(h.rooms, rm.id)
	}
}

// ---------------------------------------------------------------------------
// room
// ---------------------------------------------------------------------------

type room struct {
	id  string
	hub *Hub

	mu        sync.Mutex
	loaded    bool
	clients   map[*client]struct{}
	snapshot  *store.Snapshot
	updates   []store.Update
	awareness map[uint64]yproto.AwarenessEntry

	// snapshotClient is the client currently asked for a compacted state, if
	// any; snapshotPendingAt is when it was asked.
	snapshotClient    *client
	snapshotPendingAt time.Time
}

func (r *room) clientCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.clients)
}

// maxSeq returns the highest persisted sequence number in memory.
func (r *room) maxSeq() int64 {
	if n := len(r.updates); n > 0 {
		return r.updates[n-1].Seq
	}
	if r.snapshot != nil {
		return r.snapshot.Seq
	}
	return 0
}

// join registers the client and sends the initial handshake: current
// awareness of the other participants and a SyncStep1 asking the client for
// any state it has that we might be missing (e.g. edits made while offline).
func (r *room) join(c *client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[c] = struct{}{}
	if len(r.awareness) > 0 {
		entries := make([]yproto.AwarenessEntry, 0, len(r.awareness))
		for _, a := range r.awareness {
			entries = append(entries, a)
		}
		c.enqueue(yproto.AwarenessMessage(yproto.EncodeAwarenessUpdate(entries)))
	}
	c.enqueue(yproto.SyncStep1Message(yproto.EmptyStateVector))
}

// leave unregisters the client and tells the others its awareness states are
// gone.
func (r *room) leave(c *client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clients, c)
	if r.snapshotClient == c {
		// The client we asked for a snapshot is gone; allow another request.
		r.snapshotClient = nil
	}
	var removed []yproto.AwarenessEntry
	for cid, clock := range c.yClientIDs {
		if _, ok := r.awareness[cid]; ok {
			delete(r.awareness, cid)
			removed = append(removed, yproto.AwarenessEntry{ClientID: cid, Clock: clock + 1, State: "null"})
		}
	}
	if len(removed) > 0 {
		msg := yproto.AwarenessMessage(yproto.EncodeAwarenessUpdate(removed))
		for other := range r.clients {
			other.enqueue(msg)
		}
	}
}

// replayTo sends the full persisted document to one client followed by an
// (empty) SyncStep2 so the client flips to "synced" only after everything
// before it has been applied.
func (r *room) replayTo(c *client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.snapshot != nil {
		c.enqueue(yproto.SyncUpdateMessage(r.snapshot.State))
	}
	for _, u := range r.updates {
		c.enqueue(yproto.SyncUpdateMessage(u.Data))
	}
	c.lastSeqSent = r.maxSeq()
	c.replayed = true
	c.enqueue(yproto.SyncStep2Message(yproto.EmptyUpdate))
}

// applyUpdate persists an update from c and relays it to everyone else.
func (r *room) applyUpdate(ctx context.Context, c *client, update []byte) error {
	if yproto.IsEmptyUpdate(update) {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	seq, err := r.hub.store.AppendUpdate(ctx, r.id, update)
	if err != nil {
		return err
	}
	// Copy: the slice aliases the read buffer of the connection.
	data := append([]byte(nil), update...)
	r.updates = append(r.updates, store.Update{Seq: seq, Data: data})

	msg := yproto.SyncUpdateMessage(data)
	for other := range r.clients {
		if other == c {
			continue
		}
		other.enqueue(msg)
		other.lastSeqSent = seq
	}
	// The author trivially holds its own update. Every room update is either
	// broadcast to a client or authored by it, so after replay lastSeqSent is
	// exactly "this client holds all room updates with seq <= lastSeqSent".
	if c.replayed {
		c.lastSeqSent = seq
	}

	r.maybeRequestSnapshot(c)
	return nil
}

// maybeRequestSnapshot asks the given client for a compacted state once the
// log is long enough. Must be called with r.mu held.
func (r *room) maybeRequestSnapshot(c *client) {
	if len(r.updates) < r.hub.snapshotEvery {
		return
	}
	if r.snapshotClient != nil && time.Since(r.snapshotPendingAt) < snapshotRequestTimeout {
		return
	}
	// Only a client that has received the full replay can vouch for the log.
	if !c.replayed || c.lastSeqSent == 0 {
		return
	}
	r.snapshotClient = c
	r.snapshotPendingAt = time.Now()
	c.enqueue(yproto.SnapshotRequestMessage(c.lastSeqSent))
	r.hub.log.Debug("snapshot requested", "room", r.id, "seq", c.lastSeqSent, "updates", len(r.updates))
}

// applySnapshot stores a compacted state sent by a client.
func (r *room) applySnapshot(ctx context.Context, c *client, seq int64, state []byte) error {
	if len(state) < 2 {
		return fmt.Errorf("snapshot too short")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	// A client may only vouch for sequence numbers it has actually been sent.
	if !c.replayed || seq > c.lastSeqSent {
		return fmt.Errorf("snapshot seq %d exceeds client seq %d (replayed=%v)", seq, c.lastSeqSent, c.replayed)
	}
	if r.snapshotClient == c {
		r.snapshotClient = nil
	}
	if r.snapshot != nil && seq <= r.snapshot.Seq {
		return nil
	}
	deleted, err := r.hub.store.SaveSnapshot(ctx, r.id, seq, state)
	if err != nil {
		return err
	}
	r.snapshot = &store.Snapshot{Seq: seq, State: append([]byte(nil), state...)}
	kept := r.updates[:0]
	for _, u := range r.updates {
		if u.Seq > seq {
			kept = append(kept, u)
		}
	}
	r.updates = kept
	r.hub.log.Info("snapshot compacted", "room", r.id, "seq", seq, "deletedUpdates", deleted, "remaining", len(r.updates), "bytes", len(state))
	return nil
}

// applyAwareness records awareness states from c and rebroadcasts the raw
// message to every client in the room, including c. Echoing to the sender is
// intentional: y-websocket drops connections that receive no message for 30s
// and relies on its own 15s awareness heartbeat being echoed back.
func (r *room) applyAwareness(c *client, raw []byte, entries []yproto.AwarenessEntry) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, e := range entries {
		if e.IsRemoval() {
			delete(r.awareness, e.ClientID)
			delete(c.yClientIDs, e.ClientID)
			continue
		}
		r.awareness[e.ClientID] = e
		c.yClientIDs[e.ClientID] = e.Clock
	}
	for other := range r.clients {
		other.enqueue(raw)
	}
}

func (r *room) awarenessSnapshot() []yproto.AwarenessEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	entries := make([]yproto.AwarenessEntry, 0, len(r.awareness))
	for _, a := range r.awareness {
		entries = append(entries, a)
	}
	return entries
}

// ---------------------------------------------------------------------------
// client
// ---------------------------------------------------------------------------

type client struct {
	hub  *Hub
	room *room
	conn *websocket.Conn
	send chan []byte

	remote string
	// replayed is set once the client has been sent the full persisted log
	// (guarded by room.mu).
	replayed bool
	// lastSeqSent is the highest update sequence this client is known to
	// hold, either because we sent it or because it authored it (guarded by
	// room.mu).
	lastSeqSent int64
	// yClientIDs maps Yjs client ids announced via awareness on this
	// connection to their last clock (guarded by room.mu).
	yClientIDs map[uint64]uint64

	dropOnce sync.Once
}

// enqueue queues a message; if the client is too slow it is disconnected so
// that it resyncs from scratch instead of missing an update.
func (c *client) enqueue(msg []byte) {
	select {
	case c.send <- msg:
	default:
		c.dropOnce.Do(func() {
			c.hub.log.Warn("client send buffer full; disconnecting", "room", c.room.id, "remote", c.remote)
			// CloseNow rather than Close: we may be holding room.mu and must
			// not block on a close handshake. The client reconnects and resyncs.
			c.conn.CloseNow()
		})
	}
}

func (c *client) writeLoop(ctx context.Context) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.send:
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Write(wctx, websocket.MessageBinary, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ticker.C:
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Ping(wctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *client) readLoop(ctx context.Context) error {
	for {
		typ, data, err := c.conn.Read(ctx)
		if err != nil {
			return err
		}
		if typ != websocket.MessageBinary {
			continue
		}
		if err := c.handleMessage(ctx, data); err != nil {
			return err
		}
	}
}

func (c *client) handleMessage(ctx context.Context, data []byte) error {
	d := yproto.NewDecoder(data)
	msgType, err := d.ReadVarUint()
	if err != nil {
		return protocolErr(err)
	}
	switch msgType {
	case yproto.MsgSync:
		sub, err := d.ReadVarUint()
		if err != nil {
			return protocolErr(err)
		}
		payload, err := d.ReadVarUint8Array()
		if err != nil {
			return protocolErr(err)
		}
		switch sub {
		case yproto.SyncStep1:
			// The client wants our state. We cannot diff against its state
			// vector, so send everything we have; Yjs de-duplicates.
			c.room.replayTo(c)
		case yproto.SyncStep2, yproto.SyncUpdate:
			if err := c.room.applyUpdate(ctx, c, payload); err != nil {
				return internalErr(fmt.Errorf("persist update: %w", err))
			}
		default:
			return protocolErr(fmt.Errorf("unknown sync sub-type %d", sub))
		}
	case yproto.MsgAwareness:
		payload, err := d.ReadVarUint8Array()
		if err != nil {
			return protocolErr(err)
		}
		entries, err := yproto.ParseAwarenessUpdate(payload)
		if err != nil {
			return protocolErr(err)
		}
		// Copy: data aliases the connection's read buffer.
		c.room.applyAwareness(c, append([]byte(nil), data...), entries)
	case yproto.MsgQueryAwareness:
		entries := c.room.awarenessSnapshot()
		c.enqueue(yproto.AwarenessMessage(yproto.EncodeAwarenessUpdate(entries)))
	case yproto.MsgSnapshotResponse:
		seq, err := d.ReadVarUint()
		if err != nil {
			return protocolErr(err)
		}
		state, err := d.ReadVarUint8Array()
		if err != nil {
			return protocolErr(err)
		}
		if err := c.room.applySnapshot(ctx, c, int64(seq), state); err != nil {
			// Bad snapshots are logged but not fatal; the log simply keeps growing
			// until another client answers.
			c.hub.log.Warn("snapshot rejected", "room", c.room.id, "err", err)
		}
	case yproto.MsgAuth:
		// Not used by this server.
	default:
		c.hub.log.Debug("ignoring unknown message type", "type", msgType)
	}
	return nil
}

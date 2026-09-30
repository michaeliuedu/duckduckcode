package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/duckduckcode/backend/internal/seed"
	"github.com/duckduckcode/backend/internal/server"
	"github.com/duckduckcode/backend/internal/store"
	"github.com/duckduckcode/backend/internal/testutil"
	"github.com/duckduckcode/backend/internal/yproto"
)

// newTestServer starts an HTTP test server backed by the shared test DB.
func newTestServer(t *testing.T, snapshotEvery int) (*httptest.Server, *server.Server) {
	t.Helper()
	st := store.New(testutil.Pool(t))
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if testing.Verbose() {
		log = slog.New(slog.NewTextHandler(testWriter{t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
	}
	// The seeded problems are ordinary rows now, so the tests need them
	// inserted just as a real boot would. Idempotent, so this is cheap after
	// the first call in a test binary.
	if err := seed.Apply(context.Background(), st, log); err != nil {
		t.Fatalf("seed problems: %v", err)
	}
	srv := server.New(st, log, server.Options{SnapshotEvery: snapshotEvery, Version: "test"})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		srv.Hub().Shutdown(ctx)
		ts.Close()
	})
	return ts, srv
}

type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Log(strings.TrimRight(string(p), "\n"))
	return len(p), nil
}

func createRoom(t *testing.T, ts *httptest.Server, body string) (int, server.RoomResponse) {
	t.Helper()
	resp, err := http.Post(ts.URL+"/api/rooms", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out server.RoomResponse
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusCreated {
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decode: %v (%s)", err, raw)
		}
	}
	return resp.StatusCode, out
}

// ---------------------------------------------------------------------------
// Room creation API
// ---------------------------------------------------------------------------

func TestCreatePracticeRoom(t *testing.T) {
	ts, _ := newTestServer(t, 200)

	status, created := createRoom(t, ts, `{"mode":"practice","problemId":"two-sum"}`)
	if status != http.StatusCreated {
		t.Fatalf("status %d", status)
	}
	if len(created.Room.ID) != 22 {
		t.Fatalf("room id should be 22 url-safe chars, got %q", created.Room.ID)
	}
	if created.Room.Mode != store.ModePractice || created.Room.ProblemID == nil || *created.Room.ProblemID != "two-sum" {
		t.Fatalf("unexpected room %+v", created.Room)
	}
	if created.Problem == nil || created.Problem.ID != "two-sum" || created.Problem.StarterCode == "" {
		t.Fatalf("expected embedded problem, got %+v", created.Problem)
	}

	// The room is retrievable with the same problem attached (what a page
	// refresh does).
	resp, err := http.Get(ts.URL + "/api/rooms/" + created.Room.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET status %d", resp.StatusCode)
	}
	var fetched server.RoomResponse
	if err := json.NewDecoder(resp.Body).Decode(&fetched); err != nil {
		t.Fatal(err)
	}
	if fetched.Room.ID != created.Room.ID || fetched.Problem == nil || fetched.Problem.ID != "two-sum" {
		t.Fatalf("fetched room mismatch: %+v", fetched)
	}
}

func TestCreateBlankRoom(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	status, created := createRoom(t, ts, `{"mode":"blank"}`)
	if status != http.StatusCreated {
		t.Fatalf("status %d", status)
	}
	if created.Room.Mode != store.ModeBlank || created.Room.ProblemID != nil || created.Problem != nil {
		t.Fatalf("unexpected blank room %+v", created)
	}

	// Two rooms never share an id.
	_, second := createRoom(t, ts, `{"mode":"blank"}`)
	if second.Room.ID == created.Room.ID {
		t.Fatal("duplicate room id")
	}
}

func TestCreateRoomValidation(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	cases := map[string]string{
		"bad mode":           `{"mode":"quiz"}`,
		"unknown problem":    `{"mode":"practice","problemId":"nope"}`,
		"blank with problem": `{"mode":"blank","problemId":"two-sum"}`,
		"invalid json":       `{`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			if status, _ := createRoom(t, ts, body); status != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", status)
			}
		})
	}

	resp, err := http.Get(ts.URL + "/api/rooms/nonexistent-room-id")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown room, got %d", resp.StatusCode)
	}
}

func TestProblemsEndpoint(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	resp, err := http.Get(ts.URL + "/api/problems?official=true")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out struct {
		Problems []struct {
			ID         string `json:"id"`
			Title      string `json:"title"`
			Difficulty string `json:"difficulty"`
			Official   bool   `json:"official"`
			TestCount  int    `json:"testCount"`
			Author     struct {
				Handle string `json:"handle"`
			} `json:"author"`
		} `json:"problems"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	// Counted from the catalog rather than hard-coded, so adding a problem to
	// the seed does not fail this test for the wrong reason.
	if want := len(seed.Problems()); len(out.Problems) != want {
		t.Fatalf("expected the %d seeded problems, got %d", want, len(out.Problems))
	}
	for _, p := range out.Problems {
		if !p.Official {
			t.Errorf("%s should be flagged official", p.ID)
		}
		if p.Author.Handle != seed.SystemHandle {
			t.Errorf("%s is authored by %q, want the system account", p.ID, p.Author.Handle)
		}
		if p.TestCount == 0 {
			t.Errorf("%s ships with no test cases", p.ID)
		}
	}
}

func TestGetProblemReturnsEverythingNeededToSolveIt(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	resp, err := http.Get(ts.URL + "/api/problems/palindrome-number")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out struct {
		Problem struct {
			ID          string `json:"id"`
			Title       string `json:"title"`
			Statement   string `json:"statement"`
			StarterCode string `json:"starterCode"`
			EntryPoint  string `json:"entryPoint"`
			Examples    []struct {
				Input string `json:"input"`
			} `json:"examples"`
			Tests []struct {
				Name   string          `json:"name"`
				Args   json.RawMessage `json:"args"`
				Hidden bool            `json:"hidden"`
			} `json:"tests"`
		} `json:"problem"`
		CanEdit bool `json:"canEdit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	p := out.Problem
	if p.ID != "palindrome-number" || p.Title == "" || p.Statement == "" || p.StarterCode == "" {
		t.Fatalf("incomplete problem: %+v", p)
	}
	if p.EntryPoint != "is_palindrome" {
		t.Errorf("entry point %q", p.EntryPoint)
	}
	if len(p.Examples) == 0 {
		t.Error("no examples")
	}
	if len(p.Tests) < 3 {
		t.Errorf("expected several test cases, got %d", len(p.Tests))
	}
	var hidden int
	for _, test := range p.Tests {
		if test.Hidden {
			hidden++
		}
		if len(test.Args) == 0 {
			t.Errorf("test %q has no arguments", test.Name)
		}
	}
	if hidden == 0 {
		t.Error("expected at least one hidden case")
	}
	if out.CanEdit {
		t.Error("an anonymous caller must not be able to edit a seeded problem")
	}
}

func TestRoomSnapshotsTheProblem(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	status, created := createRoom(t, ts, `{"mode":"practice","problemId":"two-sum"}`)
	if status != http.StatusCreated {
		t.Fatalf("status %d", status)
	}
	if created.Problem == nil || created.Problem.Title != "Two Sum" {
		t.Fatalf("room did not come back with its problem: %+v", created.Problem)
	}
	if created.Problem.StarterCode == "" || len(created.Problem.Tests) == 0 {
		t.Fatal("the snapshot should carry the starter code and the tests")
	}

	// Reading the room again returns the snapshot, not a fresh lookup.
	resp, err := http.Get(ts.URL + "/api/rooms/" + created.Room.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out server.RoomResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out.Problem == nil || out.Problem.ID != "two-sum" {
		t.Fatalf("room lost its problem: %+v", out.Problem)
	}
}

func TestHealthEndpoints(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	for _, path := range []string{"/healthz", "/readyz"} {
		resp, err := http.Get(ts.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s returned %d", path, resp.StatusCode)
		}
	}
}

// ---------------------------------------------------------------------------
// WebSocket persistence
// ---------------------------------------------------------------------------

// wsClient is a minimal y-websocket-compatible peer for tests.
type wsClient struct {
	t    *testing.T
	conn *websocket.Conn
}

func dial(t *testing.T, ts *httptest.Server, roomID string) *wsClient {
	t.Helper()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/rooms/" + roomID
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", url, err)
	}
	conn.SetReadLimit(16 << 20)
	c := &wsClient{t: t, conn: conn}
	t.Cleanup(func() { conn.CloseNow() })
	return c
}

func (c *wsClient) send(msg []byte) {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.conn.Write(ctx, websocket.MessageBinary, msg); err != nil {
		c.t.Fatalf("write: %v", err)
	}
}

func (c *wsClient) recv() []byte {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, data, err := c.conn.Read(ctx)
	if err != nil {
		c.t.Fatalf("read: %v", err)
	}
	return data
}

func (c *wsClient) close() {
	c.conn.Close(websocket.StatusNormalClosure, "bye")
}

// decoded is a parsed server message.
type decoded struct {
	msgType uint64
	subType uint64 // for sync messages
	payload []byte
	seq     uint64 // for snapshot requests
}

func parse(t *testing.T, msg []byte) decoded {
	t.Helper()
	d := yproto.NewDecoder(msg)
	mt, err := d.ReadVarUint()
	if err != nil {
		t.Fatalf("parse type: %v", err)
	}
	out := decoded{msgType: mt}
	switch mt {
	case yproto.MsgSync:
		out.subType, _ = d.ReadVarUint()
		out.payload, _ = d.ReadVarUint8Array()
	case yproto.MsgAwareness:
		out.payload, _ = d.ReadVarUint8Array()
	case yproto.MsgSnapshotRequest:
		out.seq, _ = d.ReadVarUint()
	}
	return out
}

// expectSync reads one message and asserts it is a sync message of the given
// sub-type with the given payload.
func (c *wsClient) expectSync(sub uint64, payload []byte) {
	c.t.Helper()
	m := parse(c.t, c.recv())
	if m.msgType != yproto.MsgSync || m.subType != sub || !bytes.Equal(m.payload, payload) {
		c.t.Fatalf("expected sync(%d) %x, got type=%d sub=%d payload=%x", sub, payload, m.msgType, m.subType, m.payload)
	}
}

// handshake performs what y-websocket does on open: reads the server's
// SyncStep1, sends our SyncStep1, and returns the replayed updates (up to the
// terminating empty SyncStep2).
func (c *wsClient) handshake() [][]byte {
	c.t.Helper()
	// Server always asks for our state first.
	c.expectSync(yproto.SyncStep1, yproto.EmptyStateVector)
	c.send(yproto.SyncStep1Message(yproto.EmptyStateVector))
	var replay [][]byte
	for {
		m := parse(c.t, c.recv())
		if m.msgType == yproto.MsgAwareness {
			continue
		}
		if m.msgType != yproto.MsgSync {
			c.t.Fatalf("unexpected message type %d during replay", m.msgType)
		}
		switch m.subType {
		case yproto.SyncUpdate:
			replay = append(replay, append([]byte(nil), m.payload...))
		case yproto.SyncStep2:
			if !bytes.Equal(m.payload, yproto.EmptyUpdate) {
				c.t.Fatalf("expected empty SyncStep2 terminator, got %x", m.payload)
			}
			return replay
		default:
			c.t.Fatalf("unexpected sync sub-type %d during replay", m.subType)
		}
	}
}

func update(n byte) []byte {
	return yproto.SeedTextUpdate(uint32(1000+int(n)), "content", fmt.Sprintf("u%d", n))
}

func TestWebSocketRelaysAndPersistsUpdates(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, created := createRoom(t, ts, `{"mode":"blank"}`)
	roomID := created.Room.ID

	// Client A joins an empty room.
	a := dial(t, ts, roomID)
	if replay := a.handshake(); len(replay) != 0 {
		t.Fatalf("expected empty replay for a new blank room, got %d updates", len(replay))
	}
	a.send(yproto.SyncUpdateMessage(update(1)))
	a.send(yproto.SyncUpdateMessage(update(2)))
	// Empty updates are ignored, not persisted.
	a.send(yproto.SyncUpdateMessage(yproto.EmptyUpdate))

	// Client B joins and must receive the history, in order.
	b := dial(t, ts, roomID)
	replay := b.handshake()
	if len(replay) != 2 || !bytes.Equal(replay[0], update(1)) || !bytes.Equal(replay[1], update(2)) {
		t.Fatalf("B replay mismatch: %d updates", len(replay))
	}

	// Live relay A -> B, and B -> A. Senders do not get their own updates
	// echoed: A's very next message after sending update(3) is update(4).
	a.send(yproto.SyncUpdateMessage(update(3)))
	b.expectSync(yproto.SyncUpdate, update(3))
	b.send(yproto.SyncStep2Message(update(4))) // a SyncStep2 (reply to server step1) is also an update
	a.expectSync(yproto.SyncUpdate, update(4))

	// Awareness is broadcast to everyone, including the sender (keepalive).
	aw := yproto.AwarenessMessage(yproto.EncodeAwarenessUpdate([]yproto.AwarenessEntry{{ClientID: 7, Clock: 1, State: `{"user":{"name":"Lin"}}`}}))
	a.send(aw)
	if got := a.recv(); !bytes.Equal(got, aw) {
		t.Fatalf("A did not get own awareness echoed: %x", got)
	}
	if got := b.recv(); !bytes.Equal(got, aw) {
		t.Fatalf("B did not get awareness: %x", got)
	}

	// A disconnects; B is told A's awareness state is gone.
	a.close()
	m := parse(t, b.recv())
	if m.msgType != yproto.MsgAwareness {
		t.Fatalf("expected awareness removal, got type %d", m.msgType)
	}
	entries, err := yproto.ParseAwarenessUpdate(m.payload)
	if err != nil || len(entries) != 1 || entries[0].ClientID != 7 || !entries[0].IsRemoval() || entries[0].Clock != 2 {
		t.Fatalf("bad removal entry %+v (%v)", entries, err)
	}

	// A reconnects (as a browser refresh would) and gets the full document,
	// including updates it did not author.
	a2 := dial(t, ts, roomID)
	replay = a2.handshake()
	want := [][]byte{update(1), update(2), update(3), update(4)}
	if len(replay) != len(want) {
		t.Fatalf("A2 replay: expected %d updates, got %d", len(want), len(replay))
	}
	for i := range want {
		if !bytes.Equal(replay[i], want[i]) {
			t.Fatalf("A2 replay[%d] mismatch", i)
		}
	}
	// New joiner immediately learns of B's awareness state.
	b.send(yproto.AwarenessMessage(yproto.EncodeAwarenessUpdate([]yproto.AwarenessEntry{{ClientID: 9, Clock: 1, State: `{"user":{"name":"Ada"}}`}})))
	_ = b.recv() // own echo
	_ = a2.recv()
	a3 := dial(t, ts, roomID)
	first := parse(t, a3.recv())
	if first.msgType != yproto.MsgAwareness {
		t.Fatalf("expected awareness first for late joiner, got type %d", first.msgType)
	}
}

func TestDocumentSurvivesBackendRestart(t *testing.T) {
	// First server instance: create room and write updates.
	ts1, srv1 := newTestServer(t, 200)
	_, created := createRoom(t, ts1, `{"mode":"practice","problemId":"reverse-integer"}`)
	roomID := created.Room.ID

	a := dial(t, ts1, roomID)
	replay := a.handshake()
	seed := yproto.SeedTextUpdate(server.SeedClientID, "content", created.Problem.StarterCode)
	if len(replay) != 1 || !bytes.Equal(replay[0], seed) {
		t.Fatalf("practice room should replay exactly the seeded starter code, got %d updates", len(replay))
	}
	a.send(yproto.SyncUpdateMessage(update(1)))
	a.send(yproto.SyncUpdateMessage(update(2)))
	// Make sure the server has processed them before we tear down.
	b := dial(t, ts1, roomID)
	if r := b.handshake(); len(r) != 3 {
		t.Fatalf("expected seed+2 updates, got %d", len(r))
	}
	a.close()
	b.close()
	srv1.Hub().Shutdown(context.Background())
	ts1.Close()
	// Rooms are evicted from memory once empty; wait for the read loops.
	deadline := time.Now().Add(3 * time.Second)
	for srv1.Hub().Stats().Rooms != 0 {
		if time.Now().After(deadline) {
			t.Fatalf("old hub still holds rooms: %+v", srv1.Hub().Stats())
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Second server instance with no in-memory state.
	ts2, _ := newTestServer(t, 200)
	resp, err := http.Get(ts2.URL + "/api/rooms/" + roomID)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("room metadata lost across restart: %d", resp.StatusCode)
	}
	c := dial(t, ts2, roomID)
	replay = c.handshake()
	want := [][]byte{seed, update(1), update(2)}
	if len(replay) != len(want) {
		t.Fatalf("after restart expected %d updates, got %d", len(want), len(replay))
	}
	for i := range want {
		if !bytes.Equal(replay[i], want[i]) {
			t.Fatalf("after restart replay[%d] mismatch", i)
		}
	}
}

func TestUnknownRoomClosesWithPermanentCode(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/rooms/not-a-room"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	_, _, err = conn.Read(ctx)
	if websocket.CloseStatus(err) != 4404 {
		t.Fatalf("expected close 4404, got %v", err)
	}
}

func TestSnapshotCompaction(t *testing.T) {
	const every = 3
	ts, _ := newTestServer(t, every)
	_, created := createRoom(t, ts, `{"mode":"blank"}`)
	roomID := created.Room.ID
	st := store.New(testutil.Pool(t))

	a := dial(t, ts, roomID)
	a.handshake()
	for i := byte(1); i <= every; i++ {
		a.send(yproto.SyncUpdateMessage(update(i)))
	}
	// After `every` updates the author is asked for a snapshot covering
	// everything it holds (its own updates included).
	req := parse(t, a.recv())
	if req.msgType != yproto.MsgSnapshotRequest {
		t.Fatalf("expected snapshot request, got type %d", req.msgType)
	}
	if n, _ := st.CountUpdates(context.Background(), roomID); n != every {
		t.Fatalf("expected %d rows before compaction, got %d", every, n)
	}

	// Reply like the browser does: full state tagged with the requested seq.
	fullState := yproto.SeedTextUpdate(555, "content", "merged")
	e := yproto.NewEncoder()
	e.WriteVarUint(yproto.MsgSnapshotResponse)
	e.WriteVarUint(req.seq)
	e.WriteVarUint8Array(fullState)
	a.send(e.Bytes())

	// Wait for the compaction to land in the database.
	deadline := time.Now().Add(5 * time.Second)
	for {
		n, err := st.CountUpdates(context.Background(), roomID)
		if err != nil {
			t.Fatal(err)
		}
		if n == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("updates were not compacted; %d rows remain", n)
		}
		time.Sleep(20 * time.Millisecond)
	}
	ds, err := st.LoadDocState(context.Background(), roomID)
	if err != nil {
		t.Fatal(err)
	}
	if ds.Snapshot == nil || !bytes.Equal(ds.Snapshot.State, fullState) || uint64(ds.Snapshot.Seq) != req.seq {
		t.Fatalf("snapshot not stored correctly: %+v", ds.Snapshot)
	}

	// A new client receives the snapshot followed by any later updates.
	a.send(yproto.SyncUpdateMessage(update(9)))
	b := dial(t, ts, roomID)
	replay := b.handshake()
	if len(replay) != 2 || !bytes.Equal(replay[0], fullState) || !bytes.Equal(replay[1], update(9)) {
		t.Fatalf("replay after compaction wrong: %d updates", len(replay))
	}
}

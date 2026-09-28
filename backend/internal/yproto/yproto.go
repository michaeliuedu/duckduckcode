// Package yproto implements the small subset of the lib0 / y-protocols wire
// format that the relay server needs in order to interoperate with the
// y-websocket client.
//
// The server does not run a Yjs document itself. It treats Yjs updates as
// opaque byte blobs: it persists them, replays them to newly connected
// clients and relays them between clients. The only Yjs-specific encoding it
// produces on its own is the "seed" update (see SeedTextUpdate), which is a
// hand-crafted Yjs v1 update inserting starter code into an empty Y.Text.
package yproto

import (
	"errors"
	"fmt"
)

// Top-level y-websocket message types. Values 0-3 are defined by y-websocket
// v3; 100+ are private extensions used by this server for snapshot compaction.
const (
	MsgSync             uint64 = 0
	MsgAwareness        uint64 = 1
	MsgAuth             uint64 = 2
	MsgQueryAwareness   uint64 = 3
	MsgSnapshotRequest  uint64 = 100 // server -> client: varuint seq
	MsgSnapshotResponse uint64 = 101 // client -> server: varuint seq, varuint8array fullState
)

// Sub-types of MsgSync (y-protocols/sync).
const (
	SyncStep1  uint64 = 0 // payload: state vector
	SyncStep2  uint64 = 1 // payload: update
	SyncUpdate uint64 = 2 // payload: update
)

// EmptyStateVector is the lib0 encoding of a state vector with zero clients.
var EmptyStateVector = []byte{0}

// EmptyUpdate is a valid Yjs v1 update with no structs and an empty delete set.
var EmptyUpdate = []byte{0, 0}

var ErrUnexpectedEOF = errors.New("yproto: unexpected end of message")

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

// Decoder reads lib0-encoded values from a byte slice.
type Decoder struct {
	buf []byte
	pos int
}

func NewDecoder(b []byte) *Decoder { return &Decoder{buf: b} }

// Remaining returns the number of unread bytes.
func (d *Decoder) Remaining() int { return len(d.buf) - d.pos }

// ReadUint8 reads a single byte.
func (d *Decoder) ReadUint8() (uint8, error) {
	if d.pos >= len(d.buf) {
		return 0, ErrUnexpectedEOF
	}
	b := d.buf[d.pos]
	d.pos++
	return b, nil
}

// ReadVarUint reads an unsigned LEB128-style variable length integer.
func (d *Decoder) ReadVarUint() (uint64, error) {
	var num uint64
	var shift uint
	for {
		if d.pos >= len(d.buf) {
			return 0, ErrUnexpectedEOF
		}
		if shift > 63 {
			return 0, errors.New("yproto: varuint overflow")
		}
		r := d.buf[d.pos]
		d.pos++
		num |= uint64(r&0x7f) << shift
		if r < 0x80 {
			return num, nil
		}
		shift += 7
	}
}

// ReadVarUint8Array reads a length-prefixed byte array.
func (d *Decoder) ReadVarUint8Array() ([]byte, error) {
	n, err := d.ReadVarUint()
	if err != nil {
		return nil, err
	}
	if n > uint64(d.Remaining()) {
		return nil, ErrUnexpectedEOF
	}
	out := d.buf[d.pos : d.pos+int(n)]
	d.pos += int(n)
	return out, nil
}

// ReadVarString reads a length-prefixed UTF-8 string.
func (d *Decoder) ReadVarString() (string, error) {
	b, err := d.ReadVarUint8Array()
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

// Encoder appends lib0-encoded values to a growing byte slice.
type Encoder struct{ buf []byte }

func NewEncoder() *Encoder { return &Encoder{} }

func (e *Encoder) Bytes() []byte { return e.buf }

func (e *Encoder) WriteUint8(b uint8) { e.buf = append(e.buf, b) }

func (e *Encoder) WriteVarUint(n uint64) {
	for n > 0x7f {
		e.buf = append(e.buf, byte(n&0x7f)|0x80)
		n >>= 7
	}
	e.buf = append(e.buf, byte(n))
}

func (e *Encoder) WriteVarUint8Array(b []byte) {
	e.WriteVarUint(uint64(len(b)))
	e.buf = append(e.buf, b...)
}

func (e *Encoder) WriteVarString(s string) { e.WriteVarUint8Array([]byte(s)) }

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

func syncMessage(sub uint64, payload []byte) []byte {
	e := NewEncoder()
	e.WriteVarUint(MsgSync)
	e.WriteVarUint(sub)
	e.WriteVarUint8Array(payload)
	return e.Bytes()
}

// SyncStep1Message asks the peer for everything it has that is missing from
// the given state vector.
func SyncStep1Message(stateVector []byte) []byte { return syncMessage(SyncStep1, stateVector) }

// SyncStep2Message carries a Yjs update in reply to a SyncStep1.
func SyncStep2Message(update []byte) []byte { return syncMessage(SyncStep2, update) }

// SyncUpdateMessage carries an incremental Yjs update.
func SyncUpdateMessage(update []byte) []byte { return syncMessage(SyncUpdate, update) }

// AwarenessMessage wraps an awareness update.
func AwarenessMessage(update []byte) []byte {
	e := NewEncoder()
	e.WriteVarUint(MsgAwareness)
	e.WriteVarUint8Array(update)
	return e.Bytes()
}

// SnapshotRequestMessage asks a client to reply with its full document state,
// tagged with the sequence number the server knows the client has received.
func SnapshotRequestMessage(seq int64) []byte {
	e := NewEncoder()
	e.WriteVarUint(MsgSnapshotRequest)
	e.WriteVarUint(uint64(seq))
	return e.Bytes()
}

// ---------------------------------------------------------------------------
// Awareness update parsing (y-protocols/awareness)
// ---------------------------------------------------------------------------

// AwarenessEntry is one client's entry in an awareness update. State is the
// raw JSON string; "null" means the client left.
type AwarenessEntry struct {
	ClientID uint64
	Clock    uint64
	State    string
}

// IsRemoval reports whether this entry removes the client from awareness.
func (a AwarenessEntry) IsRemoval() bool { return a.State == "null" }

// ParseAwarenessUpdate decodes an awareness update payload.
func ParseAwarenessUpdate(b []byte) ([]AwarenessEntry, error) {
	d := NewDecoder(b)
	n, err := d.ReadVarUint()
	if err != nil {
		return nil, err
	}
	if n > 10_000 {
		return nil, fmt.Errorf("yproto: awareness update too large (%d clients)", n)
	}
	out := make([]AwarenessEntry, 0, n)
	for i := uint64(0); i < n; i++ {
		cid, err := d.ReadVarUint()
		if err != nil {
			return nil, err
		}
		clock, err := d.ReadVarUint()
		if err != nil {
			return nil, err
		}
		state, err := d.ReadVarString()
		if err != nil {
			return nil, err
		}
		out = append(out, AwarenessEntry{ClientID: cid, Clock: clock, State: state})
	}
	return out, nil
}

// EncodeAwarenessUpdate encodes awareness entries into an update payload.
func EncodeAwarenessUpdate(entries []AwarenessEntry) []byte {
	e := NewEncoder()
	e.WriteVarUint(uint64(len(entries)))
	for _, a := range entries {
		e.WriteVarUint(a.ClientID)
		e.WriteVarUint(a.Clock)
		e.WriteVarString(a.State)
	}
	return e.Bytes()
}

// ---------------------------------------------------------------------------
// Seed update
// ---------------------------------------------------------------------------

// SeedTextUpdate builds a Yjs v1 update that inserts text at position 0 of
// the root Y.Text named key, authored by clientID with clock 0. Applying it
// to an empty Y.Doc is equivalent to doc.getText(key).insert(0, text).
//
// The encoding is verified byte-for-byte against the real Yjs library in
// yproto_test.go. If text is empty, an empty update is returned.
func SeedTextUpdate(clientID uint32, key, text string) []byte {
	if text == "" {
		return append([]byte(nil), EmptyUpdate...)
	}
	e := NewEncoder()
	e.WriteVarUint(1)                // number of clients in the update
	e.WriteVarUint(1)                // number of structs for this client
	e.WriteVarUint(uint64(clientID)) // client id
	e.WriteVarUint(0)                // clock of first struct
	// Item info byte: content ref 4 (ContentString); no origin, no rightOrigin,
	// no parentSub.
	e.WriteUint8(4)
	e.WriteVarUint(1) // parent info: 1 = parent is a root type identified by key
	e.WriteVarString(key)
	e.WriteVarString(text) // ContentString payload
	e.WriteVarUint(0)      // delete set: zero clients
	return e.Bytes()
}

// IsEmptyUpdate reports whether b is an update carrying no structs and no
// deletions. Such updates are safe to drop rather than persist.
func IsEmptyUpdate(b []byte) bool {
	return len(b) == 2 && b[0] == 0 && b[1] == 0
}

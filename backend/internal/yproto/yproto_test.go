package yproto

import (
	"bytes"
	"encoding/hex"
	"testing"
)

func TestVarUintRoundTrip(t *testing.T) {
	cases := []uint64{0, 1, 127, 128, 255, 300, 16383, 16384, 1 << 32, 1<<53 - 1}
	for _, want := range cases {
		e := NewEncoder()
		e.WriteVarUint(want)
		d := NewDecoder(e.Bytes())
		got, err := d.ReadVarUint()
		if err != nil {
			t.Fatalf("%d: %v", want, err)
		}
		if got != want {
			t.Fatalf("round trip %d -> %d", want, got)
		}
		if d.Remaining() != 0 {
			t.Fatalf("%d: %d trailing bytes", want, d.Remaining())
		}
	}
}

func TestVarUintKnownEncodings(t *testing.T) {
	// Values from lib0: 1234567 -> 87 ad 4b ; 4294967295 -> ff ff ff ff 0f
	e := NewEncoder()
	e.WriteVarUint(1234567)
	if got := hex.EncodeToString(e.Bytes()); got != "87ad4b" {
		t.Fatalf("got %s", got)
	}
	e = NewEncoder()
	e.WriteVarUint(4294967295)
	if got := hex.EncodeToString(e.Bytes()); got != "ffffffff0f" {
		t.Fatalf("got %s", got)
	}
}

func TestDecoderErrors(t *testing.T) {
	if _, err := NewDecoder(nil).ReadVarUint(); err == nil {
		t.Fatal("expected error on empty input")
	}
	if _, err := NewDecoder([]byte{0x80}).ReadVarUint(); err == nil {
		t.Fatal("expected error on truncated varuint")
	}
	if _, err := NewDecoder([]byte{5, 1, 2}).ReadVarUint8Array(); err == nil {
		t.Fatal("expected error on truncated array")
	}
}

// Golden values were produced by the real Yjs library (v13.6):
//
//	const doc = new Y.Doc(); doc.clientID = id
//	doc.getText(key).insert(0, text)
//	Y.encodeStateAsUpdate(doc)
func TestSeedTextUpdateMatchesYjs(t *testing.T) {
	cases := []struct {
		name     string
		clientID uint32
		text     string
		wantHex  string
	}{
		{"ascii", 1234567, "hello\nworld", "010187ad4b00040107636f6e74656e740b68656c6c6f0a776f726c6400"},
		{"empty", 7, "", "0000"},
		{"unicode", 4294967295, "def solve(xs):\n    return xs  # ünïcödé ✓",
			"0101ffffffff0f00040107636f6e74656e742f64656620736f6c7665287873293a0a2020202072657475726e20787320202320c3bc6ec3af63c3b664c3a920e29c9300"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := SeedTextUpdate(tc.clientID, "content", tc.text)
			want, _ := hex.DecodeString(tc.wantHex)
			if !bytes.Equal(got, want) {
				t.Fatalf("\n got %x\nwant %x", got, want)
			}
		})
	}
}

func TestSyncMessages(t *testing.T) {
	msg := SyncUpdateMessage([]byte{1, 2, 3})
	d := NewDecoder(msg)
	mt, _ := d.ReadVarUint()
	st, _ := d.ReadVarUint()
	payload, _ := d.ReadVarUint8Array()
	if mt != MsgSync || st != SyncUpdate || !bytes.Equal(payload, []byte{1, 2, 3}) {
		t.Fatalf("bad sync update message %x", msg)
	}

	step1 := SyncStep1Message(EmptyStateVector)
	if !bytes.Equal(step1, []byte{0, 0, 1, 0}) {
		t.Fatalf("bad step1 %x", step1)
	}

	req := SnapshotRequestMessage(300)
	d = NewDecoder(req)
	mt, _ = d.ReadVarUint()
	seq, _ := d.ReadVarUint()
	if mt != MsgSnapshotRequest || seq != 300 {
		t.Fatalf("bad snapshot request %x", req)
	}
}

func TestAwarenessRoundTrip(t *testing.T) {
	in := []AwarenessEntry{
		{ClientID: 42, Clock: 3, State: `{"user":{"name":"Lin"}}`},
		{ClientID: 99, Clock: 8, State: "null"},
	}
	enc := EncodeAwarenessUpdate(in)
	out, err := ParseAwarenessUpdate(enc)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0] != in[0] || out[1] != in[1] {
		t.Fatalf("round trip mismatch: %+v", out)
	}
	if !out[1].IsRemoval() || out[0].IsRemoval() {
		t.Fatal("IsRemoval wrong")
	}
}

func TestIsEmptyUpdate(t *testing.T) {
	if !IsEmptyUpdate(EmptyUpdate) {
		t.Fatal("EmptyUpdate should be empty")
	}
	if IsEmptyUpdate(SeedTextUpdate(1, "content", "x")) {
		t.Fatal("seed update should not be empty")
	}
}

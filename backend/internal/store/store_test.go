package store_test

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/duckduckcode/backend/internal/store"
	"github.com/duckduckcode/backend/internal/testutil"
)

func TestNewRoomIDIsLongAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		id, err := store.NewRoomID()
		if err != nil {
			t.Fatal(err)
		}
		if len(id) != 22 {
			t.Fatalf("expected 22-char id, got %q (%d)", id, len(id))
		}
		if seen[id] {
			t.Fatalf("duplicate id %q", id)
		}
		seen[id] = true
	}
}

func TestCreateAndGetRoom(t *testing.T) {
	ctx := context.Background()
	st := store.New(testutil.Pool(t))

	blank, err := st.CreateRoom(ctx, store.ModeBlank, nil, "python", nil)
	if err != nil {
		t.Fatal(err)
	}
	if blank.Mode != store.ModeBlank || blank.ProblemID != nil || blank.Language != "python" {
		t.Fatalf("unexpected room %+v", blank)
	}

	got, err := st.GetRoom(ctx, blank.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != blank.ID || got.Mode != blank.Mode {
		t.Fatalf("GetRoom mismatch: %+v vs %+v", got, blank)
	}

	pid := "office-hours-queue"
	seed := []byte{1, 2, 3, 4}
	practice, err := st.CreateRoom(ctx, store.ModePractice, &pid, "python", seed)
	if err != nil {
		t.Fatal(err)
	}
	if practice.ProblemID == nil || *practice.ProblemID != pid {
		t.Fatalf("problem id not stored: %+v", practice)
	}
	if practice.ID == blank.ID {
		t.Fatal("room ids must differ")
	}

	// The seed is exposed as a snapshot at seq 0.
	ds, err := st.LoadDocState(ctx, practice.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ds.Snapshot == nil || ds.Snapshot.Seq != 0 || !bytes.Equal(ds.Snapshot.State, seed) {
		t.Fatalf("expected seed snapshot, got %+v", ds.Snapshot)
	}
	if len(ds.Updates) != 0 {
		t.Fatalf("expected no updates, got %d", len(ds.Updates))
	}

	// Unknown rooms are reported distinctly.
	if _, err := st.GetRoom(ctx, "does-not-exist"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestPracticeRoomRequiresProblem(t *testing.T) {
	st := store.New(testutil.Pool(t))
	if _, err := st.CreateRoom(context.Background(), store.ModePractice, nil, "python", nil); err == nil {
		t.Fatal("expected constraint violation for practice room without problem")
	}
}

func TestUpdateLogAndSnapshotCompaction(t *testing.T) {
	ctx := context.Background()
	st := store.New(testutil.Pool(t))
	room, err := st.CreateRoom(ctx, store.ModeBlank, nil, "python", nil)
	if err != nil {
		t.Fatal(err)
	}

	var seqs []int64
	for i := 0; i < 5; i++ {
		seq, err := st.AppendUpdate(ctx, room.ID, []byte{byte(i)})
		if err != nil {
			t.Fatal(err)
		}
		if len(seqs) > 0 && seq <= seqs[len(seqs)-1] {
			t.Fatalf("sequence not increasing: %v then %d", seqs, seq)
		}
		seqs = append(seqs, seq)
	}

	ds, err := st.LoadDocState(ctx, room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ds.Snapshot != nil {
		t.Fatal("blank room should not have a snapshot yet")
	}
	if len(ds.Updates) != 5 {
		t.Fatalf("expected 5 updates, got %d", len(ds.Updates))
	}
	for i, u := range ds.Updates {
		if u.Seq != seqs[i] || !bytes.Equal(u.Data, []byte{byte(i)}) {
			t.Fatalf("update %d mismatch: %+v", i, u)
		}
	}

	// Compact through the third update.
	deleted, err := st.SaveSnapshot(ctx, room.ID, seqs[2], []byte("snap"))
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 3 {
		t.Fatalf("expected 3 deleted rows, got %d", deleted)
	}
	ds, err = st.LoadDocState(ctx, room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ds.Snapshot == nil || ds.Snapshot.Seq != seqs[2] || string(ds.Snapshot.State) != "snap" {
		t.Fatalf("bad snapshot %+v", ds.Snapshot)
	}
	if len(ds.Updates) != 2 || ds.Updates[0].Seq != seqs[3] || ds.Updates[1].Seq != seqs[4] {
		t.Fatalf("expected the two newest updates, got %+v", ds.Updates)
	}

	// A stale snapshot must not overwrite a newer one.
	deleted, err = st.SaveSnapshot(ctx, room.ID, seqs[1], []byte("old"))
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 0 {
		t.Fatalf("stale snapshot should be a no-op, deleted %d", deleted)
	}
	ds, _ = st.LoadDocState(ctx, room.ID)
	if string(ds.Snapshot.State) != "snap" {
		t.Fatal("stale snapshot overwrote newer one")
	}

	n, err := st.CountUpdates(ctx, room.ID)
	if err != nil || n != 2 {
		t.Fatalf("CountUpdates = %d, %v", n, err)
	}
}

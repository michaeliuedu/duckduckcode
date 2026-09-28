-- Rooms: one collaborative document per room.
CREATE TABLE rooms (
    id          TEXT PRIMARY KEY,
    mode        TEXT NOT NULL CHECK (mode IN ('practice', 'blank')),
    problem_id  TEXT NULL,
    language    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rooms_practice_has_problem CHECK (
        (mode = 'practice' AND problem_id IS NOT NULL) OR
        (mode = 'blank'    AND problem_id IS NULL)
    )
);

-- Append-only log of Yjs updates received for a room. seq is a global
-- monotonically increasing sequence, so ordering within a room is preserved.
CREATE TABLE room_updates (
    seq         BIGSERIAL PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    data        BYTEA NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX room_updates_room_seq_idx ON room_updates (room_id, seq);

-- Compacted document state. A snapshot incorporates every update for the room
-- with seq <= snapshot.seq; those rows are deleted when the snapshot is
-- written. Replay = snapshot.state followed by updates with seq > snapshot.seq.
CREATE TABLE room_snapshots (
    room_id     TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
    seq         BIGINT NOT NULL,
    state       BYTEA NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

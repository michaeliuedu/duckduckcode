-- Problems become data.
--
-- Until now the catalog was three entries compiled into the binary. Anyone with
-- an account can now write one, so problems get an author, a visibility and a
-- history, and rooms stop pointing at a constant.

CREATE TABLE problems (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The public identifier: appears in URLs and in rooms.problem_id. Fixed at
    -- creation, because changing it would break every link and every room that
    -- already references it.
    slug         TEXT NOT NULL UNIQUE,
    author_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    title        TEXT NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    -- Markdown, written by other people. Rendered through a sanitiser.
    statement    TEXT NOT NULL DEFAULT '',
    difficulty   TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    language     TEXT NOT NULL DEFAULT 'python',
    starter_code TEXT NOT NULL DEFAULT '',
    -- The function the test cases call. Empty means the problem has no tests.
    entry_point  TEXT NOT NULL DEFAULT '',

    visibility   TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft', 'unlisted', 'public')),
    -- Seeded problems that ship with the app, shown as "default" on the home
    -- page. A flag rather than a separate table: they are ordinary problems.
    official     BOOLEAN NOT NULL DEFAULT false,
    -- How many rooms have been started from this problem, which is the only
    -- honest popularity signal available: it counts use, not clicks.
    room_count   BIGINT NOT NULL DEFAULT 0,

    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT problems_slug_shape  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
    CONSTRAINT problems_title_len   CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    CONSTRAINT problems_summary_len CHECK (char_length(summary) <= 300),
    CONSTRAINT problems_statement_len CHECK (char_length(statement) <= 20000),
    CONSTRAINT problems_starter_len CHECK (char_length(starter_code) <= 20000),
    -- A published problem must have been published at some point.
    CONSTRAINT problems_published_at CHECK (visibility = 'draft' OR published_at IS NOT NULL)
);

-- Full-text search over the parts worth matching. A generated column cannot
-- reach into another table, so tags (if they arrive) will filter rather than
-- feed the vector.
ALTER TABLE problems ADD COLUMN search tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(statement, '')), 'C')
    ) STORED;

CREATE INDEX problems_search_idx  ON problems USING GIN (search);
CREATE INDEX problems_author_idx  ON problems (author_id, updated_at DESC);
CREATE INDEX problems_browse_idx  ON problems (room_count DESC, published_at DESC)
    WHERE visibility = 'public';

-- Worked examples shown beside the statement. Ordered, so a position column
-- rather than an array: it makes reordering a single UPDATE.
CREATE TABLE problem_examples (
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    position    INT  NOT NULL,
    input       TEXT NOT NULL DEFAULT '',
    output      TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (problem_id, position)
);

-- Test cases: call problems.entry_point with args, compare the return value to
-- expected. Both are JSON so any shape a student's function returns can be
-- described without inventing a syntax.
CREATE TABLE problem_tests (
    problem_id UUID    NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    position   INT     NOT NULL,
    name       TEXT    NOT NULL DEFAULT '',
    args       JSONB   NOT NULL DEFAULT '[]'::jsonb,
    expected   JSONB,
    -- Hidden cases are not shown in the UI before running. They are not secret:
    -- the browser runs the tests, so it has to receive them. Real secrecy needs
    -- a server-side sandbox.
    hidden     BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (problem_id, position),
    CONSTRAINT problem_tests_args_is_array CHECK (jsonb_typeof(args) = 'array')
);

-- Collections of problems. Slug is unique per owner, so two people can both
-- have a list called "week-3".
CREATE TABLE lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, slug),
    CONSTRAINT lists_slug_shape CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
    CONSTRAINT lists_title_len  CHECK (char_length(btrim(title)) BETWEEN 1 AND 120)
);

CREATE TABLE list_items (
    list_id    UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    position   INT  NOT NULL,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (list_id, problem_id)
);

CREATE INDEX list_items_order_idx ON list_items (list_id, position);

-- Rooms keep a copy of the problem they were started from.
--
-- Without this, an author editing or deleting their problem would change what a
-- pair is looking at mid-session, or break the room entirely. problem_id stays
-- as a soft reference (the slug) so "open the original" still works.
ALTER TABLE rooms ADD COLUMN problem_snapshot JSONB;

-- The old constraint required problem_id for practice rooms. Rooms created from
-- here on carry a snapshot; rooms created before this migration have only the
-- id. Accept either.
ALTER TABLE rooms DROP CONSTRAINT rooms_practice_has_problem;
ALTER TABLE rooms ADD CONSTRAINT rooms_practice_has_problem CHECK (
    (mode = 'practice' AND (problem_id IS NOT NULL OR problem_snapshot IS NOT NULL)) OR
    (mode = 'blank'    AND problem_id IS NULL AND problem_snapshot IS NULL)
);

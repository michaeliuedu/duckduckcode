-- Progress.
--
-- Two tables rather than one, because they answer different questions and a
-- single one would answer both badly:
--
--   attempts  — "have I solved this problem?", one row per person per problem.
--   activity  — "what have I done lately?", one row per person per day, which
--               is exactly the shape the contribution grid renders.
--
-- Neither is an audit log: an append-only row per run would grow without bound
-- and still need aggregating before it could be drawn.

CREATE TABLE attempts (
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id       UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solved           BOOLEAN NOT NULL DEFAULT false,
    runs             INT NOT NULL DEFAULT 0,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Set once, the first time every case passed. Kept even if a later edit
    -- breaks the solution: "I solved this" is a fact about the past.
    solved_at        TIMESTAMPTZ,
    PRIMARY KEY (user_id, problem_id)
);

CREATE INDEX attempts_user_solved_idx ON attempts (user_id, solved_at DESC);

CREATE TABLE activity (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- UTC. A grid of squares does not justify storing a timezone per person.
    day     DATE NOT NULL,
    runs    INT NOT NULL DEFAULT 0,
    solves  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);

CREATE INDEX activity_user_day_idx ON activity (user_id, day DESC);

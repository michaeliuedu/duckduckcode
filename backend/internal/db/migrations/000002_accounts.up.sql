-- Accounts.
--
-- Until now a participant was a name and a colour in localStorage. Community
-- problems need the server to know who wrote what, so identity moves here.

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    handle        TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Emails are compared as stored, so they must arrive normalised. Enforcing
    -- it here means a missed normalisation is a loud error rather than a
    -- duplicate account nobody notices.
    CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
    CONSTRAINT users_email_shape      CHECK (email LIKE '_%@_%._%' AND char_length(email) <= 254),
    -- Handles appear in URLs (/u/<handle>).
    CONSTRAINT users_handle_shape     CHECK (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
    CONSTRAINT users_display_name_len CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 60)
);

-- Sessions.
--
-- The cookie value itself is never stored: only its SHA-256. A dump of this
-- table therefore does not hand anyone a working session. Rows are deleted on
-- logout, so revocation is immediate rather than "wait for the token to expire".
CREATE TABLE sessions (
    token_hash   BYTEA PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    user_agent   TEXT NOT NULL DEFAULT '',

    CONSTRAINT sessions_token_hash_len CHECK (octet_length(token_hash) = 32)
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
-- Supports the periodic sweep of expired rows.
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

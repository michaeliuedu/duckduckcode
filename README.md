# duckduckcode

**[duckduckcode.vercel.app](https://duckduckcode.vercel.app)** — the backend is on a free tier
that sleeps when idle, so the first load after a quiet spell takes about a minute.

Practice problems you work through with someone else. Open a problem, share the link, and edit
one Python file together in real time with live cursors — then run it in the browser and check it
against the author's test cases. Anyone with an account can write problems, collect them into
lists, and track what they have solved.

- **Frontend** — React 19 + TypeScript, Vite, React Router, CodeMirror 6, Yjs, Pyodide
- **Backend** — Go 1.24: JSON API, WebSocket relay, embedded migrations
- **Database** — PostgreSQL 16

---

## Architecture

Three separate pieces. The frontend is static files with no server of its own; all the logic is
in Go, and everything that outlives a request is in Postgres.

```
┌─────────────────────────────┐
│ Browser                     │  React app. Runs Python itself (Pyodide,
│                             │  in a Web Worker). Holds a live copy of
│                             │  the shared document.
└──────────┬──────────────────┘
           │  HTTP   /api/…    ask a question, get an answer
           │  WS     /ws/…     stay connected, stream edits
┌──────────▼──────────────────┐
│ Go server                   │  Serves the API. Relays edits between
│                             │  people. Owns nothing permanently.
└──────────┬──────────────────┘
           │  SQL
┌──────────▼──────────────────┐
│ PostgreSQL                  │  The only thing that survives a restart.
└─────────────────────────────┘
```

The browser talks to the server two different ways, and the split explains most of the design:

- **HTTP** is a letter — ask, answer, done. Problems, accounts, lists, progress.
- **WebSocket** is a phone call that stays open. Only the shared editing in a room.

**Code never runs on the server.** Python executes in the browser via Pyodide, inside the
browser's own sandbox and in a Web Worker so an infinite loop can be killed. Two honest
consequences: hidden test cases are not secret (the browser has to receive what it runs), and
progress is self-reported.

---

## Flow

**Opening a problem and starting a room**

```
click a problem   → GET /api/problems/two-sum          → statement, examples, tests
click Start room  → POST /api/rooms {mode, problemId}
                    Go: freeze a JSON copy of the problem, build the Yjs
                        update that seeds the starter code, INSERT
                  → 201 {room} → redirect to /rooms/<id>
                  → browser opens a WebSocket, replays the log, editor fills in
```

**Typing one character**

```
keystroke → CodeMirror → Yjs document mutates → binary update
          → WebSocket → Go: lock the room, INSERT with a sequence number, broadcast
          → other browser: Yjs applies it → their editor updates
```

The Go server never knew what you typed. It moved opaque bytes and wrote them down.

---

## Persistence

### Rooms are an append-only log

The server has **no Yjs implementation**. It cannot merge, diff or read an update — it treats
each one as bytes. So a room is stored as a log:

| table | holds |
| --- | --- |
| `rooms` | one row per room, plus a frozen JSON copy of the problem |
| `room_updates` | every Yjs update, `seq BIGSERIAL`, append-only |
| `room_snapshots` | one compacted state per room |

On an edit the server **persists first, then broadcasts, both inside one lock**. That single lock
is what makes ordering global: nobody hears about an update that is not yet durable, and everyone
hears them in the same order.

A new joiner gets the snapshot, then every update after it. Yjs applies them idempotently.

### Compaction borrows a client's brain

The log only grows, because the server cannot merge. So once a room passes 200 updates the server
asks a connected client — *"you understand Yjs, send me your whole document"* — stores the reply
as a snapshot, and deletes the rows it covers.

A client may only vouch for updates it was actually sent. Without that check a confused client
could claim coverage it does not have and the server would delete real edits.

### The room keeps its own copy of the problem

`rooms.problem_snapshot` is the problem exactly as it was when the room started. An author
editing or deleting their problem cannot change what a pair is currently looking at.

### Everything else

| table | holds |
| --- | --- |
| `users`, `sessions` | accounts; sessions store only a SHA-256 of the token |
| `problems`, `problem_examples`, `problem_tests` | authored problems |
| `lists`, `list_items` | collections, slug unique per owner |
| `attempts` | one row per person per problem — "have I solved this?" |
| `activity` | one row per person per day — the contribution grid |

Passwords are **argon2id**; the plaintext is never stored. Session tokens are 32 random bytes in
an `HttpOnly` cookie, and only their hash is kept, so a leaked database contains no usable
tokens.

Migrations live in `backend/internal/db/migrations/` and are compiled into the binary, so the
container carries its own schema history and applies it at startup.

---

## Endpoints

Rejected forms return `{"error": "…", "fields": {…}}`, where `fields` maps a form field name to a
message to show beside that input.

### Accounts

| method | path | |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{email, handle, displayName, password}` → `201 {user}` + cookie |
| POST | `/api/auth/login` | `{email, password}` → `200 {user}` + cookie |
| POST | `/api/auth/logout` | deletes the session row, clears the cookie |
| GET | `/api/auth/me` | `{user}` or `{user: null}` — never 401, so the app can boot |
| PATCH | `/api/auth/profile` | `{handle, displayName}` |
| POST | `/api/auth/password` | `{currentPassword, newPassword}`; revokes other sessions |

### Problems

| method | path | |
| --- | --- | --- |
| GET | `/api/home` | front page feed: `{official, popular, recent}` |
| GET | `/api/problems` | browse and search: `?q=&difficulty=&author=&official=&sort=` |
| GET | `/api/problems/{slug}` | one problem with examples and tests, plus `canEdit` |
| POST | `/api/problems` | create a draft |
| PATCH | `/api/problems/{slug}` | edit — author only |
| PUT | `/api/problems/{slug}/visibility` | `draft` \| `unlisted` \| `public` — author only |
| DELETE | `/api/problems/{slug}` | delete; open rooms are unaffected — author only |

### Lists, profiles, progress

| method | path | |
| --- | --- | --- |
| GET | `/api/lists` | your lists; `?contains=<slug>` marks which hold that problem |
| POST | `/api/lists` | create |
| GET | `/api/lists/{id}` | a list and its problems |
| PATCH / DELETE | `/api/lists/{id}` | rename, change visibility, delete — owner only |
| POST | `/api/lists/{id}/items` | `{"problemId":"<slug>"}` — owner only |
| DELETE | `/api/lists/{id}/items/{slug}` | remove — owner only |
| GET | `/api/users/{handle}` | profile: their problems, public lists, activity grid |
| POST | `/api/progress` | `{"problemId":"<slug>","solved":true}` — records a test run |
| GET | `/api/progress` | your totals and last year of activity |

### Rooms and health

| method | path | |
| --- | --- | --- |
| POST | `/api/rooms` | `{"mode":"blank"}` or `{"mode":"practice","problemId":"…"}` |
| GET | `/api/rooms/{id}` | room metadata + its problem snapshot |
| WS | `/ws/rooms/{id}` | y-websocket protocol; unknown rooms close with `4404` |
| GET | `/healthz` | liveness, no dependencies |
| GET | `/readyz` | readiness: pings Postgres, reports live room and client counts |

Reads are open. Writes need an account, and every write re-checks ownership on the server. A
draft that is not yours returns 404 rather than 403, so the URL does not confirm it exists.
**Rooms need no account at all** — a link is the whole access model.

---

## Running it

```bash
docker compose up -d --build
```

Then open <http://localhost:3000>. The backend migrates and seeds ten problems on first boot.

For frontend work, `npm run dev --prefix frontend` gives hot reload on port 5173 and proxies
`/api` and `/ws` to the Go server, so the browser sees one origin exactly as in production.

### Tests

```bash
docker compose --profile test run --rm backend-test   # Go
npm test --prefix frontend                            # unit
npx playwright test --prefix frontend                 # end to end
```

The e2e suite signs up as it goes and does not tidy up. Every account it creates uses an
`@example.edu` address, which makes this safe:

```bash
docker compose exec postgres psql -U duck -d duckduckcode -c "DELETE FROM users WHERE email LIKE '%@example.edu'; DELETE FROM problems WHERE NOT official; UPDATE problems SET room_count = 0;"
```

---

## Configuration

### Backend

| variable | default | |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection string |
| `PORT` | `8080` | |
| `MIGRATE_ON_START` | `true` | apply migrations before serving |
| `CORS_ALLOWED_ORIGINS` | empty | comma-separated; empty means same-origin only |
| `SESSION_COOKIE_CROSS_SITE` | `false` | `SameSite=None; Secure` — needed only when the frontend is on another site |
| `SNAPSHOT_EVERY` | `200` | updates before compaction is requested |
| `SESSION_TTL` | `720h` | |
| `LOG_FORMAT` / `LOG_LEVEL` | `text` / `info` | |

### Frontend

| variable | |
| --- | --- |
| `VITE_BACKEND_URL` | build-time backend origin. Empty means same origin. |

---

## Deploying

The backend needs a **long-running process** — it holds WebSockets open and keeps room ordering
in memory — so it cannot go on a serverless platform.

### What is running now

Three free tiers, one per piece:

| piece | host | notes |
| --- | --- | --- |
| frontend | **Vercel** | root directory `frontend`, Vite preset |
| backend | **Render** | root directory `backend`, Docker runtime, free instance |
| database | **Neon** | Postgres 18, free plan |

Both hosts redeploy automatically on a push to `main`.

Four settings make the split work, because the frontend and the API are on different domains:

| where | setting |
| --- | --- |
| Vercel | `VITE_BACKEND_URL=https://duckduckcode.onrender.com` |
| Render | `DATABASE_URL=` the Neon string |
| Render | `CORS_ALLOWED_ORIGINS=https://duckduckcode.vercel.app` |
| Render | `SESSION_COOKIE_CROSS_SITE=true` |

None of them are needed when something serves both halves from one origin — which is what the
AWS setup below does, and why it has no CORS configuration at all.

Three things that are easy to get wrong:

- **Use Neon's _direct_ connection string, not the pooled one.** Migrations take a
  session-scoped advisory lock, and a transaction pooler hands out a different backend
  connection per transaction, so the lock is taken on one and released on another.
- **`VITE_BACKEND_URL` is inlined at build time.** Adding it after the first deploy does nothing
  until you redeploy without the build cache.
- **Only the stable `*.vercel.app` domain is in the allow-list.** Per-deployment preview URLs
  will fail CORS, which is expected rather than broken.

**Production-grade:** `infra/terraform/` builds the whole thing on AWS — ECS Fargate, RDS, an ALB
routing `/api` and `/ws` to the backend, ACM certificates, Secrets Manager. `infra/scripts/deploy.ps1`
(or `.sh`) builds, pushes and applies in one command.

---

## Known limits

- **The backend runs as a single instance.** Room ordering lives in process memory, so two
  instances would hand out conflicting sequence numbers. Going wider needs sticky routing per
  room, or relaying updates through Postgres `LISTEN/NOTIFY`.
- **Hidden tests are hidden, not secret** — the browser runs them, so it receives them.
- **Progress is self-reported** for the same reason. A practice tracker, not a grade.
- One file per room, Python only.
- A room link is the only access control, and rooms never expire.
- No email verification or password reset — both need an outbound mail provider.

# duckduckcode

Community-written practice problems you can work through with someone else. Pick a
problem, share the link, and edit one Python file together in real time with live
cursors — then run it in the browser and check it against the author's test cases.
Anyone with an account can write and publish problems, collect them into lists, and
track what they have solved. Everything is persisted, so a refresh or a dropped
connection restores the latest document, the problem and the code.

- **Frontend:** React 19 + Vite single-page app / TypeScript, React Router, CodeMirror 6,
  Yjs + y-websocket + y-codemirror.next, Pyodide in a Web Worker
- **Backend:** Go 1.24 — room API, WebSocket relay, PostgreSQL persistence, embedded migrations
- **Persistence:** PostgreSQL 16
- **Local dev:** Docker Compose
- **AWS:** ECS/Fargate, RDS PostgreSQL, Application Load Balancer, ECR, CloudWatch, Secrets Manager — all in Terraform

## Contents

- [User flow](#user-flow)
- [Accounts](#accounts)
- [Progress](#progress)
- [Problems and test cases](#problems-and-test-cases)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Tests](#tests)
- [Configuration](#configuration)
- [HTTP / WebSocket API](#http--websocket-api)
- [AWS deployment](#aws-deployment)
- [Scaling the backend](#scaling-the-backend)
- [Limitations and next steps](#limitations-and-next-steps)

## User flow

1. The front page is the problem browser: the problems that ship with the app, then
   the community problems most often opened in a room, then what was published recently.
   Search covers titles, summaries and statements; difficulty and author are filters.
2. Opening a problem shows its statement, worked examples and what its test cases check.
   **Start a room** creates one at `/rooms/<22-char random id>` (128 bits of randomness,
   URL-safe base64) pre-filled with the starter code.
3. Anyone with the link joins the same document, with no account needed. Edits are merged
   by Yjs (a CRDT) and each participant's caret and selection are shown with their name
   and colour.
4. **Run** executes the file in the browser (Pyodide, in a Web Worker). **Test** checks it
   against the author's cases and reports each one as passed or failed with what it wanted
   and what it got. **Visualize** records the run line by line. All three results are
   shared, so both people see the same thing.

   The visualiser draws values rather than printing them. A list or a string is a row of
   numbered cells; the integers that index it (`i`, `left`, `right`, …) are drawn as
   carets under the cell they address, including one past the end, which is where a
   half-open right edge lives. A dict is a key → value table, a rectangular list of lists
   is a grid, and a dict of neighbours is drawn as a graph. Whatever the last line wrote
   to is highlighted cell by cell, so "what did that do?" is answered by looking rather
   than by comparing two reprs. The shapes come from the tracer, which sends structure
   alongside the `repr` — see [`traceScript.ts`](frontend/src/python/traceScript.ts).
5. With an account you can **write a problem** — statement in Markdown, starter code, the
   function the tests call, and the cases themselves — keep it as a draft, publish it, and
   collect problems into lists.
6. Refreshing or reconnecting restores the latest document, the problem and the code from
   PostgreSQL. Edits made while offline are merged on reconnect.

Ten problems ship with the app: the opening run of the classic interview-prep sequence,
from `Two Sum` through `Regular Expression Matching`, each with six to nine test cases and
some of those hidden. The statements are written for this app rather than copied from
anywhere, and two are adapted to what the browser runner can pass across the wire — the
harness calls a function with JSON arguments, so the linked lists of `Add Two Numbers` are
lists of digits here.

They are not a special case in the code: a boot-time seed inserts them as ordinary rows
owned by a `duckduckcode` system account and flagged `official`, so the code path that
serves them is the one that serves anything a member writes. The seeding machinery is in
[`backend/internal/seed/seed.go`](backend/internal/seed/seed.go) and the catalog itself in
[`backend/internal/seed/problems.go`](backend/internal/seed/problems.go). Seeding is
idempotent and never overwrites an existing slug, so editing a shipped problem in place
survives the next deploy.

## Accounts

Accounts exist so that problems can have authors. Everything that creates or owns content needs
one; **nothing about a room does**. Anyone sent a link joins, edits and runs code with no
account, which is the flow that matters most: a link should never be a sign-up wall.

| you are | you can |
| --- | --- |
| anonymous | open any room link, edit, run, visualise, name your own cursor |
| signed in | all of the above, plus your account's name on your cursor — and, from the next phase, author and publish problems and keep lists |

Signing up takes an email, a username (lowercase, used in URLs) and a password of at least ten
characters. Length is the only password rule: composition requirements push people towards
`Password1!`, which is not what NIST recommends.

**How it works.** Passwords are hashed with argon2id at the OWASP minimum parameters — 19 MiB,
two passes, one lane. The memory cost is deliberately not higher: the backend runs in a 512 MB
task, and 64 MiB per hash would turn the login form into a way to exhaust it.

A session is 256 bits of randomness in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` whenever the
request arrived over HTTPS. The database stores only the **SHA-256 of the token**, so a dump of
the `sessions` table contains nothing that can sign anyone in. Logging out deletes the row, so
revocation is immediate rather than "wait for it to expire", and changing a password deletes every
other session for that account.

Things that are easy to get wrong, and are therefore tested
([`backend/internal/server/auth_test.go`](backend/internal/server/auth_test.go),
[`frontend/e2e/auth.spec.ts`](frontend/e2e/auth.spec.ts)):

- **Account enumeration.** A wrong password and a non-existent account return the identical
  message, and the missing-account path still performs one argon2 verification so the two cannot
  be told apart by response time either.
- **CSRF.** Every unsafe method requires an `Origin` matching the host. `SameSite=Lax` alone does
  not cover a cross-site form post.
- **Rate limits.** Login attempts per email are capped tightly (5 per quarter hour), because that
  is the bucket password guessing has to pass through however it is distributed. Per-address
  limits are deliberately loose (30), because a lecture hall behind one campus NAT is a single
  address as far as the server can tell — a strict per-IP cap locks out a class, not an attacker.
- **Open redirect.** `?next=` accepts only same-site paths, so the sign-in page cannot be used to
  make a phishing link look like ours.

## Progress

Running a problem's test cases records an attempt against your account, and passing every
case records a solve. Two tables, because they answer different questions: `attempts` is
one row per person per problem (have I solved this?) and `activity` is one row per person
per day (have I been practising?), which is exactly the shape the contribution grid draws.
An append-only log of every run would grow without bound and still need aggregating before
anything could be rendered from it.

The grid appears on the home page for whoever is signed in, and on every profile — a
profile is public, so the grid on it shows activity, never what anyone got wrong.

**The numbers are self-reported.** The tests run in the browser, so the browser is what
tells the server the result. Someone determined could inflate their own grid. That is the
right trade for a practice tracker and would be the wrong one for a grade; the endpoint is
scoped to the caller's own account, so the worst case is lying to yourself.

## Problems and test cases

A problem is a row with an author, a slug that never changes, a Markdown statement,
starter code, worked examples and test cases. Visibility is `draft` (only the author),
`unlisted` (reachable by link) or `public` (listed and searchable). Every write re-checks
ownership on the server; a draft that is not yours returns 404 rather than 403, so the URL
does not confirm it exists.

**Test cases call a function.** Each case is a JSON array of arguments and an expected
return value, and the problem names the function to call:

```
entry_point: "two_sum"
case 1  args: [[2, 7, 11, 15], 9]           expect: [0, 1]
case 2  args: [[3, 3], 6]                   expect: [0, 1]      (hidden)
```

They run in the browser, in the same Pyodide worker as Run. Two details the comparison has
to get right, both of which would otherwise fail correct answers: JSON has arrays where
Python has lists *and* tuples, so both are normalised before comparing, and floats are
compared with a tolerance.

**Hidden cases are hidden, not secret.** They are not shown before running and their
arguments are not shown afterwards, but the browser executes them, so it necessarily
receives them. Anyone willing to open the network tab can read them. That is the right
trade for a practice tool — real secrecy needs a server-side sandbox, which is a much
larger and riskier piece of work — but it should not be mistaken for a grading control.

**Rooms snapshot their problem.** A room stores the problem exactly as it was when the room
was created. An author editing or deleting their problem cannot change what a pair is
looking at mid-session, and cannot break a room that is already open. `rooms.problem_id`
stays as a soft reference so "open the original" still works.

**Statements are Markdown written by strangers**, which makes rendering them the sharpest
edge in the app. Everything goes through
[`src/ui/Markdown.tsx`](frontend/src/ui/Markdown.tsx): `marked` to render, then DOMPurify
against a small allow-list, with link schemes restricted and `rel="noopener"` forced on
every link. `marked` is not a sanitiser — it passes raw HTML through by design — so the
purify step is what actually makes this safe. It is the only place in the codebase that
calls `dangerouslySetInnerHTML`, and it has a test per attack it must survive.

## Architecture

```
 Browser A ─┐   HTTPS/WSS    ┌──────────────┐   /            ┌───────────────────┐
            ├───────────────▶│     ALB      │───────────────▶│ nginx + SPA       │
 Browser B ─┘                │ (one origin) │   /api/* /ws/* │                   │
                             └──────────────┘───────────────▶│ Go backend        │──▶ RDS PostgreSQL
                                                             │ (Fargate, 1 task) │
                                                             └───────────────────┘
```

**Client.** A static bundle: React Router owns the URLs, loaders fetch room and problem data
before a page renders, and one action creates rooms. There is no server-side rendering and no
Node process in production — nginx serves the files and falls back to `index.html` for client
routes.

Each room holds a `Y.Doc` with a single `Y.Text` named `content` and a `Y.Map` named `meta` for
the shared run and trace. `y-websocket` connects to `/ws/rooms/<id>` on the backend and
`y-codemirror.next` binds the text to CodeMirror. Cross-tab BroadcastChannel sync is disabled so
every update really goes through the server. The session (document, provider, connection state,
participant list) is created in [`src/collab/session.ts`](frontend/src/collab/session.ts) and is
plain TypeScript; React touches it through one hook.

Remote carets are drawn by [`src/editor/remoteCursors.ts`](frontend/src/editor/remoteCursors.ts)
rather than by `y-codemirror.next`'s own plugin. Its caret widget compares itself to the next one
by colour alone, so CodeMirror reuses the existing DOM when only the name changed and someone who
renames themselves keeps their old label on the other person's screen for the rest of the
session. Ours compares the name too, and shows the label without needing a hover. The document
binding and undo manager still come from the library.

Python runs in a **Web Worker**, not on the page. That keeps the UI responsive while the ~10MB
interpreter downloads and while code runs, and it is what makes `while True: pass` recoverable:
the page terminates the worker and keeps whatever was printed. On the main thread a timeout can
never fire, because the blocking loop owns the thread the timer would run on.

**Backend.** The Go server speaks the y-websocket wire protocol (lib0 varints; sync step 1/2,
update, awareness) but does **not** run a Yjs document. It treats updates as opaque blobs:

- Every update from a client is appended to `room_updates` (a per-room ordered log) and relayed
  to the other clients of that room. Persist-then-broadcast happens under a per-room lock, so all
  clients observe the same order.
- On connect the server replays the room (`snapshot` + later updates) to the client, then sends
  a `SyncStep1` so the client returns anything the server is missing (e.g. offline edits).
- Awareness (cursor/name) updates are broadcast to everyone, including the sender; the server
  remembers each participant's last state so late joiners see existing cursors, and it emits a
  removal when a connection closes.
- **Compaction.** Because the server cannot merge Yjs updates itself, once a room's log exceeds
  `SNAPSHOT_EVERY` entries it asks a synced client (private message type `100`) for its full
  encoded state tagged with the highest sequence number that client is known to hold. The client
  replies (`101`) and the server atomically stores the snapshot and deletes the covered rows.
- **Starter code.** Practice rooms are seeded server-side with a hand-crafted Yjs v1 update that
  inserts the starter code (verified byte-for-byte against the real Yjs library in
  `yproto_test.go`). Seeding on the server avoids the classic race where two clients both insert
  the starter text.

**Persistence model** (`backend/internal/db/migrations`):

| table            | purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `users`          | account: email, handle, display name, argon2id hash                         |
| `sessions`       | login: SHA-256 of the cookie token, expiry, last seen                       |
| `problems`       | author, slug, Markdown statement, starter code, entry point, visibility, `room_count`, a generated `tsvector` for search |
| `problem_examples` | ordered worked examples                                                   |
| `problem_tests`  | ordered cases: `args` and `expected` as JSONB, `hidden`                     |
| `lists`, `list_items` | collections of problems, ordered, per owner                            |
| `attempts`       | one row per person per problem: solved, runs, first solve                   |
| `activity`       | one row per person per day: runs and solves, for the grid                    |
| `rooms`          | id, mode (`practice`/`blank`), `problem_id`, `problem_snapshot`, language, timestamps |
| `room_updates`   | append-only Yjs updates (`seq BIGSERIAL`, `room_id`, `data BYTEA`)           |
| `room_snapshots` | compacted state per room; covers all updates with `seq <= snapshot.seq`      |

## Repository layout

```
backend/                 Go service
  cmd/server/            entrypoint (serve, migrate, migrate-down, migrate-version)
  internal/config        env configuration
  internal/db            pgx pool + golang-migrate with embedded SQL
  internal/hub           WebSocket relay, room state, compaction

  internal/server        HTTP API, health checks, CORS, logging
  internal/store         PostgreSQL persistence
  internal/auth          password hashing, session tokens, field validation
  internal/seed          the problems that ship with the app, inserted at boot
  internal/slug          title -> URL name, with collision handling
  internal/yproto        lib0 / y-protocols codec + seed update
frontend/                React + Vite single-page app
  index.html             shell; applies the saved theme before first paint
  public/                favicon, runtime-config.js (rewritten at container start)
  src/routes/            the route table, loaders, actions, pages
  src/auth/              the session store and the identity a room publishes
  src/api/               URL building and the typed HTTP client
  src/collab/            Yjs session, shared cells, the one React hook
  src/editor/            CodeMirror extensions, themes, completions
  src/python/            Pyodide worker, its protocol, run and trace models
  src/features/room/     the workspace: header, panes, runner, layout
  src/ui/                buttons, panels, tabs, icons, the resizable split
  src/lib/               theme, identity, storage, hooks, formatting
  nginx/                 the production server config
  e2e/                   Playwright two-browser-session and layout tests
infra/terraform/         AWS infrastructure
infra/scripts/           deploy.sh / deploy.ps1 / destroy.sh
docker-compose.yml       local stack (+ `test` profile for Go integration tests)
```

## Local development

Prerequisites: Docker Desktop (or Docker Engine + Compose v2). Node 20+ only if you want the
Vite dev server or the frontend tests.

```bash
docker compose up --build
```

| service  | URL                              |
| -------- | -------------------------------- |
| frontend | http://localhost:3000            |
| backend  | http://localhost:8080 (`/healthz`, `/readyz`, `/api/...`, `/ws/...`) |
| postgres | `postgres://duck:duck@localhost:5432/duckduckcode` |

Migrations run automatically when the backend starts (`MIGRATE_ON_START=true`). To manage them by
hand:

```bash
docker compose run --rm backend migrate           # apply pending
docker compose run --rm backend migrate-version   # show version
docker compose run --rm backend migrate-down      # roll back everything (destroys data)
```

Frontend hot-reload against the Dockerised backend. The Vite dev server proxies `/api` and
`/ws` (WebSockets included) to the backend, so the browser talks to one origin exactly as it
does in production, and no CORS configuration is involved:

```bash
docker compose up -d postgres backend
cd frontend && npm install && npm run dev        # http://localhost:5173
```

Point the proxy somewhere else with `BACKEND_ORIGIN=http://host:port npm run dev`, or skip the
proxy entirely and have the browser call an absolute URL with `VITE_BACKEND_URL=https://...`.

Logs: `docker compose logs -f backend` (set `LOG_LEVEL=debug` in `docker-compose.yml` to see
per-room replay/snapshot events). Stop and remove everything, including the database volume:
`docker compose down -v`.

## Tests

**Backend (Go).** Unit tests for the protocol codec and for password hashing, session tokens and
field validation; integration tests for accounts (sign-up, sign-in, sessions, the origin check,
rate limiting) and for room creation,
the update log, snapshot compaction, WebSocket relay/replay, awareness removal, and persistence
across a backend restart. Integration tests need PostgreSQL and are skipped unless
`TEST_DATABASE_URL` is set. The compose `test` profile provides everything:

```bash
docker compose --profile test run --rm backend-test
# or, with Go installed locally:
cd backend && TEST_DATABASE_URL=postgres://duck:duck@localhost:5432/duckduckcode_test?sslmode=disable go test ./...
```

**Frontend unit tests (Vitest).** 149 tests over the pure logic: URL building, runtime config
resolution, the split-pane arithmetic (clamping, minimums, pointer-to-fraction), run and trace
parsing, collection splitting, Pyodide output handling, completions, storage, and the shared
Yjs cell — including that it hands React a stable object identity, which is what keeps
`useSyncExternalStore` from re-rendering forever.

```bash
cd frontend && npm install && npm test
```

**End-to-end (Playwright), 55 tests** across six specs. The collaboration and identity specs
drive two isolated browser contexts at once — separate storage, i.e. two genuinely separate
people.

- `collaboration.spec.ts` — simultaneous edits at both ends of the file converge and each side
  renders the other's named caret; one side goes offline, both keep editing, it reconnects and
  both converge; a hard refresh restores problem + code; a blank room persists after its author
  leaves; unknown rooms and unknown URLs show a not-found page. Run and Visualize execute real
  Python and share the result and the step pointer, and `while True: pass` is started, shown to
  still be printing, and stopped.
- `layout.spec.ts` — dragging each divider, the pixel minimums, keyboard resizing (arrows,
  Shift, Home/End, Enter), double-click reset, collapsing, persistence across a reload, the Reset
  control, the shortcuts, and the tabbed narrow layout.
- `identity.spec.ts` — picking a colour and renaming yourself, both reflected in the other
  session's avatars and caret labels, and kept across a reload.
- `problems.spec.ts` — the home page leading with the default problems; search by words in
  a statement; filters that live in the URL; writing a problem, publishing it and finding
  it; a statement that tries to inject script and cannot; a room checking a solution
  against the author's cases and going from failing to passing; a hidden case reporting its
  verdict without revealing its arguments; editing and deleting a problem leaving an open
  room untouched; lists; and that only the author can edit.
- `progress.spec.ts` — an empty grid before anything is run, the introduction rather than a
  grid for a visitor, and a real solve of `Two Sum` filling in a square, ticking the row and
  showing on the public profile.
- `auth.spec.ts` — signing up, staying signed in across a reload, signing out; a wrong password
  rejected inline; the session cookie unreadable from script; a guarded URL bouncing through
  sign-in and back; `?next=` refusing an external URL; a password change signing other browsers
  out; and, most importantly, **a room link still working in a browser that has never signed in**.

Runs against a running stack:

```bash
docker compose up -d --build
cd frontend && npx playwright install chromium && npm run e2e
# against a deployment:
E2E_BASE_URL=https://code.example.edu npm run e2e
```

Also useful: `npm run typecheck` and `npm run lint` in `frontend/`.

### Clearing up after a run

The suite signs up as it goes and does not tidy up, so every run leaves accounts, the
problems they wrote and their rooms behind in the local database. None of it is reachable
from the UI, but it accumulates, and a few hundred stray problems make the browse page
useless for looking at your own work.

Every account the suite creates uses an `@example.edu` address, which is what makes this
safe to run — it cannot match a real one:

```bash
docker compose exec postgres psql -U duck -d duckduckcode -c "DELETE FROM users WHERE email LIKE '%@example.edu'; DELETE FROM problems WHERE NOT official; UPDATE problems SET room_count = 0;"
```

Deleting the accounts takes their problems, lists and progress with them. Rooms are
anonymous, so they outlive their authors and have to go separately — this discards every
room link, including any of your own:

```bash
docker compose exec postgres psql -U duck -d duckduckcode -c "DELETE FROM rooms;"
```

## Configuration

### Backend (`backend/`)

| variable               | default   | description                                                                 |
| ---------------------- | --------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`         | required  | PostgreSQL URL, e.g. `postgres://user:pass@host:5432/db?sslmode=require`   |
| `PORT` / `ADDR`        | `8080` / `:$PORT` | listen address                                                      |
| `MIGRATE_ON_START`     | `true`    | apply embedded migrations before serving                                   |
| `CORS_ALLOWED_ORIGINS` | empty     | comma-separated browser origins allowed for the API and WebSocket upgrades. Empty = same-origin only (production) |
| `SNAPSHOT_EVERY`       | `200`     | updates per room before a snapshot is requested (min 10)                   |
| `SESSION_TTL`          | `720h`    | how long a login lasts without use; refreshed at most hourly               |
| `LOGIN_ATTEMPTS_PER_EMAIL` | `5`   | login attempts per email per 15 minutes — the real brute-force limit       |
| `LOGIN_ATTEMPTS_PER_IP` | `30`     | per address per 15 minutes; loose on purpose, since a campus NAT is one address |
| `SIGNUPS_PER_IP`       | `30`      | new accounts per address per hour. `docker-compose.yml` raises this and the login limit for local use, where every request arrives from the Docker bridge and so looks like one very busy address |
| `LOG_FORMAT`           | `text`    | `text` or `json`                                                            |
| `LOG_LEVEL`            | `info`    | `debug`, `info`, `warn`, `error`                                            |

### Frontend (`frontend/`)

Runtime settings are read by the **container**, not baked into the bundle: the entrypoint writes
them into `/runtime-config.js`, which the page loads before the app. One built image therefore
serves every environment.

| variable             | default | description                                                                                    |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `BACKEND_PUBLIC_URL` | empty   | URL the **browser** uses for the backend. Empty = same origin (the ALB routes `/api` and `/ws`). Must be an absolute `http(s)` URL; anything else is rejected with a warning and treated as empty. |
| `PORT`               | `3000`  | the port nginx listens on                                                                       |

Two more matter only outside the container:

| variable             | default                 | description                                                          |
| -------------------- | ----------------------- | -------------------------------------------------------------------- |
| `BACKEND_ORIGIN`     | `http://localhost:8080` | where `npm run dev` proxies `/api` and `/ws`                          |
| `VITE_BACKEND_URL`   | empty                   | build-time override; takes precedence over `/runtime-config.js`       |

## HTTP / WebSocket API

Rejected forms return `{"error": "…", "fields": {…}}`, where `fields` maps a form field name to a
message to show beside that input.

| method | path                     | description                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------ |
| POST   | `/api/auth/signup`       | `{email, handle, displayName, password}` → `201 {user}` + session cookie |
| POST   | `/api/auth/login`        | `{email, password}` → `200 {user}` + session cookie                      |
| POST   | `/api/auth/logout`       | deletes the session row and clears the cookie                            |
| GET    | `/api/auth/me`           | `{user}` or `{user: null}` — never 401, so the SPA can boot              |
| PATCH  | `/api/auth/profile`      | `{handle, displayName}` (signed in)                                      |
| POST   | `/api/auth/password`     | `{currentPassword, newPassword}`; revokes other sessions (signed in)     |
| GET    | `/api/home`              | the front page feed: `{official, popular, recent}`                       |
| GET    | `/api/problems`          | browse and search: `?q=&difficulty=&author=&official=&sort=&limit=&offset=` |
| GET    | `/api/problems/{slug}`   | one problem with examples and tests, plus `canEdit`                      |
| POST   | `/api/problems`          | create a draft (signed in)                                               |
| PATCH  | `/api/problems/{slug}`   | edit (author only)                                                       |
| PUT    | `/api/problems/{slug}/visibility` | `{"visibility":"draft\|unlisted\|public"}` (author only)          |
| DELETE | `/api/problems/{slug}`   | delete; rooms started from it are unaffected (author only)               |
| GET    | `/api/lists`             | your lists; `?contains=<slug>` also returns which hold that problem      |
| POST   | `/api/lists`             | create a list (signed in)                                                |
| GET    | `/api/lists/{id}`        | a list and its problems                                                  |
| PATCH  | `/api/lists/{id}`        | rename or change visibility (owner only)                                 |
| DELETE | `/api/lists/{id}`        | delete (owner only)                                                      |
| POST   | `/api/lists/{id}/items`  | `{"problemId":"<slug>"}` (owner only)                                    |
| DELETE | `/api/lists/{id}/items/{slug}` | remove from a list (owner only)                                    |
| GET    | `/api/users/{handle}`    | a profile with their problems, public lists and activity grid            |
| POST   | `/api/progress`          | `{"problemId":"<slug>","solved":true}` — records a test run (signed in)   |
| GET    | `/api/progress`          | your totals and last year of activity (signed in)                        |
| GET    | `/healthz`               | liveness (no dependencies)                                               |
| GET    | `/readyz`                | readiness: pings PostgreSQL, reports live room/client counts             |
| GET    | `/api/problems`          | problem summaries                                                        |
| GET    | `/api/problems/{id}`     | full problem incl. statement, examples, starter code                     |
| POST   | `/api/rooms`             | `{"mode":"blank"}` or `{"mode":"practice","problemId":"..."}` → `201 {room, problem?}` |
| GET    | `/api/rooms/{id}`        | room metadata + problem (404 if unknown)                                 |
| WS     | `/ws/rooms/{id}`         | y-websocket protocol; unknown rooms are closed with code `4404` (permanent) |

The frontend exposes `GET /health` for its own target-group health check.

## AWS deployment

### What gets created

`infra/terraform` provisions, in one region:

- VPC (2 AZs), public subnets for the ALB and Fargate tasks (public IPs, no NAT gateway to keep
  cost down), private subnets for RDS; security groups so only the ALB reaches the tasks and only
  the tasks reach the database.
- ECR repositories (`<project>-<env>/backend`, `/frontend`) with lifecycle policies.
- ECS cluster (Container Insights on) with two Fargate services: **backend, desired count 1**
  (`min healthy 0% / max 100%` so two backend tasks never overlap) and frontend (default 1,
  horizontally scalable). Deployment circuit breaker with rollback.
- Application Load Balancer, idle timeout 300 s, target groups with health checks
  (`/healthz` backend, `/health` frontend), listener rule routing `/api/*`, `/ws/*`, `/healthz`,
  `/readyz` to the backend and everything else to the frontend.
- RDS PostgreSQL 16 (`db.t4g.micro`, gp3, encrypted, 7-day backups), password from
  `random_password`, full `DATABASE_URL` in Secrets Manager injected into the backend task.
- CloudWatch log groups `/ecs/<project>-<env>/backend` and `/frontend` (JSON logs from the
  backend), 14-day retention.
- IAM execution role (pull images, write logs, read the secret) and an empty task role.
- Optional ACM certificate + Route 53 records.

### HTTPS / WSS

Serving frontend and backend from **one hostname** is what makes WSS work without extra
configuration: the page loads over `https://host`, the browser opens `wss://host/ws/rooms/<id>`,
and the ALB terminates TLS for both. Pick one of:

1. **No domain (evaluation only).** Leave `domain_name`, `hosted_zone_id`, `certificate_arn`
   empty. The app runs on `http://<alb-dns-name>` with `ws://`. Unencrypted.
2. **Domain in Route 53.** Set `domain_name` and `hosted_zone_id`. Terraform requests an ACM
   certificate, validates it via DNS and creates the alias record. HTTP redirects to HTTPS.
3. **Domain elsewhere.** Request a certificate for the hostname in ACM (same region), validate
   it, then set `certificate_arn` and `domain_name`. After deploy, create a CNAME from your
   hostname to the `alb_dns_name` output.

### Deploy

Prerequisites: AWS CLI authenticated with rights to create the resources above, Docker,
Terraform ≥ 1.6.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit region / domain options
cd ../..
infra/scripts/deploy.sh            # or: .\infra\scripts\deploy.ps1 on Windows
```

The script: `terraform init` → creates the ECR repositories → builds both images for
`linux/amd64` and pushes them tagged with the git SHA → `terraform apply -var image_tag=<sha>`
(new task-definition revisions roll the services) → waits for `aws ecs wait services-stable` →
prints the URL. First deploy takes ~10–15 minutes (RDS is the slow part). Re-running the script
deploys a new version.

Terraform state is local by default; for shared use uncomment the S3 backend in `versions.tf`.

### Verify

```bash
URL=$(cd infra/terraform && terraform output -raw app_url)
curl $URL/healthz     # {"status":"ok",...}
curl $URL/readyz      # {"status":"ready","rooms":0,"clients":0}
curl -X POST $URL/api/rooms -H 'content-type: application/json' -d '{"mode":"blank"}'
# then open $URL in two browsers, or run the e2e suite against it:
cd frontend && E2E_BASE_URL=$URL npm run e2e
```

### Logs, migrations, health checks

- **Logs:** `aws logs tail /ecs/duckduckcode-dev/backend --follow` (and `/frontend`). Backend
  logs are JSON (`LOG_FORMAT=json`), one line per HTTP request, client join/leave, room created,
  snapshot compacted, etc.
- **Health:** ECS uses the ALB health checks (`/healthz`, `/health`); `/readyz` additionally
  checks the database. The frontend image also has a Docker `HEALTHCHECK`.
- **Migrations:** run automatically when the backend task starts (`MIGRATE_ON_START=true`).
  golang-migrate holds a PostgreSQL advisory lock while migrating. To run them manually or roll
  back, run a one-off task with the same task definition and the `migrate` /
  `migrate-down` command, e.g.

  ```bash
  aws ecs run-task --cluster duckduckcode-dev --launch-type FARGATE \
    --task-definition duckduckcode-dev-backend \
    --network-configuration "awsvpcConfiguration={subnets=[<public-subnet-id>],securityGroups=[<ecs-sg-id>],assignPublicIp=ENABLED}" \
    --overrides '{"containerOverrides":[{"name":"backend","command":["migrate-version"]}]}'
  ```

  or use `aws ecs execute-command` (enabled on both services) to open a shell in the frontend
  container. The backend image is distroless (no shell) by design.
- **Environment:** non-secret settings live in the task definitions (`infra/terraform/ecs.tf`);
  the only secret, `DATABASE_URL`, is in Secrets Manager. Change a value → `terraform apply` →
  ECS rolls the service.

### Tear down

```bash
infra/scripts/destroy.sh           # terraform destroy; asks for confirmation
```

With the defaults (`db_skip_final_snapshot = true`, ECR `force_delete`, Secrets Manager recovery
window 0) nothing is left behind — including all room data. Set `db_skip_final_snapshot = false`
to keep a final RDS snapshot.

Rough monthly cost with defaults (us-east-1): ALB ≈ $16–20, 2× Fargate 0.25 vCPU/0.5 GB ≈ $18,
RDS `db.t4g.micro` ≈ $12 + storage — about $50/month while running.

## Scaling the backend

The backend runs as **one** ECS task on purpose. Each instance keeps the authoritative in-memory
order of a room's updates and the set of connected clients; the ECS service is configured so a
deploy stops the old task before starting the new one (clients reconnect with backoff and resync
from PostgreSQL). Running more than one backend task requires one of:

1. **Room affinity** — route every connection for a room to the same task (e.g. a consistent-hash
   layer in front of the tasks; ALB sticky sessions are not enough because they are per client,
   not per room).
2. **Cross-instance relay** — publish each persisted update to the other instances (PostgreSQL
   `LISTEN/NOTIFY`, Redis pub/sub, or similar) so they can forward it to their local clients, and
   make snapshot compaction coordinate on the sequence number.

Either way the update log in PostgreSQL remains the source of truth; only the fan-out needs
coordination. The in-memory login rate limiter would need to move to shared storage at the same
time, or each task would enforce its own allowance. The frontend is stateless and can be scaled by raising `frontend_desired_count`.

## Limitations and next steps

- One file per room, Python only. Code runs in the browser with Pyodide (WebAssembly), not on
  the server; both people see the same output. There is no automatic grading.
- A room link is the only access control; anyone with it can edit. Rooms never expire.
- **No email verification and no password reset.** Both need an outbound email provider, which is
  not wired up — SES is within reach of the AWS account but not configured. Until then, a
  forgotten password needs an operator, and nothing proves an address belongs to whoever typed it.
- No moderation or reporting. Once problems are user-written (the next phase), a public platform
  needs a way to report and take down content; there is currently neither.
- Login rate limiting is in memory, so it is per task. That is consistent with the backend running
  as a single task by design (see below), but it is one more thing that has to move to shared
  storage before a second one can be added.
- Pyodide is fetched from the jsDelivr CDN rather than bundled, so the image stays small. A
  network that blocks it leaves the room fully usable for editing and says so in a banner;
  self-hosting the ~10MB of wasm is the fix if that matters.
- No Content-Security-Policy header yet. A useful one has to allow `wasm-unsafe-eval` and the
  Pyodide origin, and the inline theme-boot script would need a nonce; worth doing, but worth
  doing carefully rather than shipping a policy that breaks Run.
- Streaming output is local to whoever pressed Run — peers see "running", then the finished
  result. Sharing it live would mean a persisted server-side update per printed line.
- The server persists a full-state update on every reconnect (it cannot compute a state-vector
  diff without a Yjs implementation). Compaction bounds the growth, but a Go Yjs port or a
  sidecar running Yjs would make this tighter.
- Multi-instance backend (see above), rate limiting, and read-only spectator mode are natural
  next steps.

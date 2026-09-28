# duckduckcode

A collaborative coding workspace for a student and a TA to use during office hours.
Create a room, share the link, and edit one Python file together in real time with
live cursors. Everything is persisted, so a refresh or a dropped connection restores
the latest document, the selected problem and the code.

- **Frontend:** Next.js 16 / TypeScript, CodeMirror 6, Yjs + y-websocket + y-codemirror.next
- **Backend:** Go 1.24 — room API, WebSocket relay, PostgreSQL persistence, embedded migrations
- **Persistence:** PostgreSQL 16
- **Local dev:** Docker Compose
- **AWS:** ECS/Fargate, RDS PostgreSQL, Application Load Balancer, ECR, CloudWatch, Secrets Manager — all in Terraform

## Contents

- [User flow](#user-flow)
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

1. Open the app and choose **Practice problem** or **Blank workspace**.
2. Practice problem lists three original problems (statement, examples, Python starter code);
   Blank workspace opens an empty editor.
3. Creating either produces a room at `/rooms/<22-char random id>` (128 bits of randomness,
   URL-safe base64). The header shows the link with a copy button.
4. Anyone with the link joins the same document. Edits are merged by Yjs (a CRDT) and each
   participant's caret and selection are shown with their name and colour.
5. Refreshing or reconnecting restores the latest document, the selected problem and the code
   from PostgreSQL. Edits made while offline are merged on reconnect.

The three problems are `Office Hours Queue` (easy), `Duck Pond Census` (medium) and
`Commit Message Linter` (easy); see [`backend/internal/problems/problems.go`](backend/internal/problems/problems.go).

## Architecture

```
 Browser A ─┐   HTTPS/WSS    ┌──────────────┐   /            ┌───────────────────┐
            ├───────────────▶│     ALB      │───────────────▶│ Next.js (Fargate) │
 Browser B ─┘                │ (one origin) │   /api/* /ws/* │                   │
                             └──────────────┘───────────────▶│ Go backend        │──▶ RDS PostgreSQL
                                                             │ (Fargate, 1 task) │
                                                             └───────────────────┘
```

**Client.** Each room page holds a `Y.Doc` with a single `Y.Text` named `content`.
`y-websocket` connects to `/ws/rooms/<id>` on the backend, `y-codemirror.next` binds the text to
CodeMirror and renders remote cursors from the awareness protocol. Cross-tab BroadcastChannel
sync is disabled so every update really goes through the server.

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
| `rooms`          | id, mode (`practice`/`blank`), `problem_id`, language, timestamps            |
| `room_updates`   | append-only Yjs updates (`seq BIGSERIAL`, `room_id`, `data BYTEA`)           |
| `room_snapshots` | compacted state per room; covers all updates with `seq <= snapshot.seq`      |

## Repository layout

```
backend/                 Go service
  cmd/server/            entrypoint (serve, migrate, migrate-down, migrate-version)
  internal/config        env configuration
  internal/db            pgx pool + golang-migrate with embedded SQL
  internal/hub           WebSocket relay, room state, compaction
  internal/problems      the three practice problems
  internal/server        HTTP API, health checks, CORS, logging
  internal/store         PostgreSQL persistence
  internal/yproto        lib0 / y-protocols codec + seed update
frontend/                Next.js app
  src/app                routes: /, /rooms/[id], /health
  src/components         ModeChooser, RoomView, CollabEditor
  src/lib                API client, participant identity
  e2e/                   Playwright two-browser-session tests
infra/terraform/         AWS infrastructure
infra/scripts/           deploy.sh / deploy.ps1 / destroy.sh
docker-compose.yml       local stack (+ `test` profile for Go integration tests)
```

## Local development

Prerequisites: Docker Desktop (or Docker Engine + Compose v2). Node 20+ only if you want to run
the frontend outside Docker or run the frontend tests.

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

Frontend hot-reload against the Dockerised backend:

```bash
docker compose up -d postgres backend
cd frontend && npm install && BACKEND_PUBLIC_URL=http://localhost:8080 npm run dev
```

Logs: `docker compose logs -f backend` (set `LOG_LEVEL=debug` in `docker-compose.yml` to see
per-room replay/snapshot events). Stop and remove everything, including the database volume:
`docker compose down -v`.

## Tests

**Backend (Go).** Unit tests for the protocol codec and integration tests for room creation,
the update log, snapshot compaction, WebSocket relay/replay, awareness removal, and persistence
across a backend restart. Integration tests need PostgreSQL and are skipped unless
`TEST_DATABASE_URL` is set. The compose `test` profile provides everything:

```bash
docker compose --profile test run --rm backend-test
# or, with Go installed locally:
cd backend && TEST_DATABASE_URL=postgres://duck:duck@localhost:5432/duckduckcode_test?sslmode=disable go test ./...
```

**Frontend unit tests (Vitest).**

```bash
cd frontend && npm install && npm test
```

**End-to-end (Playwright).** Two isolated browser contexts (separate storage = two sessions)
share a room: simultaneous edits at both ends of the file converge and each side renders the
other's named caret; one side goes offline, both keep editing, it reconnects and both converge;
a hard refresh restores problem + code; a blank room persists after its author leaves; unknown
rooms show a not-found page. Runs against a running stack:

```bash
docker compose up -d --build
cd frontend && npx playwright install chromium && npm run e2e
# against a deployment:
E2E_BASE_URL=https://code.example.edu npm run e2e
```

Also useful: `npm run typecheck` and `npm run lint` in `frontend/`.

## Configuration

### Backend (`backend/`)

| variable               | default   | description                                                                 |
| ---------------------- | --------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`         | required  | PostgreSQL URL, e.g. `postgres://user:pass@host:5432/db?sslmode=require`   |
| `PORT` / `ADDR`        | `8080` / `:$PORT` | listen address                                                      |
| `MIGRATE_ON_START`     | `true`    | apply embedded migrations before serving                                   |
| `CORS_ALLOWED_ORIGINS` | empty     | comma-separated browser origins allowed for the API and WebSocket upgrades. Empty = same-origin only (production) |
| `SNAPSHOT_EVERY`       | `200`     | updates per room before a snapshot is requested (min 10)                   |
| `LOG_FORMAT`           | `text`    | `text` or `json`                                                            |
| `LOG_LEVEL`            | `info`    | `debug`, `info`, `warn`, `error`                                            |

### Frontend (`frontend/`)

| variable             | default | description                                                                                    |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `BACKEND_PUBLIC_URL` | empty   | URL the **browser** uses for the backend. Empty = same origin (the ALB routes `/api` and `/ws`). Read at request time, so one image serves every environment. |
| `PORT` / `HOSTNAME`  | `3000` / `0.0.0.0` | Next.js standalone server                                                          |

## HTTP / WebSocket API

| method | path                     | description                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------ |
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
coordination. The frontend is stateless and can be scaled by raising `frontend_desired_count`.

## Limitations and next steps

- One file per room, Python only, no code execution or grading (by design for this version).
- A room link is the only access control; anyone with it can edit. Rooms never expire.
- The server persists a full-state update on every reconnect (it cannot compute a state-vector
  diff without a Yjs implementation). Compaction bounds the growth, but a Go Yjs port or a
  sidecar running Yjs would make this tighter.
- Multi-instance backend (see above), rate limiting, and read-only spectator mode are natural
  next steps.

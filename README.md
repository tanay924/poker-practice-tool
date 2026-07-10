# Local Poker Trainer

A heads-up NLHE trainer for study.

The MVP lets you drill bundled 100bb HU preflop ranges, play simplified 100bb SB-vs-BB hands from preflop through postflop, save completed hands when signed in, submit background Shark analysis jobs, keep playing while jobs run, and review private answer sheets later.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: FastAPI, Python, SQLite
- Auth: Supabase Auth JWTs
- Background jobs: local worker loop by default, with a standalone worker entry point for deployment
- Solver: Shark v2.6.0 local worker for accurate postflop analysis

## Local Setup

Clone this repository and run commands from the repository root unless a section says otherwise:

```powershell
git clone <repo-url>
cd poker-practice-tool
```

## Run Backend

```powershell
cd backend
python -m pip install -r requirements.txt
$env:SUPABASE_PROJECT_URL='https://your-project.supabase.co'
$env:POKER_TRAINER_SHARK_PATH=(Resolve-Path ..\vendor\shark-2.0\build\shark_worker.exe).Path
$env:POKER_TRAINER_SHARK_TIMEOUT_SECONDS='900'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The backend creates `backend/data/poker_trainer.sqlite3` on first startup and seeds:

- one sample preflop range
- one completed sample hand

For a managed deployment, run migrations as a release step and set
`POKER_TRAINER_SCHEMA_MANAGED=1` so API startup does not mutate the schema:

```powershell
python -m alembic upgrade head
python -m alembic check
```

SQLite remains the default for local convenience; production should use a
PostgreSQL `POKER_TRAINER_DB_URL` and a dedicated migration job.

Example PostgreSQL URL:

```text
postgresql+psycopg://trainer_user:password@db.example.com:5432/poker_trainer
```

For a separate API and worker process, disable the API's local worker and start
the worker from a second terminal:

```powershell
# API terminal
$env:POKER_TRAINER_WORKER_AUTOSTART='0'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Worker terminal
python -m app.worker
```

Both processes must use the same `POKER_TRAINER_DB_URL` and solver settings.

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/health -UseBasicParsing
```

## Supabase Auth

Guests can use `/play`, `/preflop`, and `/ranges`. Saving hands, creating analysis jobs, and viewing answer sheets require a signed-in Supabase user.

Frontend:

```powershell
cd frontend
$env:VITE_SUPABASE_URL='https://your-project.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='your-supabase-publishable-key'
npm run dev
```

Backend:

```powershell
cd backend
$env:SUPABASE_PROJECT_URL='https://your-project.supabase.co'
$env:SUPABASE_JWT_AUDIENCE='authenticated'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Supabase should have email/password auth enabled with email confirmation on. Add these redirect URLs in Supabase for local development:

- `http://127.0.0.1:5173/auth/callback`
- `http://localhost:5173/auth/callback`

Range imports are admin-only. Set a comma-separated list of Supabase user ids for admins:

```powershell
$env:POKER_TRAINER_ADMIN_USER_IDS='supabase-user-id-1,supabase-user-id-2'
```

## Shark Solver

Shark is the only postflop solver path. Build `shark_worker.exe`, point the backend at it, and run Uvicorn without reload:

```powershell
cd backend
$env:POKER_TRAINER_SHARK_PATH=(Resolve-Path ..\vendor\shark-2.0\build\shark_worker.exe).Path
$env:POKER_TRAINER_SHARK_TIMEOUT_SECONDS='900'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On Windows, do not run with `uvicorn --reload` for Shark analysis. The reload event loop can block Python subprocess support, which Shark needs for the resident worker process.

Shark uses the documented defaults unless overridden:

- `POKER_TRAINER_SHARK_ITERATIONS=100`
- `POKER_TRAINER_SHARK_MIN_EXPLOITABILITY_PCT=0.1`
- `POKER_TRAINER_SHARK_ALL_IN_THRESHOLD=0.67`
- `POKER_TRAINER_SHARK_THREAD_COUNT=<cpu cores - 1>`
- `POKER_TRAINER_SHARK_FORCE_DONK_CHECK=true`
- `POKER_TRAINER_SHARK_POSTFLOP_RAISES_ENABLED=false`
- `POKER_TRAINER_SHARK_MINIMUM_BET_BB=1`

Missing worker setup, incompatible worker version, missing ranges, unsupported lines, and worker failures produce `unsupported` or `failed` analysis jobs.

## Build Shark Worker

The managed setup script clones the official `24parida/shark-2.0` release, checks that the latest release is still the pinned tag, patches weighted preflop range parsing, adds a headless `shark_worker` target, and builds it with MSYS2/MinGW:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup_shark_worker.ps1 -InstallMsys2
```

To prepare the source without building:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup_shark_worker.ps1 -NoBuild
```

## Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

If the backend is on a different URL:

```powershell
$env:VITE_API_URL='http://127.0.0.1:8000'
npm run dev
```

## Pages

- `/play`: play a simplified HU hand from a Random/SB/BB seat mode. Guests can play without saving; signed-in users can save and request analysis.
- `/preflop`: practice bundled 100bb HU opening ranges through the available 3-bet decision tree.
- `/analysis`: list the signed-in user's queued, solving, ready, failed, and unsupported jobs.
- `/analysis/:handId`: view a private Shark answer sheet and bundled preflop feedback.
- `/ranges`: inspect the five bundled 100bb HU preflop ranges as color-coded 13x13 range tables.

## Range JSON Format

```json
{
  "name": "HU 100bb SB open",
  "spot": "HU_SB_OPEN_100BB",
  "stack_bb": 100,
  "actions": {
    "AA": { "raise": 1.0 },
    "KQo": { "raise": 0.75, "fold": 0.25 },
    "72o": { "fold": 1.0 }
  }
}
```

Each hand's action frequencies must sum to `1.0`.

Legacy scripted SRP hands without bundled preflop metadata require these imported 100bb ranges:

- `HU_SRP_SB_OPEN_100BB`: SB opening range using `raise` frequencies.
- `HU_SRP_BB_CALL_VS_SB_OPEN_100BB`: BB continuing range using `call` frequencies.

Integrated `/play` hands use the five bundled 100bb HU JSON ranges directly. Weighted actions are preserved when converted to Shark tokens. For example, `KQo` with `{ "call": 0.5, "fold": 0.5 }` becomes `KQo:0.5`.

## Tests And Builds

Backend:

```powershell
cd backend
python -m pytest
```

Frontend:

```powershell
cd frontend
npm run test:poker
npm run test:preflop
npm run test:cards
npm run test:play-page
npm run build
```

Operational checks and local SQLite backup/restore helpers are documented in
[`docs/operations.md`](docs/operations.md).

# Local Poker Trainer

A local-only heads-up NLHE trainer for offline study.

The MVP lets you drill bundled 100bb HU preflop ranges, play simplified 100bb SB-vs-BB single-raised pots, save completed hands, submit background analysis jobs, keep playing while jobs run, and review answer sheets later.

## Safety Boundary

This app is only for offline study:

- It does not connect to poker clients.
- It does not provide real-time assistance for live or online games.
- It does not scrape solver sites.
- Preflop ranges are imported from user-provided files.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: FastAPI, Python, SQLite
- Background jobs: local worker loop inside the backend process
- Solver: deterministic mock by default, optional Shark v2.6.0 worker mode for accurate local analysis

## Run Backend

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates `backend/data/poker_trainer.sqlite3` on first startup and seeds:

- one sample preflop range
- one completed sample hand
- one ready analysis result

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/health -UseBasicParsing
```

## Solver Modes

The app defaults to the mock solver for development:

```powershell
$env:POKER_TRAINER_SOLVER='mock'
```

Accurate Shark mode is opt-in and never silently falls back to mock:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\backend
$env:POKER_TRAINER_SOLVER='shark'
$env:POKER_TRAINER_SHARK_PATH='C:\path\to\shark_worker.exe'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On Windows, do not run Shark mode with `uvicorn --reload`. The reload event loop can block Python subprocess support, which Shark needs for the resident worker process.

Shark mode uses the documented Shark defaults unless overridden:

- `POKER_TRAINER_SHARK_ITERATIONS=100`
- `POKER_TRAINER_SHARK_MIN_EXPLOITABILITY_PCT=0.1`
- `POKER_TRAINER_SHARK_ALL_IN_THRESHOLD=0.67`
- `POKER_TRAINER_SHARK_THREAD_COUNT=<cpu cores - 1>`
- `POKER_TRAINER_SHARK_FORCE_DONK_CHECK=true`

Missing worker setup, incompatible worker version, missing ranges, unsupported lines, and worker failures produce `unsupported` or `failed` analysis jobs. They do not swap to mock.

## Build Shark Worker

The managed setup script clones the official `24parida/shark-2.0` release, checks that the latest release is still the pinned tag, patches weighted preflop range parsing, adds a headless `shark_worker` target, and builds it with MSYS2/MinGW:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool
powershell -ExecutionPolicy Bypass -File .\tools\setup_shark_worker.ps1 -InstallMsys2
```

To prepare the source without building:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup_shark_worker.ps1 -NoBuild
```

## Run Frontend

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\frontend
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

- `/play`: play a simplified HU hand, save it, and request analysis.
- `/preflop`: practice bundled 100bb HU opening ranges through the available 3-bet decision tree.
- `/analysis`: list queued, solving, ready, failed, and unsupported jobs.
- `/analysis/:handId`: view the mock-solver answer sheet.
- `/ranges`: import and inspect JSON preflop ranges.

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

Shark mode currently supports the MVP spot only and requires these imported 100bb ranges:

- `HU_SRP_SB_OPEN_100BB`: SB opening range using `raise` frequencies.
- `HU_SRP_BB_CALL_VS_SB_OPEN_100BB`: BB continuing range using `call` frequencies.

Weighted actions are preserved when converted to Shark tokens. For example, `KQo` with `{ "call": 0.5, "fold": 0.5 }` becomes `KQo:0.5`.

## Tests And Builds

Backend:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\backend
python -m pytest
```

Frontend:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\frontend
npm run test:preflop
npm run build
```

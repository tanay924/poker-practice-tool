# Local Poker Trainer Design

## Goal

Build a local-only heads-up No-Limit Hold'em trainer for offline study. The MVP lets the user play simplified 100bb SB-vs-BB single-raised pots, save completed hands, submit asynchronous mock-solver analysis jobs, keep playing while jobs run, and review answer sheets later.

## Non-Goals And Safety Boundaries

- Do not connect to poker clients.
- Do not provide live or online real-time assistance.
- Do not scrape paid or protected solver sites.
- Do not require Shark 2.0 for the MVP.
- Do not add accounts, cloud sync, payments, or multiplayer.

## Architecture

The repo uses two local apps:

- `backend/`: FastAPI, SQLite, SQLAlchemy, Pydantic, pytest.
- `frontend/`: React, Vite, TypeScript, React Router.

The backend owns persistence, analysis jobs, solver adapters, range validation, solver caching, and seed data. The frontend owns the playable trainer state machine, UI pages, polling, and file upload/import experience. The API contract is explicit Pydantic models on the backend plus matching TypeScript interfaces on the frontend.

## Trainer Flow

For v1, the hero is always the SB opener. Preflop is scripted:

1. SB opens to 2.5bb.
2. BB calls.
3. The postflop hand starts with a random flop, 100bb effective starting stacks, and no duplicate cards.

The app deals hero cards, villain cards, and the full board up front. The UI reveals streets as the hand advances. Villain uses a simple random policy. Hero actions are limited to solver-compatible buttons:

- Flop: `check`, `bet_50`, `bet_100`, `call`, `fold`, `raise_100`.
- Turn/River: `check`, `bet_33`, `bet_66`, `bet_100`, `call`, `fold`, `raise_50`, `raise_100`.

When a hand ends, the frontend saves it through `POST /api/hands`. The saved hand shows an `Analyze hand` button and any existing job status. Starting a new hand does not wait for analysis completion.

## Data Model

SQLite tables:

- `hands`: completed hand state, cards, board, stacks, pot, action history, result.
- `analysis_jobs`: one job per hand, queued/solving/ready/failed/unsupported lifecycle, timestamps, solver input/output.
- `preflop_ranges`: imported user range files.
- `solver_cache`: deterministic cache keys for solver input/output reuse.

JSON columns store structured board, action history, hand result, solver input, solver output, and imported ranges.

## API

- `POST /api/hands`: save a completed hand.
- `GET /api/hands`: list recent hands.
- `GET /api/hands/{hand_id}`: fetch one hand.
- `POST /api/hands/{hand_id}/analyze`: create or return the existing analysis job for a hand.
- `GET /api/analysis`: list analysis jobs with hand summaries.
- `GET /api/analysis/{hand_id}`: fetch one hand and its detailed analysis.
- `POST /api/ranges/import`: import a JSON preflop range.
- `GET /api/ranges`: list imported ranges.

Duplicate analyze requests are idempotent. The first request creates a queued job; later requests return the existing job.

## Solver Design

The backend exposes a `SolverAdapter` protocol with a stable input/output schema. `MockSolverAdapter` implements the MVP and returns deterministic realistic-looking strategy frequencies that sum to 1. `SharkCliSolverAdapter` is a skeleton for later CLI integration with a command shape like:

```text
shark-cli solve input.json --output output.json
```

The solver layer is isolated from routes and database models so Shark can replace the mock without rewriting the API.

## Analysis Job Flow

1. User clicks `Analyze hand`.
2. Backend creates an `analysis_jobs` row with `queued` status, unless one already exists.
3. A local worker loop claims the oldest queued job.
4. Worker marks it `solving`.
5. Worker builds solver input from the saved hand.
6. Worker computes a deterministic cache key.
7. Worker reuses cached output when available.
8. Otherwise it calls `MockSolverAdapter`.
9. Worker saves solver output and cache entry.
10. Worker marks the job `ready`.
11. Worker marks unsupported/failed cases with an error message.

## Frontend Pages

- `/play`: table state, hero cards, board, pot, stacks, legal actions, action history, saved-hand analysis status, and analyze/new-hand controls.
- `/analysis`: analysis job list with hand id, date, hero hand, board, and status. It refreshes automatically.
- `/analysis/:handId`: full hand history, a v1 preflop feedback section that explains imported ranges are not scored yet, postflop mock-solver decisions, and largest mistake summary.
- `/ranges`: JSON range file import and a readable table of imported ranges.

## Testing

Backend tests cover:

- card generation has no duplicates.
- action history persists and reads back correctly.
- analysis job creation is idempotent.
- mock solver strategy frequencies sum to 1.
- range import validation rejects malformed files.

Frontend verification uses TypeScript build checks.

## Seed Data

Backend startup creates tables and seeds:

- one sample preflop range.
- one completed sample hand.
- one ready sample analysis job.

This makes `/analysis` and `/ranges` useful immediately after local startup.

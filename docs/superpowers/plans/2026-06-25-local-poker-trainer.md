# Local Poker Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-only heads-up poker trainer MVP with FastAPI, SQLite, React/Vite, async mock-solver jobs, range import, and basic tests.

**Architecture:** Use a split repo with `backend/` for FastAPI persistence and analysis jobs, and `frontend/` for the playable trainer UI. Keep poker, solver, analysis, and range-import code in focused modules so Shark CLI can be added later without route rewrites.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, SQLite, pytest, React, Vite, TypeScript, React Router.

---

### Task 1: Backend Test Skeleton

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/pytest.ini`
- Create: `backend/tests/test_cards.py`
- Create: `backend/tests/test_hands.py`
- Create: `backend/tests/test_analysis_jobs.py`
- Create: `backend/tests/test_solver.py`
- Create: `backend/tests/test_ranges.py`

- [ ] **Step 1: Add backend dependencies**

Use `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `pytest`, and `httpx`.

- [ ] **Step 2: Write failing tests**

Tests should import expected modules from `app.poker.cards`, `app.models`, `app.analysis.service`, `app.solver.adapters`, and `app.ranges.parser`. The first run should fail because these modules do not exist yet.

- [ ] **Step 3: Run red tests**

Run: `python -m pytest`

Expected: import failures for missing backend modules.

### Task 2: Backend Core And Persistence

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/app/schemas.py`
- Create: `backend/app/poker/cards.py`

- [ ] **Step 1: Implement database setup**

Create a SQLAlchemy engine from `POKER_TRAINER_DB_URL`, defaulting to `sqlite:///./data/poker_trainer.sqlite3`, with `SessionLocal`, `Base`, and `init_db()`.

- [ ] **Step 2: Implement ORM models**

Create `Hand`, `AnalysisJob`, `PreflopRange`, and `SolverCache` models with the fields listed in the design.

- [ ] **Step 3: Implement card helpers**

Expose `build_deck()` and `deal_random_hand(seed: int | None = None)` returning hero cards, villain cards, and board with no duplicates.

- [ ] **Step 4: Run card and persistence tests**

Run: `python -m pytest backend/tests/test_cards.py backend/tests/test_hands.py`

Expected: both files pass.

### Task 3: Solver, Ranges, And Analysis Services

**Files:**
- Create: `backend/app/solver/adapters.py`
- Create: `backend/app/ranges/parser.py`
- Create: `backend/app/analysis/service.py`

- [ ] **Step 1: Implement `SolverAdapter` and `MockSolverAdapter`**

Mock output includes `street_results` and `summary`. Strategy frequencies must sum to 1 for each result.

- [ ] **Step 2: Implement `SharkCliSolverAdapter` skeleton**

Expose the adapter and raise a clear `NotImplementedError` until the Shark CLI contract is finalized.

- [ ] **Step 3: Implement range parser**

Validate name, spot, stack, and actions. Reject action maps whose frequencies are negative or do not sum to 1.

- [ ] **Step 4: Implement analysis job service**

Create idempotent job creation, solver input building, cache key generation, and queued-job processing.

- [ ] **Step 5: Run service tests**

Run: `python -m pytest backend/tests/test_analysis_jobs.py backend/tests/test_solver.py backend/tests/test_ranges.py`

Expected: all service tests pass.

### Task 4: Backend API And Worker

**Files:**
- Create: `backend/app/api/hands.py`
- Create: `backend/app/api/analysis.py`
- Create: `backend/app/api/ranges.py`
- Create: `backend/app/seed.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Implement API routes**

Implement hand save/list/detail, analyze, analysis list/detail, range import, and range list routes under `/api`.

- [ ] **Step 2: Implement local worker loop**

Start a background loop on FastAPI startup unless `POKER_TRAINER_WORKER_AUTOSTART=0`.

- [ ] **Step 3: Implement seed data**

Seed one range, one sample hand, and one ready analysis if the tables are empty.

- [ ] **Step 4: Run backend tests**

Run: `python -m pytest`

Expected: all backend tests pass.

### Task 5: Frontend App

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/poker/engine.ts`
- Create: `frontend/src/pages/PlayPage.tsx`
- Create: `frontend/src/pages/AnalysisPage.tsx`
- Create: `frontend/src/pages/AnalysisDetailPage.tsx`
- Create: `frontend/src/pages/RangesPage.tsx`
- Create: `frontend/src/styles/app.css`

- [ ] **Step 1: Implement API client and types**

Mirror backend response shapes and set API base URL from `VITE_API_URL` with default `http://127.0.0.1:8000`.

- [ ] **Step 2: Implement trainer engine**

Deal cards without duplicates, script preflop, restrict legal hero actions by street/context, advance streets, apply a simple random villain policy, and produce a completed hand payload.

- [ ] **Step 3: Implement pages**

Create `/play`, `/analysis`, `/analysis/:handId`, and `/ranges` with polling where required.

- [ ] **Step 4: Run frontend build**

Run: `npm install`, then `npm run build`.

Expected: TypeScript and Vite build succeed.

### Task 6: Documentation And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document setup**

Include backend setup, frontend setup, local URLs, and offline-only safety note.

- [ ] **Step 2: Run full verification**

Run backend tests and frontend build.

- [ ] **Step 3: Commit**

Commit the completed app to `codex/local-poker-trainer` with a clear message.

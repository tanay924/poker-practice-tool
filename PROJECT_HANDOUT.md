# Local Poker Trainer — Complete Project Handoff

Last updated: 2026-07-10

## How to use this handout

This is the current project context for a new Codex/ChatGPT chat.

The chat must also be given access to the repository itself:

```text
C:\Users\tanay\Documents\Playground\poker-practice-tool
```

This file explains the project, but it cannot grant filesystem access on its own. The new chat should open the repository, read this file, inspect the relevant source files, and then work directly in the existing checkout.

## Operating instructions for the next chat

- This is the user's own project. Work directly in the existing checkout; do not create branches or pull requests unless explicitly requested.
- Preserve existing user changes, unrelated edits, and untracked files. Never use `git reset --hard` or `git checkout --` to discard work.
- The working tree is intentionally not clean. Inspect `git status` and `git diff` before editing.
- The root `package-lock.json` is an unrelated untracked file and should be left alone unless the user explicitly asks about it.
- Do not read, print, commit, or expose secrets from `.env.local`, Supabase credentials, JWTs, or tokens.
- Make changes with `apply_patch`.
- Test changes proportionally, preferably with a targeted test first and then the relevant full suite/build.
- The user values careful, durable work over a fast answer. Do not claim something works without testing it.
- Keep UX beginner-friendly, clear, trustworthy, and accessible without adding unnecessary explanation to the interface.

## Repository and current Git state

Repository:

```text
C:\Users\tanay\Documents\Playground\poker-practice-tool
```

Current branch:

```text
codex/local-poker-trainer
```

Remote:

```text
origin https://github.com/tanay924/poker-practice-tool.git
```

Latest committed feature commit:

```text
a792fe2 Add theme customization and beginner UX polish
```

Important: the current checkout contains additional uncommitted work after that commit. It includes UX changes, solver queue safety changes, the seeding tools, and related tests. Do not discard it.

Tracked files currently modified include:

- `backend/app/analysis/service.py`
- `backend/tests/test_analysis_jobs.py`
- `frontend/package.json`
- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/pages/AnalysisDetailPage.tsx`
- `frontend/src/pages/PreflopPracticePage.tsx`
- `frontend/src/pages/beginnerUx.test.ts`
- `frontend/src/pages/beginnerUx.ts`
- `frontend/src/styles/app.css`
- `frontend/src/styles/tableLayout.test.ts`

Untracked project files that belong to the current work include:

- `frontend/src/pages/preflopSessionReview.test.ts`
- `frontend/src/pages/preflopSessionReview.ts`
- `tools/generate_seed_hands.ts`
- `tools/seed_study_bank.py`

The root `package-lock.json` is also untracked and should be preserved as an unrelated file.

## Product overview

This is a heads-up no-limit hold'em study tool for simplified 100bb SB-vs-BB practice.

The product currently includes:

- `/play`: play a hand from preflop through postflop.
- `/preflop`: drill bundled HU preflop ranges.
- `/analysis`: private hand library and analysis-job list.
- `/analysis/:handId`: private answer sheet with solver feedback.
- `/ranges`: bundled 100bb HU range charts.
- `/customize`: local theme customization.
- `/friends`: friends, friend requests, and notifications.
- `/shared`: hands shared with the signed-in user.
- `/stats`: personal study statistics and leak summaries.
- `/`: public landing page.
- `/methodology`, `/support`, `/status`, `/privacy`, `/terms`, `/accessibility`: public explanation, operational, and support surfaces.
- `/settings`: account export and local-data deletion.
- Supabase authentication and username profiles.
- Server-issued, expiring guest sessions in an HttpOnly cookie, with a local legacy-header fallback only in local environments.
- Server-enforced guest analysis/preflop allowances, plus local responsive trial copy.
- Background Shark analysis jobs.
- Idempotent hand saves, queue leases/heartbeats/reaping, cancel requests, retry, and admin analysis pause/resume.
- Cursor-paginated analysis library, request IDs, security headers, and API request timeouts.
- Idempotent decision facts for scalable stats with sample-size honesty.
- Social remove/revoke, block, report, and admin report visibility.
- A global anonymized StudySpot bank used by “Study hands like this”, with visibility/provenance/quality fields and a private-mode switch.

The main product goal is trustworthy poker practice: the hand engine, settlement, action history, solver feedback, visibility rules, and answer sheets should agree with one another.

## Technology stack

- Frontend: React, TypeScript, Vite, React Router.
- Backend: FastAPI, Python, SQLAlchemy, SQLite for local/MVP use.
- Authentication: Supabase Auth JWTs.
- Queue: database-backed queue processed by an async worker loop inside the backend process by default; `python -m app.worker` supports a separate worker process.
- Postflop solver: local Shark v2.6.0 worker executable, controlled through a resident JSON-lines subprocess.
- Preflop ranges: bundled JSON range charts under `frontend/src/preflop/ranges`.

## Frontend architecture

Important entry points:

- `frontend/src/main.tsx`: React root, router, and global providers.
- `frontend/src/App.tsx`: application shell, navigation, and route definitions.
- `frontend/src/api.ts`: typed HTTP API client and auth/guest headers.
- `frontend/src/types.ts`: shared API/domain types.
- `frontend/src/styles/app.css`: global layout, themes, responsive behavior, and table styling.

Poker logic:

- `frontend/src/poker/engine.ts`: simplified HU hand engine, legal actions, automatic opponent actions, action history, and hand payload creation.
- `frontend/src/poker/handEvaluator.ts`: hold'em showdown evaluation.
- `frontend/src/poker/settlement.ts`: settlement and result presentation helpers.
- `frontend/src/poker/visibility.ts`: determines which board cards should be visible for a history state.
- `frontend/src/preflop/engine.ts`: preflop practice engine and action sampling.
- `frontend/src/preflop/rangeData.ts`: range spot definitions and action maps.
- `frontend/src/preflop/ranges/*.json`: bundled range data.
- `frontend/src/preflop/historyDisplay.ts`: preflop history/review display.
- `frontend/src/pages/preflopSessionReview.ts`: preflop session review logic.

Theme system:

- `frontend/src/theme/customization.ts`: theme choices and local-storage behavior.
- `frontend/src/pages/CustomizePage.tsx`: customization UI.
- Theme selections are stored locally under `poker-trainer-theme-selection`.
- CSS attributes are applied to `document.documentElement` as `data-app-theme`, `data-table-theme`, and `data-card-theme`.

Current UX direction:

- Use beginner-friendly navigation labels such as “Play hand”, “Preflop drill”, “Hand library”, and “Range charts”.
- Prefer clear next actions and useful empty states.
- Keep the poker table usable on mobile.
- Preserve answer-sheet trust: never reveal hidden cards or future board cards prematurely.

## Backend architecture

Entry point:

- `backend/app/main.py`: loads local environment variables, initializes the database, seeds sample data, starts the worker loop, and registers API routers.

API modules:

- `backend/app/api/hands.py`: strict hand validation, ownership-filtered hand listing, idempotent hand creation, deletion, and analysis-job creation.
- `backend/app/api/analysis.py`: analysis list and private answer-sheet detail.
- `backend/app/api/account.py`: account export and local/external deletion workflow.
- `backend/app/api/admin.py`: analysis admission control and report visibility.
- `backend/app/api/guest_sessions.py`: server-issued guest cookies and trial allowances.
- `backend/app/api/ranges.py`: range listing and admin-only range import.
- `backend/app/api/social.py`: profiles, friends, friend requests, sharing, notifications, blocks, reports, and revocation.
- `backend/app/api/stats.py`: personal statistics and recommendations.
- `backend/app/api/study_spots.py`: global anonymized similar-study-spot endpoint.

Core backend modules:

- `backend/app/models.py`: SQLAlchemy models.
- `backend/app/schemas.py`: Pydantic request/response schemas.
- `backend/app/db.py`: SQLite engine/session setup and lightweight schema/index initialization.
- `backend/app/auth.py`: Supabase JWT verification, authenticated actors, and guest-session validation.
- `backend/app/guest_sessions.py`: token hashing, expiry, secure-cookie policy, and server-owned session lookup.
- `backend/app/decision_facts.py`: idempotent normalized decision extraction for stats.
- `backend/app/analysis/service.py`: queue creation, solver-input preparation, cache lookup, solver execution, result persistence, and job status handling.
- `backend/app/analysis/decision_details.py`: derived decision details such as pot odds/equity presentation.
- `backend/app/preflop/analysis.py`: preflop scoring and integrated postflop branch derivation.
- `backend/app/ranges/resolver.py`: imported-range resolution for legacy/scripted hands.
- `backend/app/study_spots.py`: StudySpot extraction, tagging, anonymized similarity scoring, and response conversion.
- `backend/alembic/`: controlled migration entry point and initial schema baseline.

## Database model and storage boundaries

The local database is:

```text
backend/data/poker_trainer.sqlite3
```

Main models in `backend/app/models.py`:

- `Hand`: hero/villain positions, both hole-card strings, board, stack/pot state, action history, and hand result.
- `AnalysisJob`: queue status, timestamps, ownership/session information, errors, and solver output.
- `PreflopRange`: imported or seeded range charts.
- `SolverCache`: solver input/output cache used for efficiency.
- `UserProfile`: usernames and profile timestamps.
- `FriendRequest`, `Friendship`, `SharedHand`: social features.
- `StudySpot`: compact global-study entries derived from ready solver output.

Storage/privacy rule:

- A hand should contain only the information needed to describe the hand and its result.
- A ready analysis needs the solver result because the answer sheet and StudySpot bank use it.
- Queue status, timestamps, retry counters, and worker ids are operational state needed to run/retry jobs.
- Solver cache data is an explicit efficiency exception.
- StudySpot API responses must not expose user ids, usernames, source hand ids, source job ids, or internal database ids.
- Synthetic seed records are isolated with `guest_session_id` values beginning `study-bank-seed-v1-`; they are not user-owned library records.
- The synthetic seeding run was compacted after completion: temporary seed markers were removed, synthetic duplicated solver inputs were cleared, and synthetic-only cache rows were removed. Existing normal cache rows were retained for efficiency.

## Authentication and ownership

Supabase is client-side auth with backend JWT verification.

- Signed-in requests use `Authorization: Bearer <token>`.
- Normal guest requests use the server-issued `poker_trainer_guest` HttpOnly cookie. The legacy `X-Guest-Session` header is accepted only in local/development/test environments unless explicitly enabled.
- Guest cookies contain opaque random secrets; the database stores only their digest, expiry, and allowance counters.
- A signed-in user sees only records owned by their `user_id`.
- A guest sees only records owned by their guest session.
- Shared-hand access is separately checked for the recipient.
- Do not weaken ownership checks while changing the global StudySpot bank.

Guest product behavior:

- Guests can use the public practice surfaces and create limited session-owned records.
- Frontend guest trial copy is implemented in `frontend/src/guestTrial.ts`, but analysis and preflop allowance enforcement is server-authoritative.
- The current limit is five analysis trials and five preflop practice trials per server guest session.

## Analysis and solver pipeline

Normal flow:

1. Frontend plays a hand using the local engine.
2. `toHandPayload` creates the hand payload.
3. Frontend saves the hand through `POST /api/hands`.
4. Frontend requests `POST /api/hands/{hand_id}/analyze`.
5. Backend creates a queued `AnalysisJob`.
6. The worker claims the oldest queued job.
7. `prepare_solver_input` combines hand data with preflop analysis and the relevant postflop branch/ranges.
8. A cache lookup is attempted.
9. If needed, the Shark worker solves the hand.
10. The output is merged with preflop feedback and decision details.
11. The job becomes `ready`, StudySpots and normalized DecisionFacts are extracted idempotently.
12. The answer sheet reads the ready solver output.

Supported integrated branches currently include:

- `srp_open_call`: SB raises 2.5bb and BB calls; starting pot 5bb.
- `three_bet_call`: SB open, BB 3-bet, SB calls; starting pot 23bb.
- `limp_check`: SB limps and BB checks; starting pot 2bb.
- `limp_raise_call`: SB limps, BB raises, SB calls; starting pot 10bb.

The queue is intentionally serialized around the resident Shark adapter. `SharkWorkerSolverAdapter` uses an async lock, and the worker loop processes one job at a time. This is important on the local PC because each distinct Shark tree can consume multiple GB of memory.

The recent queue safety change in `backend/app/analysis/service.py` commits the job state before awaiting a long solve, then re-fetches the job/hand after solving. This prevents a long solver call from holding an SQLite transaction open. The seeder also passes an explicit `job_ids` set so it cannot claim ordinary user jobs.

Queue claims have leases and heartbeats. A worker crash leaves a solving job recoverable: the reaper returns expired leases to `queued`. A cancellation request during a solve is recorded and the worker discards the result before marking the job `cancelled`.

## Shark configuration

Configuration is loaded from environment variables, `.env.local`, and `.env.example` conventions.

Important variables:

```text
POKER_TRAINER_SHARK_PATH
POKER_TRAINER_SHARK_VERSION
POKER_TRAINER_SHARK_COMMIT
POKER_TRAINER_SHARK_ITERATIONS
POKER_TRAINER_SHARK_MIN_EXPLOITABILITY_PCT
POKER_TRAINER_SHARK_ALL_IN_THRESHOLD
POKER_TRAINER_SHARK_THREAD_COUNT
POKER_TRAINER_SHARK_FORCE_DONK_CHECK
POKER_TRAINER_SHARK_POSTFLOP_RAISES_ENABLED
POKER_TRAINER_SHARK_MINIMUM_BET_BB
POKER_TRAINER_SHARK_TIMEOUT_SECONDS
POKER_TRAINER_WORKER_AUTOSTART
```

Normal documented defaults are:

- Shark iterations: 100.
- Minimum exploitability: 0.1%.
- All-in threshold: 0.67.
- Thread count: CPU count minus one if not explicitly set.
- Force donk check: true.
- Postflop raises: false.
- Minimum bet: 1bb.

On Windows, run Uvicorn without `--reload` when Shark analysis is enabled. The reload event loop can prevent reliable Shark subprocess startup.

Worker source/setup:

- `tools/shark_worker/shark_worker.cpp`: headless JSON-lines Shark worker source.
- `tools/setup_shark_worker.ps1`: managed setup/build script.
- `vendor/shark-2.0`: local vendor/build area when present.

The normal site was restored with worker autostart enabled after seeding. Do not leave `POKER_TRAINER_WORKER_AUTOSTART=0` set for ordinary use.

## Global StudySpot bank

Implementation:

- Model: `backend/app/models.py` → `StudySpot`.
- Extraction/tagging: `backend/app/study_spots.py`.
- API: `backend/app/api/study_spots.py`.
- Frontend client: `frontend/src/api.ts`.
- Frontend display: `frontend/src/pages/AnalysisDetailPage.tsx` and `frontend/src/pages/studySpotViews.ts`.

When a job becomes ready, preflop and postflop decision results are converted into compact StudySpots. Tags can include:

- Street: `preflop`, `flop`, `turn`, `river`.
- Pot type: `single-raised-pot`, `3bet-pot`, `limp-pot`.
- Situation: `first-to-act`, `facing-bet`.
- Hero action and solver best action, such as `hero-check`, `hero-bet-5bb`, `best-check`, `best-bet-2bb`.
- Verdict: `correct`, `zero-percent-action`.
- Board texture: `paired-board`, `monotone-board`, `two-tone-board`, `connected-board`, `ace-high-board`.

Similarity is tag-overlap based and limited to the same street. The endpoint must verify that the source hand is visible to the requester, but the returned similar spots are anonymized.

Current local seed state as of 2026-07-10:

- 127 successful synthetic hands/jobs remain.
- 433 synthetic StudySpots remain.
- 331 of those spots came from the final 100-hand bulk run.
- Final bulk run result: 100/100 ready, 0 unsupported, 0 failed.
- Total StudySpot rows in the local DB: 527, including the pre-existing non-synthetic data.
- Final bulk seeding used 20 Shark iterations and 6 threads to keep memory safe on this PC. Normal user analysis defaults remain separate.

Seeding tools:

- `tools/generate_seed_hands.ts`: deterministic valid-hand generator using the existing frontend engine. It reuses eight board textures, prefers the supported SRP open/call branch, and requires a postflop hero decision.
- `tools/seed_study_bank.py`: resumable manifest/DB seeder. It creates isolated synthetic jobs, processes only its own job ids, reports status/tag/street counts, and supports `--resume`, `--retry-failed`, `--dry-run`, and `--regenerate`.

Do not run a large bulk seed with default 100-iteration unique trees without checking memory first. The local worker cache makes repeated board/branch trees much cheaper, but each distinct tree can still consume several GB.

## Local run commands

From PowerShell:

### Backend

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Expected backend health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

### Frontend

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\frontend
npm install
npm run dev
```

Expected URL:

```text
http://127.0.0.1:5173
```

The frontend defaults to `http://127.0.0.1:8000` unless `VITE_API_URL` is set.

### Shark setup

If the worker executable is not already built:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool
powershell -ExecutionPolicy Bypass -File .\tools\setup_shark_worker.ps1 -InstallMsys2
```

For source preparation without building:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup_shark_worker.ps1 -NoBuild
```

## Test and build commands

### Backend

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\backend
python -m pytest -q
```

Latest result: 87 backend tests passed.

### Frontend

There is no generic `npm test` script. Use the named scripts:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\frontend
npm run build
npm run test:analysis-detail
npm run test:study-pages
npm run test:cards
npm run test:play-page
npm run test:poker
npm run test:preflop
npm run test:table-layout
npm run test:settlement
```

Latest verification: production build passed and all listed frontend suites passed.

Additional useful checks:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool
git diff --check
python -m py_compile tools/seed_study_bank.py
```

## Important current caveats

- SQLite is appropriate for local/MVP use but is not the final public-scale queue/database architecture.
- The worker is one serialized local worker. Parallel solves would multiply memory use and are not currently necessary.
- The global StudySpot feature has active recall reveal cards, but it is not yet a full spaced-repetition scheduler or action-selection attempt ledger.
- Theme preferences are local-only and do not follow an account across devices.
- Production hardening still needs a deliberate pass over managed PostgreSQL/RLS, reviewed explicit migration operations for legacy databases, edge rate limits/CAPTCHA, secrets, backups/restore drills, deployment, monitoring, and independent security review.
- The initial Alembic baseline is intentionally metadata-backed for a fresh database; future production revisions should use reviewed explicit operations.
- Board/action generation and Shark tree compatibility must be tested together. Frontend-legal bet amounts can still produce an unsupported Shark line in edge cases.
- Do not expose the full global source hand/job identity through the StudySpot API.

## Good next work

1. Add explicit action-attempt and spaced-repetition records around the existing active-recall StudySpot cards.
2. Make normal persisted analysis storage stricter if desired: retain the hand, solver result, and required operational state while making any duplicated solver-input snapshot ephemeral unless needed for cache/recovery.
3. Add edge rate limiting/CAPTCHA and a transactional daily usage ledger for hosted deployments.
4. Add account-backed preferences for theme, seat mode, and preferred practice mode.
5. Add worker memory/capacity metrics, queue-age alerts, and an operator drain/retry dashboard.

## Recommended first actions for a new chat

1. Run `git status --short` and inspect the current diff; do not reset anything.
2. Read this file, `README.md`, and the files directly related to the requested change.
3. Check `http://127.0.0.1:8000/api/health` if runtime behavior matters.
4. Run the smallest relevant test before editing when diagnosing a bug.
5. Implement the change in the existing architecture, preserving ownership/privacy checks.
6. Run targeted tests, then the relevant backend/frontend suite and build.
7. Report exactly what changed, what was tested, and any remaining caveat.

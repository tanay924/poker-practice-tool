# Local Poker Trainer

A local-only heads-up NLHE trainer for offline study.

The MVP lets you play simplified 100bb SB-vs-BB single-raised pots, save completed hands, submit background mock-solver analysis jobs, keep playing while jobs run, and review answer sheets later.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: FastAPI, Python, SQLite
- Background jobs: local worker loop inside the backend process
- Solver: mock adapter now, Shark CLI adapter skeleton for later

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

## Tests And Builds

Backend:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\backend
python -m pytest
```

Frontend:

```powershell
cd C:\Users\tanay\Documents\Playground\poker-practice-tool\frontend
npm run build
```

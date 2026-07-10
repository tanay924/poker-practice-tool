# Local Poker Trainer operations runbook

## Health and status

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health/live
Invoke-RestMethod http://127.0.0.1:8000/api/health/ready
Invoke-RestMethod http://127.0.0.1:8000/api/admin/analysis/status
```

The API returns an `X-Request-ID` header on every response. Include that ID in support or debugging notes; never include passwords, JWTs, or the database file.

## Pause expensive analysis

Set `POKER_TRAINER_ANALYSIS_SUBMISSIONS_ENABLED=0` for an environment-wide pause, or use the admin analysis control endpoint with an authenticated admin. Practice and existing answer sheets remain available.

## Separate worker

Run the API with `POKER_TRAINER_WORKER_AUTOSTART=0`, then run `python -m app.worker` from `backend` in a second process. Both processes must use the same database and solver configuration.

## SQLite backup and restore

Stop the API/worker before copying a local database for a simple operational snapshot, or use the SQLite backup API while the application is live:

```powershell
python tools/backup_sqlite.py --output backups\poker-trainer-$(Get-Date -Format yyyyMMdd-HHmmss).sqlite3
python tools/restore_sqlite.py --backup backups\poker-trainer-20260710-120000.sqlite3 --output backend\data\restore-check.sqlite3
```

Never overwrite the active database with a restore in place. Verify a restored copy with `python -m alembic check` and the health endpoints before using it.

Hosted PostgreSQL backups, point-in-time recovery, retention, and restore drills belong to the managed database/deployment environment; these scripts are only for local SQLite convenience.

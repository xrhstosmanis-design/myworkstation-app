# KAT P0 — Server / Render baseline — 2026-08-22

## Status

P0 baseline for the KAT pilot.

- Render service: `myworkstation-app`
- Region: Frankfurt
- Health endpoint: `/api/health`
- Render health check is configured in `render.yaml`.
- Production deploys are triggered from `main`.
- Full GitHub CI now also runs on every push to `main`, in addition to pull requests/manual runs.
- CI includes server tests, client build, Prisma generation/push/seed, real HTTP health startup and the existing KAT payment/shift/permission E2E flows.

## Rollback checkpoint

Known baseline commit immediately after enabling mandatory `main` CI:

`0976599fefffa198b8c2741e8f133cea0bd1a46f`

If a later KAT change breaks production:

1. Stop additional changes.
2. In Render, redeploy the last known healthy commit, or revert the failing Git commit on `main`.
3. Confirm `/api/health` returns HTTP 200 with `{ ok: true }`.
4. Confirm KAT Store Mode opens before continuing tests.
5. Record the new recovery commit in this checkpoint folder.

## KAT rule

Until the pilot, do not combine unrelated large modules with P0 fixes. Every completed P0 fix gets its own commit/checkpoint so it can be reverted independently.

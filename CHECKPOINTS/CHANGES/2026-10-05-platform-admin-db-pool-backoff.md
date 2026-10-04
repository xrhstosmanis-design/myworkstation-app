# 05/10/2026 — Platform Admin DB pool blocker

Production evidence: Platform Admin authentication returned internal error. Render application logs show Prisma userSession.findUnique failing because the PostgreSQL/Prisma connection pool timed out with connection limit 9. The POS invoice durable worker sweep was failing from the same pool exhaustion at the same time.

Bounded mitigation: retain the normal 5-second durable sweep cadence, but after a Prisma connection-pool timeout/P2024 suspend that worker's DB sweeps for 60 seconds. This yields capacity to foreground authentication and normal requests while the database is saturated. No pool-size increase, rollback, auth change, OCR result change, payment change or data mutation.

Requires full CI and exact production readback before blocker PASS.

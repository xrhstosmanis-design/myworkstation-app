# 05/10/2026 — Pending: Render Free instance spin-down

Owner observed the Render production warning that the current Free web-service instance can spin down with inactivity and delay the next request by roughly 50 seconds or more.

Add as production-readiness pending item: upgrade the user-facing MyWorkStation web service to an always-on paid compute instance before broad store rollout, then verify idle/cold-start behavior is gone. This item is independent of GitHub CI runner queueing and independent of Task18 backup.

No Render plan/billing change is performed by this checkpoint.

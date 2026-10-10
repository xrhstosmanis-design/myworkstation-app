# N40 / AI-CC-LIMITS — deployed revision verified, LAB remains OPEN

Observation: 10 October 2026, 14:35:44 Europe/Athens.
Same owner: `codex/n40-full-twin-navigation-audit-20261010`.
Documentation branch: `docs/n40-deployed-readback-20261010`.

## Release evidence

PR #2065 merged at `5dc10820082a570705616f163e8118c7ae4ba2a9` after final-head normal CI38048402182 SUCCESS (head `abfbf0b051395992cdda4ed7dba151f3cc7ee834`). Freshly inspected main CI38048617906 completed SUCCESS through server tests, Work build, Windows/production invariants, isolated PostgreSQL import and real HTTP E2E steps.

Guarded Render deployment38048828414, job114203686437, completed SUCCESS. Existing freshness/CI gates were preserved, the existing hook was pinned to the expected revision, and the normal rollback checkpoint was captured. At `2026-10-10T11:35:44.9138943Z` its actual health readback was:

```json
{"ok":true,"version":"0.22.0+kat-test-pos","revision":"5dc10820082a570705616f163e8118c7ae4ba2a9"}
```

The deployment reported healthy on the expected revision. This establishes a successful deployed release at that observation, not a currently authenticated client revision, six-tile functional acceptance or uninterrupted future availability. Concurrent main changes after this time do not invalidate the historical readback and must not be rolled back.

Previous healthy rollback revision `1069f6cd78c922f90fb33668dbbbe8d2df0850c7`; artifact11667934393. No rollback was executed. Evidence also recorded in PR2065 comment6097114417. This note supersedes only prior final-CI/merge/deployment-pending wording, not any LAB requirement or protected acceptance.

## What is deployed; acceptance limits

Existing canonical POS/Checks, EFTPOS/Cash, finding-dependent Cash, Stock/BackOffice, Workforce and Video routes carry the selected company/store. Scoped reads/refresh/date/Clear/export, origin-aware return and invalidation guards are in released source; existing central entries and normal close remain. Existing Stock support exchange and actor-bound one-use return hint remain. Earlier 74 focused tests are synthetic evidence, not real browser acceptance.

**Overall No40 OPEN / DEPLOYED / AWAITING LAB.** No authenticated browser session was available for this continuation. Actual six-tile LAB navigation and same-Twin return, actual full-page Stock support entry/exit, and unexecuted backend role/module/revocation cases remain **NOT TESTED**. No further functional PASS or manual entry is claimed. Visual phases1–14, selection2046, claim2040/handoff2047 and all other owners remain protected.

No sales, payments, stock, shifts, employee data, permissions, billing, licensing, camera or fiscal operations were submitted. Only release records are updated here. Existing numbered/PDF status remains OPEN; final No40 manual/checklist/PDF acceptance publication is still pending rather than being inferred from CI or health.

## Next bounded action

In an authenticated Super Admin browser on a verified released revision, select virtual MYWORKSTATION LAB; record company/store, actor and time. Open each of the six tiles read-only once, verify destination and selected-store request context, then return to the same Twin. Stock may use the already authorized virtual-LAB support entry/exit without business action. Record actual outcomes individually. Do not repeat accepted visual phases or historical transactions, execute analytics/email/camera commands, or change other owners' state to manufacture evidence. Missing authentication/role/module scenarios remain NOT TESTED.

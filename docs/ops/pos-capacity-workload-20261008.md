# Isolated capacity test protocol: 100 stores / 110 POS

Status: PLAN DEFINED / EXECUTION NOT TESTED. Owner: `codex/pos-startup-loading-20261008`; preparation branch: `docs/pos-capacity-workload-20261008`. This is an engineering test protocol, not a PASS manual or production capacity certificate.

## Confirmed requirement and fixture assumptions

The owner initially answered one POS per store at 23:15:57 Europe/Athens on 08/10/2026, then explicitly replaced the total with **110 POS across 100 stores** at 23:16:30 and 23:17:30. All configured terminals must actively perform the workload. Idle connections do not satisfy this requirement.

| Stage | Stores | Active POS / operators | Stores with one POS | Stores with two POS | Concurrent BackOffice sessions |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 20 | 22 | 18 | 2 | 20 |
| B | 50 | 55 | 45 | 5 | 50 |
| C | 100 | 110 | 90 | 10 | 100 |

The distribution and one active operator per terminal are synthetic fixture assumptions, not confirmed installation assignments. One simultaneous BackOffice session per store is a conservative proposed stress scenario, not an owner-confirmed staffing count. At stage C this means 210 business sessions, plus explicitly counted background work and diagnostics. Sessions are not database connections.

Use fresh synthetic companies, stores, terminals, operators, shifts, products and history. Cover both a company with many stores and independent companies with foreign-store/foreign-company negative controls. Start with 7,000 products per company, mixed active/inactive and barcode/name matches, supplier history and existing financial history; repeat the limiting stage with 20,000 products. These sizes are test assumptions. Record the actual fixture cardinalities, indexes and query plans; do not copy production customer/employee data.

## Work offered to the system

Rates below are proposed acceptance workloads. A logical action may cause several HTTP or database requests; record both counts. Stagger normal traffic with a reproducible seed. Separately run a synchronized search/refresh burst so averages cannot hide contention. Keep scheduled arrivals independent of response time, record lateness, dropped arrivals and in-flight requests, and do not silently lower the offered rate when the server slows down.

| Action per active session | Normal rate | Peak rate | Boundary |
| --- | ---: | ---: | --- |
| POS product search | 6/minute | 12/minute | Name, barcode, broad match and no-match; exercise the actual POS route |
| POS catalog refresh | 1/minute | 2/minute | Actual application refresh request set, including session/permissions |
| POS session validation | 2/minute | 2/minute | Count validation already caused by refresh to avoid double-counting |
| POS synthetic sale | 1/minute | 3/minute | New request IDs and fresh fixture baselines; local isolated test adapters only |
| BackOffice selected-store catalog search | 1/minute | 2/minute | Include the previously expensive owner-catalog route with real auth |
| BackOffice selected-store report | 1/5 minutes | 1/minute | Fixed known fixture totals and explicit store scope |
| Invoice job arrivals per store | 1/hour | 2/hour | Seeded distinct isolated drafts; external providers excluded and labelled |

At 110 POS the proposed normal logical POS rates are 660 searches, 110 refreshes and 110 new sales per minute; peak is 1,320 searches, 220 refreshes and 330 new sales per minute. Independent session validation is at most 220/minute, after subtracting validation included in refresh. These are arithmetic workload targets, not measured throughput. Background invoice work needs its own measured concurrency, service time, queue age and database budget; a mocked external reader cannot establish OCR/provider capacity. Include actual enabled myDATA/workforce scheduling in the manifest, or label each omitted task NOT TESTED.

## Execution order

1. Record exact source SHA, schema/index versions, Node/PostgreSQL versions, machine CPU/RAM, app/process counts, pool limits, enabled jobs, database limits, fixture counts, generator machine/network and timestamp. Use a separate generator for a representative infrastructure run. A shared CI host is only a harness/regression result.
2. Check isolation and collect before values and an untouched control store. Run a small correctness smoke test, verify expected requests and fixture totals, and estimate request/job service times before selecting pool sizes.
3. Warm up for five minutes. Run A, B and C for 30 minutes each at normal rate. Advance only when the prior stage satisfies the criteria; retain failed-stage evidence before a causal correction.
4. At C, run 15 minutes at peak rate, then a synchronized search/refresh burst. Run two hours at normal rate to check growth in memory, connections, queue age and latency. Repeat the limiting scenario with the larger catalog and the other company distribution.
5. In a separately identified isolated lifecycle scenario, interrupt/restart while fixture actions are in flight. Reconcile every request identity and persisted result before any retry. This does not certify Render's external termination deadline or live failover/restore.
6. Produce a result per stage and scenario: offered/completed action counts, achieved rates, p50/p95/p99/max, errors by route/code, dispatch lag, correctness deltas, resource/connection/lock/job timelines and all omissions. Never average several routes or stages into a single latency PASS.

## Proposed success thresholds

| Measurement | Proposed criterion |
| --- | --- |
| Product search HTTP action | p95 <= 1 second, p99 <= 2 seconds |
| Catalog/session refresh HTTP action | p95 <= 3 seconds, p99 <= 5 seconds |
| Local synthetic sale application action | p95 <= 1 second, p99 <= 2 seconds, excluding external fiscal/payment provider time |
| BackOffice report | p95 <= 3 seconds, p99 <= 5 seconds |
| Offered traffic | No dropped actions; at least 99% start within one second of the scheduled time; bounded in-flight backlog |
| Availability | Zero unexpected 5xx, session-validation failures, pool timeouts/P2024 or database crash/recovery during steady load |
| Financial/stock correctness | Zero duplicate or missing accepted transactions; exact expected totals/movements per terminal/store; untouched controls unchanged |
| Tenant/security correctness | Zero foreign-store/company rows or accepted unauthorized mutations; existing licensing/auth/fiscal gates retained |
| Resources | At least 20% measured memory and usable connection headroom; CPU not sustained above 80% over five-minute windows; no continuously growing queues or memory |
| Database contention | No abandoned reader, deadlock or persistent lock queue; investigate waits above one second and distinguish expected transaction serialization |

These are proposed engineering targets, not a contractual SLA or results already accepted by the owner. HTTP measurements are separate from physical click-to-ready/UI rendering and device/network delays. A production readiness conclusion additionally requires representative planned infrastructure, realistic data/job rates, physical devices and external-provider scenarios. If those are missing, the conclusion remains bounded and the omitted scope NOT TESTED.

## Connection and job budget

Measure peak database sessions and pool waiting, not POS count alone. Read the test database's actual `max_connections` and reserved slots. Budget the sum of **all web-process pools + job/worker pools + diagnostics/maintenance + overlapping old/new deployment processes** below usable connections with at least 20% reserve. Record configured limits and observed peaks separately. Do not assume adding a web instance creates database capacity. Account for running job leases, queue arrival/completion rates, provider delays and retry identities before enabling another process. No arbitrary extra pool or worker is prescribed by this plan.

## Execution safety and evidence

The first harness version must hard-reject production hosts/database URLs and known real/LAB store IDs. Use loopback HTTP and a dedicated local isolated test database with an explicit test-only marker; no live Render SQL, seed, sale, payment, fiscal request or cancellation. Any future representative hosted environment needs an independently identified isolated destination and infrastructure authorization; this plan does not purchase or provision it.

Before writes, identify synthetic store/terminal/operator/shift/SKU/quantity/method/time, capture transaction counts/cash/card/IRIS/totals, stock/latest movements and report/audit IDs. Expected fixture deltas come from a predetermined request ledger. After each bounded run reconcile exact transaction/movement IDs and the control. Keep fixture-only receipts and external payment/fiscal/OCR adapters visibly labelled; never bypass a production gate. Do not replay old LAB or Diadoxou transactions or existing paid drafts for missing evidence. Public result files contain synthetic IDs and sanitized metrics, never credentials, PINs, connection strings or real employee/customer identities.

## Current disposition and next action

No capacity stage has run. No 110-POS readiness, LAB/USER PASS, new paid plan, service, worker or instance is claimed. Previously accepted single-search USER PASS (PR #1918), hot-column/shutdown isolated evidence and deployment-policy LIVE PASS (PR #1934 / #1936 / #1937) remain protected. Broader TODAY-04, POS-CATALOG-PERF-01, installation, financial acceptance and other owners remain separate.

Single next action under retained owner `codex/pos-startup-loading-20261008`: after this preparation/claim is green and published on main, implement the bounded localhost-only workload harness, manifest and correctness ledger, validate them against isolated PostgreSQL/HTTP, and record its exact environment before attempting a capacity conclusion. Proposed implementation branch: `codex/pos-capacity-harness-20261008`. No named handoff or second owner.

## Implemented first harness scope (AWAITING isolated PostgreSQL/HTTP verification)

Claim PR #1939 / head18b6e5f7 / docsCI37839430464 SUCCESS / maincc17788ae26cb963dd88fec4d96a4f9798268b62 was published before source. Main docsCI37839601304 passed; guarded Render37839652372 classified this claim as documentation only and skipped deployment. Owner remains codex/pos-startup-loading-20261008, implementation codex/pos-capacity-harness-20261008.

Source inspection found normal POS searching is local to the loaded catalog. The first harness measures the existing local catalog resolver as `pos-local-search`, separately from three-request core HTTP refresh (catalog/access/shift overview), live authenticated access validation, BackOffice owner-catalog query, selected-store transaction overview and synthetic CASH checkout. It does not invent a POS HTTP search endpoint or equate the local resolver with physical rendering. Optional holds/audience/table-service refresh requests and alternative search variants remain omitted. All actors have distinct real middleware-validated fixture sessions; login/PIN and shift-opening setup are fixtures, not measured login/installation acceptance.

Run only an existing independently identified loopback test app and dedicated loopback database, with NODE_ENV=test, MWS_CAPACITY_ISOLATED=1, DATABASE_URL naming myworkstation_test (or myworkstation_<suffix>_test), E2E_BASE_URL=http://127.0.0.1:8080 and the same test-only JWT_SECRET as the test app. The harness rejects other environments before any connection/request and refuses redirects. Never supply production credentials or tunnel the local app to production. It creates a fresh capacity-UUID namespace and retains it for evidence in the disposable test database; it does not clean, overwrite or replay the existing LAB/pilot fixtures.

Command: `node server/e2e/pos-capacity-flow.mjs`. Default MWS_CAPACITY_MODE=smoke creates7000company products/32linked products per store,101same-company stores (100active +1untouched control),110operator sessions/100BackOffice sessions and an independent foreign-company control. It spreads a small one-action-per-kind regression across22/55/110POS stages. Expected187new synthetic CASH sales at2.50 each are reconciled against exact request identities, per-terminal ledger/payment totals, stock movements and sale audit identities; one identified new fixture request is replayed once to check idempotency. No configured fiscal/card device/provider is involved; the existing unconfigured-fixture fiscal path is preserved. This smoke is not the planned peak or capacity run.

MWS_CAPACITY_MODE=measure uses independent offered-arrival deadlines at the proposed normal core action rates. MWS_CAPACITY_STAGE_SECONDS defaults1800 (allowed60..10800); MWS_CAPACITY_PRODUCTS defaults7000 (100..20000), MWS_CAPACITY_STORE_PRODUCTS defaults5000 (2..min(company count,5000), reflecting the actual POS endpoint limit). It records scheduled dispatch lag, explicit generator drops, started/completed counts, action-specific p50/p95/p99/max and offered-arrival latency, maximum generator concurrency, database-wide connection/active/lock counts and database limits. Observer Prisma pool is capped at2; the existing application's pool is not changed. Source revision, generator machine/Node/PostgreSQL and actual fixture sizes are recorded. Application host resources/pool limits, background-job budget and hosted infrastructure remain unmeasured, so this mode also cannot certify production capacity by itself.

Results go to output/capacity/<runUUID>/result.json, or MWS_CAPACITY_OUTPUT. Tokens, raw errors, response bodies and connection strings are excluded. Output includes before/after snapshots, the planned synthetic request ledger, exact financial/stock/audit identities, per-stage offered load and explicit omissions. CI preserves a sanitized result artifact for14days even if the E2E flow fails; no artifact is required if earlier unrelated CI steps never reach the harness. A failed action/drop/reconciliation yields an explicit harness failure; no automatic financial retry.

Coverage still NOT TESTED: planned5minute warmup/peak/burst/two-hour soak, separate generator/representative service CPU and memory, actual pool waiting/P2024 log correlation, independent-company distribution, supplier/financial-history volume, invoice/OCR/myDATA/workforce background load, devices/provider gates and restart/failover/restore. First bounded causal change adds testing/measurement tools and one CI regression, not a business/performance/runtime/pool/configuration fix. No manual capacity PASS.

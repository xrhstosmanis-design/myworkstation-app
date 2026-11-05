# 04/11/2026 — INVENTORY-RECONCILIATION-01 / RESIDUAL REVIEW / FULL REQUEST OPEN


## 05/11/2026 20:34 Europe/Athens — task 6, first bounded read-only prerequisite inspection

User assigned **6 — Αυτόματος έλεγχος απογραφής** and explicitly requested work **in pieces**. Continue the retained INVENTORY-RECONCILIATION-01 scope. This receipt completes only the first prerequisite inspection; it is **not a new functional LAB PASS**, full-request closure or a source change.

- Native authenticated Platform Admin → MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ (store `cmtpopbgo000trhb5ng9ytiru`) → full BackOffice → commercial Inventory 2.0. Explicitly selected the same LAB store. Cloud browser tab 6; no physical POS action.
- Observed list: unfinalized `LAB31-THEORY-20261103-01` with 0 items; the two N39 10/10 stocktakes with 1/1 each; finalized 11/09 full stocktake with 15/15; 09/09 partial stocktake with 1/1.
- Opened existing 11/09 finalized result and its previous-stocktake comparison. The available preceding option was 09/09. Report shows **14 uncomputed items and 4 without positive cost**. TEST1 has a computable historical difference; TEST2 (`LAB-EXCEL-20260909-02`) stays unknown.
- Opened TEST2 result drilldown: prior count/time unknown, current count 0 at 11/09/2026 18:57:09 in the UI; explicit missing previous count, invalid time basis, missing count event and unknown/nonpositive cost. No confirmations and no per-item source transactions/documents/events were displayed.
- Therefore the available list/comparison did **not provide an eligible numeric two-code finalized comparison** for the next hosted LINK/group acceptance. This is a missing fixture prerequisite, not evidence of a calculation defect. It is not an exhaustive database or other-store search.
- No LINK, CORRECTION, REVOKE, count, finalization, stock, invoice, sale, payment, role or schema operation was submitted. No independent database-control digest comparison or exact deployed-revision check was performed, so neither is claimed. Source review used main `759311ed86ad3d58f77b6819fb408043a60f6031`; this is not asserted as the loaded production revision.
- Existing accepted November 2 flows remain protected. Enter/scanner PRs #3689–#3692 remain separate. Existing PR #3645 was still open/unmerged/conflicted at this receipt; this update does not claim publication to main or release.

**Single next piece:** prepare a bounded synthetic fixture specification for the retained product/count writers: two new explicitly equivalent test codes, known equal unit cost, two new stocktakes containing both codes (example counts 10/10 → 8/11, no intervening merchandise movement; expected -2/+1, grouped -1). Fixture creation must be a separately recorded ordinary LAB operation, with exact IDs/count times/revision and fresh controls, before any report-only LINK and PDF/XLSX acceptance. This paragraph is a specification, not a created fixture or authorization to seed SQL, reuse unrelated products, replay protected stock actions or claim physical equivalence from names.


Retained inventory report/value/review/correction/export ownership; documentation continuation `docs/inventory-residual-review-20261104`, current coordinator `/root`. Reviewed source baseline `bc19fb45cfd24ef83385ff60383ae59ec148b1cb`. This is a gap review, not a takeover of canonical warehouse, product, count, invoice, access or lifecycle writers and not a new functional PASS.

## Protected acceptance

The November 2 source-evidence, unknown-cost, report-only correction/revoke and direct-result navigation checkpoints and `docs/manual/inventory/PASS.md` remain authoritative. Do not repeat accepted count/finalization, consumption, correction/revoke or existing invoice/payment actions for paperwork. Existing PDF/XLSX acceptance remains valid within its recorded single-product LAB scope. Missing cost remains unknown, not a zero-valued loss. A report correction never changes an original count or posts stock.

## New local verification

At 2026-11-04T19:56Z the six existing calculation, evidence, review, export and mounted-UI suites completed **34 PASS / 0 FAIL / 0 SKIP** on Node **24.22.1**. This runtime differs from required Node20; do not call this required native CI or release validation. Evidence: `CHECKPOINTS/EVIDENCE/inventory-residual-review-20261104/local-tests.log`.

The previous export-suite loading failure came from an absent generated Prisma client. Generating Prisma 6.19.3 locally from the existing schema in an isolated checkout allowed the unchanged export suite to execute, including actual XLSX numeric/unknown/formula-safe cells, Prisma Decimal count history, source/review sheets and Greek PDF bytes. No schema, package, runtime-source or test change was needed. No database URL, migration, seed, production query or hosted mutation was used. The earlier 30-pass/one-loader-failure run is superseded only as a local environment result.

Tests cover confirmed two-code -244/+233 => -11, evidenced -263/+240 => -23, transitive links/revocation, stale corrections, retained original movements, unknown canonical cost, malformed/cross-scope history, count-time boundaries and recount history. These synthetic assertions are not observed hosted groups or physical evidence.

## Ordered residuals

| Order | Remaining requirement | Current evidence and boundary | Completion evidence |
| --- | --- | --- | --- |
| 1 | Hosted multi-code LINK/group result and exports | Calculation/mounted coverage exists; the accepted hosted navigation/correction sample has one code. No new hosted LINK has been executed. | First inspect eligible existing synthetic LAB pairs read-only. Then publish exact selected pair/member identities and fresh source/control baseline before one explicitly evidenced report-only LINK. Check grouped totals, all member evidence, PDF/XLSX and unchanged counts/stock/financial controls. Never reuse real customer goods or fabricate physical equivalence. |
| 2 | Reusable company-wide confirmed physical identity | Review links are scoped by company/store/lifecycle/exact stocktake pair (`reviewKey` in `inventory-reconciliation-review-contract.js`), not reusable catalogue identity. | Coordinate a separately owned canonical identity contract and provenance/revocation semantics before importing such identities into reports. No product-card merge is implied by a review LINK. |
| 3 | Independent physical warehouse and receipt/count chronology | `inventory-reconciliation-source.js` explicitly returns `STORE_STOCK_POOL` and `warehouseIdentityAvailable:false`. It reads immutable per-line `countedAt`; invoice issue and recording timestamps are not verified physical arrival. | Canonical source owners must expose independently evidenced warehouse identity and physical timestamps. The report must retain unknowns until these exist; never infer them from store ID, document issue date or current balance. |
| 4 | Original invoice/package/gift/value-credit and canonical writer/access integration | Existing evidence reader supplies bounded document lines, posting/alias identity, sales and allowlisted events. Source availability is not proof that the physical originals or all delegated flows were accepted. | Reconcile eligible physical originals against exact stored units/package/posting chronology; coordinate retained invoice/count/access owners. Missing evidence remains visible and prevents full physical-loss confirmation. |

The already accepted N39 reason/recount flow is not reopened by this review. Current synthetic recount regression is additional technical evidence only. Broader devices/roles and full physical scenarios remain NOT TESTED unless their own current checkpoint records acceptance.

## Single next action

Read-only native LAB inspection for an existing eligible synthetic two-code finalized comparison, with exact loaded revision and selected-store identity. If none exists, record that prerequisite and design a separately reviewed fixture; do not seed SQL, repeat accepted stock actions or silently broaden a canonical writer assignment. No state-changing LAB or source change is authorized by this documentation receipt alone. Full request remains OPEN/ASSIGNED to retained owner; no release or new manual/PDF PASS.

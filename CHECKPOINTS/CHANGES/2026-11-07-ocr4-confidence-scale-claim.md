# OCR4 confidence scale - before-source claim

## 07/11/2026 17:05 Europe/Athens - OCR4-CONFIDENCE-SCALE-01 / ASSIGNED / BEFORE SOURCE

Retained invoice/task4 owner /root; continuation from docs/ocr4-k01-hosted-20261106 at the owner's request to continue here in small steps. Claim branch docs/ocr4-confidence-scale-claim-20261107; subsequent source branch fix/ocr4-confidence-scale-20261107.

Scope: only make the FAST provider's confidence unit explicit in the schema description and prompt: percentage points from 0 to 100; 99 means 99%, 1 means 1%, and 0.99 remains a valid 0.99%. No automatic multiplication, minimum confidence, UI conversion or retrospective reinterpretation of K01. Add focused actual-request/response regression coverage with synthetic mocked provider values.

Read-only source review at main a9d6873c98f045de943bc67e3ff15ba70843f896: the schema already permits 0-100; the prompt does not name the scale, the endpoint preserves the numeric value, and the UI rounds it. K01's raw confidence is NOT CAPTURED, so its historical cause remains UNPROVEN. Existing limited K01 file/page/header PASS remains protected; K01 and all previously consumed fixtures are not replayed. Full OCR and hosted acceptance remain OPEN.

Preserve supplier/number/date/total selection, physical PDF counting, provider order/models/reasoning/timeouts, Azure and durable reuse, tenant/store authorization, wallet and every payment/draft/stock/fiscal writer. OCR4-LOCAL-PDF-3697 and the separate latency scopes/owners are unchanged. Source integration starts only after normal claim CI and merge to main. Next: the bounded prompt/schema clarification and focused checks; no paid OCR or production transaction in this step.

Checkpoint: CHECKPOINTS/CHANGES/2026-11-07-ocr4-confidence-scale-claim.md. All earlier registry bytes are retained unchanged below. No new LAB PASS or numbered-work closure is claimed.

## Evidence and protected behavior

The 6 November K01 observation recorded one PDF/two physical pages and supplier, document number, issue date and 49.60 EUR correctly, without submission or payment. The exact live revision and raw provider response were not captured. This claim does not upgrade that evidence or assert that K01 was 99%/100% confident.

Read files in the complete local sparse checkout: AGENTS.md; the full active list, tracker, pending roadmap and numbered checklist; invoice PASS manual; K01/page-display, PDF-total-safety, PDF-priority and local-PDF claim checkpoints. The current main history after the K01 observation was checked. The newer #3704 assignment explicitly excludes FAST; no competing confidence claim was found in the current registries.

Code references at the reviewed main: server/src/routes/commerce-pos-v244.js (confidence schema, FAST prompt and response); client/src/lib/invoice-fast-header-merge.js; client/src/components/store/StoreSupplierInvoicePremiumFast.jsx. The existing helper plus display expression preserves 0.99 and 1 and rounds both to 1%; this is a synthetic diagnosis, not a real reader replay.

## Proposed source acceptance

1. The actual outgoing provider request includes the existing numeric 0-100 schema plus an explicit unit description and prompt examples for 99% and 1%.
2. Mocked provider responses 1, 0.99 and 99 return those same numeric values; no unconditional x100 or confidence floor.
3. Existing FAST PDF total safety, provider selection, fallback, reuse and store/company guards remain intact. Reuse existing transport harness and keep production settings unchanged.
4. Normal full source CI and review precede any merge/deployment. Hosted behavior remains AWAITING LAB until an independently identified, explicitly scoped fresh observation is authorized; no K01 replay.

## Current result and next action

This change contains assignment documentation and regenerated tracker PDF copies only. Runtime code and tests are unchanged. Status: OPEN / BEFORE SOURCE. After the claim passes normal CI and is merged, apply the two-part schema/prompt clarification on the named source branch and run focused regressions. The numbered checklist and its PDF remain unchanged because no complete numbered task is closed. Existing manual PASS remains unchanged because no new runtime PASS is claimed.

## Local publication verification

Before publication, reconciled the original reviewed claim with current main 2f041a203ded570b0ca752a70e7003e2b2564d82, preserving the newer limited native cash-acceptance record from PR #3705. The approved claim text is unchanged and all three current-main registries are preserved as exact byte suffixes. This is a documentation reconciliation, not a runtime change.

Both generated tracker PDF copies are byte-identical (SHA-256 3659a4f96d8c787ea7d21e48f3cf96f686f710febb017c6bc13765a20538cb07; 3,593,860 bytes; 975 pages). Text extraction confirms the claim on page 1. Visual review covers the new first page and the transition on page 2, without claiming a fresh visual review of all historic pages. A separate read-only reviewer found no issue with the scope, low-value preservation or K01 evidence limits. Markdown whitespace checks passed. Runtime source and tests remain unchanged.

The owner explicitly approved publication of these six documentation files as a separate PR and normal-CI-gated merge on 7 November 2026. No source integration precedes that gate.

## 07/11/2026 21:55 Europe/Athens - PR #3709 documentation synchronization

The continuation synchronized the existing claim with main `7b40395f1313dd5cc1d3789878930e1eca56602b`, preserving the independent CASH-UNIFIED-AUDIT-15 system-email assignment from #3707. Each of the three registries contains the exact approved 1,861-byte OCR claim prefix followed by every byte of its current-main version. The cash checkpoint, prior ownership and historical evidence remain unchanged.

Regenerated both canonical tracker PDF copies with the unchanged repository generator. They are byte-identical: SHA-256 `5d21254f8dc6811ca2896f2d7d85b55cb6278d9d6b4ba14e2b255d179d879e4f`, 3,596,207 bytes, 975 pages. Text extraction confirms both the OCR claim and preserved cash-email claim in the opening pages. Visual inspection of pages 1-3 confirms readable text, margins, footers and transitions; historical pages were not freshly reviewed.

This is documentation reconciliation only. Runtime code and tests are unchanged; no OCR provider call, invoice submission, payment or new LAB PASS occurred. PR #3709 remains the single delivery path. Next: exact updated-head review and normal CI before the approved claim merge; only then start the bounded schema/prompt implementation.

## 07/11/2026 - constrained continuation after GitHub publication

Verified PR #3709 head b996ebc1 had the approved six documentation files, while main had advanced to 83cee2b and the branch was behind by six commits. No runtime code or tests changed and no normal PR workflow runs were found for b996ebc1.

Kept the original approved 1,861-character OCR claim prefix intact, then synchronized **only** docs/roadmap/OPEN_WORK_TRACKER.md (commit e35d7f77) and docs/roadmap/PENDING_WORK.md (commit b3cdd868) with each file's newer main contents. For each, the branch text was read back and verified to equal the exact claim prefix followed byte-for-byte by the current-main text at the time of verification. The latest CASH-UNIFIED-AUDIT-15 preview-failure claim was preserved. No K01 replay, paid OCR, invoice submission, payment or production deployment occurred.

CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md was intentionally **not modified** after GitHub returned an h2 transport/body error during the larger-file operation; a post-error SHA check confirmed its old blob remained c6a2af0aee72e86198403a9cac79d9afd393462e. The two tracker PDF copies also remain to be regenerated and verified against the complete reconciled registries.

Status: DRAFT / PARTIALLY RECONCILED / NOT MERGEABLE. Next small action: safely reconcile the larger active-list file by a transport supporting its complete contents, then regenerate and compare both PDFs, verify exact diff and normal CI, and only then consider the previously approved claim merge. No source implementation before that gate.

## CASH-ADJACENT-COUNT-21 — 05/11/2026 — Owner-directed automatic consecutive-count classification / AWAITING LAB

Scope owner: retained CASH-UNIFIED-AUDIT-15 under the PR3646 owner-directed handoff, now in chat because Work pages are unavailable. Branch feat/cash-adjacent-count-20261105-chat from main4fa7ffa4bb0420487b072770a61080ee8bd9bd6f. The owner explicitly requires MyWorkStation itself to identify opposite cash differences on genuine immediately consecutive shifts as a counting error, instead of a manual database interpretation. Prior scoped LIVE stored-reading completion 04Nov and PR3650 exact technical release remain protected; new behavior is NOT TESTED and financial finality remains OPEN.

Current source already has immediateCashPair (same company/store/terminal, CLOSED chronological predecessor/successor), audited cash arithmetic, manual reviewed OFFSET and a non-netted per-employee result. The missing behavior is proactive, read-only pair identification, common opposite-sign amount and separate residual, surfaced in the canonical on-screen report. Because a sign pattern alone cannot prove physical counting, label as counting-error candidate pending documentary confirmation; never make an automatic money adjustment or employee charge.

Bounded implementation: new pure server/src/services/cash-adjacent-counting-errors.js; additive cash-reconciliation-report.js projection/text/fingerprint only; focused new tests and existing report regression. Require strict immediate adjacency, same store/terminal, valid non-stale numeric cash audit, previous counted closing exactly carried to next opening, both closed and opposite signed nonzero safe integer remaining cents, no already applied OFFSET. Competing/overlapping candidates are not automatically assigned. Use min(absolute opposite amounts) as suggested overlap; preserve each raw and effective shift balance, cash/card/IRIS audit, financial totals, source hashes, lifecycle, approvals and immutable review history.

Regression: synthetic unequal +/- with residual, exactly equal/reversed signs, card-only, other store/terminal, missing/overlapping/open/failed neighbor, carried amount mismatch, incomplete cash audit, existing manual offset, ambiguous alternating triple, one-sided selected period, determinism, original source immutability and no financial changes. CI/isolated native tests do not equal LAB. Required gated full PR/main CI + guarded release, read-only LAB/real selected-store acceptance and visibility of residual. No provider/paid AI, re-read, payment, bank/ledger, settings, email, stock, invoice or fiscal operation.

Technical-blocker note: the central active/tracker/pending registry originals are unusually large (3.4–5.0 MB). Attempts to append via the connected GitHub contents/blob endpoint failed at HTTP/2 transport; do NOT treat registry synchronization as complete. This branch must remain DRAFT/unmerged and no implementation PASS until an intact registry update and the required policy gate are completed. No new live financial action has been performed.

Registry synchronization after green claim (PR #3660): PR #3657 GitHub Actions run 41930987830 SUCCESS, with exact old registry bytes preserved under the new SOURCE-PR prefix, two canonical tracker PDFs regenerated, and temporary workflow removed. This is not native cash CI nor MYWORKSTATION LAB PASS; original money, ledger, reviews and real stores remain unchanged.


## 2026-11-05 — BackOffice one-click automatic cash audit (DRAFT)

Owner requires MyWorkStation itself, not chat-side SQL, to run selected-store cash checks (shift adjacency, ledger, EFTPOS, expenses, handoff, stored handwritten evidence and pending issues). Existing canonical FULL-audit sources remain authoritative; paid OCR remains a separate explicit operation.

- Added pure read-only `server/src/services/cash-automatic-check-summary.js`: selected-store audit statuses `HOLD` / `REVIEW_REQUIRED` / `NO_DIFFERENCES`, shift/card difference counts, adjacent-candidate/ambiguous pair counts and stored-paper completeness; `financialAdjustmentCents:0`, `humanApproval:false`.
- Added authenticated `GET /api/cash-reconciliation/stores/:storeId/automatic-check?from=YYYY-MM-DD&to=YYYY-MM-DD`, limited by the existing 31-day period schema and existing selected-store authorization, canonical report generation, and `scope.fullAudit=true`. No request triggers a paid AI reader, review write, cash OFFSET, delivery or posting.
- Wired `client/src/components/shared/CashReconciliationPanel.jsx` to an owner-visible **Αυτόματος έλεγχος χωρίς χρέωση** button. It renders the summary and the existing detailed canonical report; the distinct existing paid handwritten extraction button remains opt-in.
- Added summary fail-closed tests and HTTP authorization/no-write tests. These are **committed but NOT YET RUN** under native Node20/PG/HTTP CI on new head. Do not cite the earlier green CI #9247 for the new changes.
- Real selected-store Diadochou data and stored photo readings were previously inspected read-only; this does not establish that this newly wired UI has passed authenticated LIVE acceptance. All unclear photo associations remain pending rather than automatically confirmed.

Protected: PR #3657 remains OPEN/DRAFT/unmerged; production, money, employee charges, bank, cards, invoices and prior reviews are unchanged. Next: complete native CI on the exact new head; resolve any regressions, validate authenticated selected-store read-only acceptance and preserve all central registry history while reconciling current main before guarded merge/release.


## 2026-11-05 — Owner-approved 100 MiB aggregate cash-paper cap (DRAFT)

Owner explicitly requested increasing the automatic-handwriting aggregate admission limit, after read-only evidence showed **37 current Διαδόχου chat attachments, 76,755,299 metadata bytes**, exceeding the former 25 MiB limit. The owner-approved implementation increases only the aggregate budget to 100 MiB (104,857,600 bytes), in both `cash-paper-automatic.js` and `cash-paper-stored-preview.js`. It **retains** the maximum 50-source discovery, existing 7 MiB per-original revalidation ceiling, exact checksum/size binding, serial stored-original verification, strict FAIL-CLOSED coverage, and no implicit paid OCR / financial write. BackOffice HOLD explanation now uses 100 MiB.

Added focused regression for 37 synthetic entries totaling 77 MiB, over-limit and >50-source admission, 100 MiB sequential stored-source checks, preserved per-original 7 MiB limit, and no provider or writer invocation. Full source CI required on the exact new head; tests are authored but not claimed green without a run result. Successful metadata admission is NOT proof that all physical handwritings are legible or that report coverage is COMPLETE; missing/unread/uncertain remain HOLD. No production, fiscal, bank, inventory, cash, employee charge or service mutation occurred.


## 2026-11-05 — Live stored-paper read-only state reconciliation (DRAFT)

Owner requested continuation on Διαδόχου real data. Read-only Render PostgreSQL metadata reconciliation for current 37 supported store-chat attachments: 29 have NO paper-reading intent/completion, 7 have a stored `EXTRACTED_UNVERIFIED` completion, 1 has `REQUIRES_REVIEW`; aggregate metadata bytes 76,755,299, largest 5,651,046 bytes, none exceeds retained 7 MiB per-original limit. This proves metadata eligibility under the proposed 100 MiB cap but **not** exact-original checksum revalidation, paper OCR truth, or financial acceptance. No paid OCR, SQL writes or review updates occurred.

Extended the in-app read-only automatic summary and BackOffice UI to separately expose stored-paper source-level NOT_READ/PENDING/REQUIRES_REVIEW counts apart from unresolved physical lines; added isolated regression confirming immutable inputs, financialAdjustmentCents=0, humanApproval=false, and HOLD. Exact new source branch head requires fresh CI. Temporary push-scoped CI may be running but the linked GitHub connector cannot list that push workflow run; no PASS is claimed here. Maintain DRAFT, no merge/deploy and no automated paid reader.


## 2026-11-05 — Fail-closed completeness correction

Read-only code validation found a financial-report presentation bug: automatic summary `paperCoverage` classified `discoveryComplete` as `COMPLETE` even when paper readings/lines were unresolved. This could misleadingly label the actual Διαδόχου 29 NOT_READ / 7 EXTRACTED_UNVERIFIED / 1 REQUIRES_REVIEW set as fully covered after raising the aggregate budget to 100 MiB.

Bounded fix in `cash-automatic-check-summary.js`: `paperCoverage=COMPLETE` now requires **both** `paperEvidence.coverage.complete===true` and `paperEvidence.status==='COMPLETE'`; otherwise `INCOMPLETE`/HOLD. Added regression for completed discovery with an unread paper, retaining `financialAdjustmentCents=0`, `humanApproval=false`. Existing synthetic complete fixtures updated to the genuine full-coverage contract. The existing production data is UNCHANGED; no paid OCR, authenticated live preview, merge or deploy. New exact head CI required before claiming PASS.


## 2026-11-05 — Large stored-paper read-only performance gate

Bounded source performance correction in `cash-paper-stored-preview.js` for **admitted aggregate sets above 25 MiB and within the approved 100 MiB cap**: first query the saved reading state, and validate/load exact original bytes only for `EXTRACTED_UNVERIFIED` stored readings. `NOT_READ`, `PENDING`, and `REQUIRES_REVIEW` retain their statuses without loading originals. Every usable cached extraction still requires the original source identity, checksum, <=7 MiB single-file limit, and byte-length match. Existing <=25 MiB admitted validation ordering and incomplete fallback behavior remain unchanged. Does not call paid reader, approve money or mutate state.

Regression models the observed Διαδόχου statuses (29 unread, one review, seven cached extracted) across 37 synthetic sources totalling 77 MiB: exactly seven original validations, none for 30 unread/uncertain, and unchanged INCOMPLETE reporting. New code is committed only to DRAFT PR branch; no new-head CI PASS, authenticated hosted preview or release evidence is claimed. Next verify actual push-scoped CI and potential performance regressions before any merge.


## 2026-11-05 — Actionable vs informational paper-coverage HOLD reason

Post-100MiB review of the BackOffice automatic summary identified that the source discovery always includes `reason:'UPLOAD_TIME_IS_NOT_DOCUMENT_DATE'` even when there is no actionable discovery error. Previously this informational provenance warning was sent as `paperIssueCode`, causing a misleading user-facing generic failure. The read-only summary now surfaces only explicitly actionable discovery errors (`ATTACHMENT_BYTE_LIMIT`, `ATTACHMENT_SIZE_UNAVAILABLE`, `CHAT_SOURCE_UNAVAILABLE`, `INVALID_SOURCE_SCOPE`, `DUPLICATE_MESSAGE_ID`) when paper coverage is incomplete. Unread/unverified physical evidence still enforces HOLD, and source upload times never prove printed dates. Added a focused negative regression. No source of money, human approval, paid reader or production setup changed. New code head requires fresh CI and authenticated selected-store acceptance. PR remains DRAFT/unmerged.


## 2026-11-05 — Empty selected-store period fail-closed handling

Reviewed authenticated selected-store GET `/api/cash-reconciliation/stores/:storeId/automatic-check`: the route is authenticated, uses existing tenant/store authorization, rechecks store lifecycle, restricts period to <=31 days, reads canonical full audit and never performs paid extraction or financial writes. Found a legitimate empty-period defect: the derived automatic summary threw a `TypeError` for `rows:[]` despite the source report explicitly supporting a no-closed-shift date range. Fixed read-only summary to return `status:'HOLD'`, `checkedShifts:0`, `paperCoverage:'UNAVAILABLE'`, with no zero-differences claim, no adjustment and no approval. Added regression. This is a source CI fixture check, not hosted authenticated UI acceptance. Exact new branch head requires new CI run; branch remains DRAFT/unmerged, no deploy/money action. Render services currently have no dedicated cash branch LAB; unrelated POS/wholesale services were left untouched.

## 2026-11-05 — PR #3683 conflict reconciliation / CI PASS / DRAFT

The clean cash source PR #3683, exact head `0dddb73771aa4ab9dc70a56710ea8feb74846083`, passed rerun [42064325969](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42064325969), attempt 2, all five jobs SUCCESS. Its original first attempt failed only isolated wholesale Chromium `Target.createTarget timeout`; retry passed with no source changes. This is source CI, not authenticated LAB financial acceptance or release.

Current main `759311ed86ad3d58f77b6819fb408043a60f6031` changed 69 paths against PR #3683's merge base; the sole overlap among this PR's 16 paths is the central `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md` file, updated additively by peer tasks. It must be retained exactly as in current main. Direct GitHub API rewrite of this large (5,078,088-character) active file with the 740-character cash entry failed with `h2 protocol error`; DO NOT replace or truncate it. The exact omitted cash entry is preserved verbatim below for later lossless server-side registry insertion. This checkpoint remains an authoritative task-local pointer until that central sync succeeds.

The integration branch can be synchronized by taking the exact current-main tree and applying only the 15 otherwise non-overlapping cash-specific source/test/checkpoint blobs, with a two-parent merge commit. No main production changes, deployment, paper paid OCR, financial adjustments, approval or cash employee charges are authorized by this source-only operation. Retain DRAFT until fresh exact-head CI, review, registry sync and authenticated read-only LAB acceptance.

### Verbatim pending central active-list prefix (740 characters)

```markdown
## CASH-ADJACENT-COUNT-21 — Clean integration from current main (2026-11-05)

DRAFT review-only integration branch `feat/cash-audit-clean-main-20261105` copies precisely the cash audit source/tests from validated source PR #3657 onto main SHA `c09981151631b5c35bb92649c667eed3dfccae40`. It leaves all main-owned registry and roadmap PDFs untouched. Under source PR #3657, exact-head CI run 42036572920 passed all five jobs, Node server 5589/5589 and extra 8/8, and clean PR #3683 at `393e7fc` passed all five jobs in run 42056462157. This branch now incorporates main `fc8d80106f27e37e854247c92c9e0af0dee50fc6`. Fresh CI and isolated BackOffice acceptance are pending. No production deploy, human approval, paid OCR or financial mutation.

```


## 2026-11-05 — Exact current-main central registry sync / previous CI blocker resolved

One-shot strictly branch-scoped GitHub Actions run 42087519636 passed and committed the central CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md entry on PR #3683 without touching production. Original current-main central blob 18e2b2133e5d64f50fc27aa2a904beec077894f9 (5,078,088 characters) was verified fully preserved, byte-for-byte, as the exact suffix of new blob dc4bf961b4644a2da379b388fe021d7387a5a46e; only the 951-character CASH-ADJACENT-COUNT-21 entry was prefixed. Temporary branch-scoped workflow was self-removed in the same commit; only the expected 16 cash source/test/checkpoint/central paths differ from main. Prior exact merged-head CI 42086169126 failed only the checkpoint gate because this entry was absent; implementation tests were skipped in that run. This checkpoint update is intended to trigger fresh exact-head PR CI, which must complete green before any source PASS is claimed. PR stays DRAFT/unmerged. Still no authenticated selected-store LAB acceptance, financial approval, deploy, paid OCR, cash OFFSET or money/employee mutation.

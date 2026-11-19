# Νο02 — ordinary payment tolerance consistency / BEFORE SOURCE

19/11/2026 Europe/Athens. Same owner `/root`, branch `fix/no2-payment-observation-tolerance`. Continued explicit owner instruction to perform the grouped No02 acceptance and resolve false monthly financial pending items. No source changes before this claim merges.

## Fresh hosted evidence and preserved PASS

One authorized Super Admin desktop session in the requested store verified the installed #4063 report: draft counter equals its exact subset; a paid draft opens the existing purchase and saved lines; paid filter pages contain only paid rows; the legacy FINAL example opens its existing final purchase in the original issue month, shows the existing payment and actual larger difference; a unique automatic myDATA report correlation opens its evidence and retains its paid status. No upload, payment, approval, new draft, stock change or email was requested or performed. Customer rows/amounts remain in the private report. This is limited hosted PASS of those observations, not all roles/devices or whole No02 completion.

A separate fresh hosted observation shows a positive confirmed payment within five cents of its invoice classified as a financial pending item. Existing `invoice-common-draft.js` already accepts absolute payment difference <= .050001 without requiring review (lines around382/409/433). The ordinary financial observer still classifies any nonzero difference as PARTIALLY_PAID or OVERPAID. This is a concrete policy inconsistency; do not mark the whole acceptance PASS.

## Narrow authorized correction

1. Add an explicit bounded ordinary payment observation option, default zero for existing direct consumers; only monthly report and record readers opt into five cents. Apply only after every existing identity, scope, reversal, settlement and allocation gate and only to a positive verified paid amount.
2. Retain exact paid, remaining and extra amounts. A nonzero difference within tolerance gets a clearly named tolerance flag and readable display, not a ledger write-off. Unknown, unlinked, invalid and unconfirmed rows never become paid through tolerance. Differences of six cents or more keep their current partial/extra classification.
3. Add the policy version/value to both ordinary fingerprints. Counters, filters and record details must agree before pagination; previous cursors cannot silently survive a changed classification policy.
4. UI explicitly states paid within five-cent tolerance and the actual difference. It must not simultaneously demand that amount as a new payment. Exact payments and larger differences retain their previous presentation.

## Boundaries and required verification

Raw C and immutable D1 implementations/source contracts, default observer semantics, existing canonical payment proof gates, persisted amounts/IDs/allocations, writers, approvals, stock/fiscal and all other owners remain unchanged. No production data repair/backfill. Read-only acceptance uses the same existing rows, not repeated transactions. Original #4063 technical and limited hosted results remain protected.

Required synthetic pure tests: positive and negative1/3/5/6cent boundaries, exactzero, unavailable/reversed/foreign/ambiguous/unlinked/zero-paid, valid allocations and ordinary-only opt-in. Required actual reader/nativePG tests: summary/filter/record/raw amounts and read-only digest, complete pagination and cursor policy. Actual Chromium desktop/mobile must open the new tolerance display and preserve larger differences without writers. Full source/exact main CI and normal guarded release precede the final bounded hosted recheck. New correction NOT STARTED/NOT TESTED before this claim; overall No02/#4019 OPEN.


## Implementation after merged claim #4065

Claim merged1ed36bdb before source. Explicit bounded observer option defaults0, ordinary report/record opt5 with identical policy fingerprints. Only verified positive amounts can receive PAID-with-tolerance flags; paid/remaining/extra values remain exact. UI labels the actual difference within tolerance and preserves normal partial/overpayment and unknown states. Default strict semantics/raw C/D1/writers remain unchanged.

Node20:43purePASS/0FAIL, combined observer/reader/D1 89PASS/0FAIL, preserved canonical/posting/automatic identity32PASS/0FAIL,4targeted mountedUI PASS/0FAIL; production build PASS. Existing actual-browser fixture now exercises the explicit tolerated difference on a paid row while preserving all old counters/assertions. New nativePG scenario requires full65paid paging50+15, record/list fingerprint agreement, rawledger/D1 digest unchanged,6cent boundaries and stale cursor after a current payment change. Local actual PostgreSQL/Chromium not repeated because their environmental limitation is already documented; mandatory exact source/main CI must execute them before normal guarded installation. New fix AWAITING FULL CI / DEPLOY / BOUNDED HOSTED RECHECK. No business data changes.

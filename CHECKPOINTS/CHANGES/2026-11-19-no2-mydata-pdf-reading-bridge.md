# Νο02 — myDATA PDF reading on the existing draft / BEFORE SOURCE

19/11/2026 Europe/Athens. Same No02 owner `/root`, branch `fix/no2-mydata-pdf-reading-bridge`. Explicit urgent owner request to solve invoices arriving as plain PDFs. No new source before this claim merges. This continues the No02 original/store/draft opening scope and reuses No04 reader/transfer interfaces; it does not take over or modify the No04 OCR model, prompts, wallet metering, assistant or atomic confirmed line transfer.

## Confirmed source gap and existing behavior

Original acquisition supports verified provider PDFs, reads every internal page up to20, preserves original attachment and canonical source/payment links, and can prefill structured XML rows. Header-only XML can still leave an empty PDF draft. Current first original acquisition opens the order without opening its reader; opening an already linked draft drops the explicit inbox-PDF context. The existing explicit assistant source route correctly binds the same company/store/inbox/order PDF and automatically previews when opened. Reviewed line persistence already exists in the No04 atomic transfer and remains an explicit confirmation.

The rapid bounded correction is automatic reading preparation on an explicit user opening/acquisition of a verified empty editable PDF draft. It is not unattended background PDF processing or unconfirmed line persistence. No model call, wallet use or repeated acquisition is performed for this diagnosis.

## Assigned adapter scope

1. Add one read-only readiness helper for the unique existing canonical order/source/job/inbox PDF, fully scoped company/store/inbox/order. Return a versioned needs-reading/has-lines/read-only/unavailable state and real line count; do not fetch bytes, write, install schema, call providers or infer readiness from header totals alone. Missing, duplicate, deleted, foreign and contradictory links fail closed.
2. Enrich only the already-authorized explicit original endpoint response after its existing acquisition. Background synchronization and polling do not start AI or change their contracts. Existing acquisition, PDF identity/size/page checks, common draft/payment matching and module/role/lifecycle gates remain unchanged.
3. In the inbox, opening an unregistered linked myDATA PDF uses that same original operation and explicit inbox/store context. Only a bound empty editable readiness response automatically opens the existing reader. Populated drafts retain their existing rows; registered/final rows remain read-only. An explicit existing assistant request remains available through the established interface, with no automatic overwrite.
4. Single-flight and store/API/generation/unmount fencing prevent duplicate navigation/reader starts and stale cross-store responses, including away-and-back changes. Make the PDF reading action clear; distinguish the metadata PDF report from the supplier original. Preserve read-only inbox mode and non-myDATA actions.

## Protected interfaces and required tests

No04 assistant preview/atomic transfer, reader prompts/models, wallet/budgets, provider allowlist/verification, invoice/payment/stock/fiscal writers, raw C/D1 and other owners are protected. The existing user confirmation transfers prepared lines once; this adapter never approves an invoice or creates a new payment. Unsupported/scanned identity failures remain explicit; no guessed products or silent zero-line success.

Required pure/native PostgreSQL readiness tests: exact same source, zero/populated lines, final/approved and wrong scope, orphan/duplicate jobs and metadata, read-only digest/no provider calls. Required endpoint/UI tests: first/reused PDF and existing draft route, exact existing IDs/payment context, explicit assistant for populated draft, no AI from GET/polling, double-click/uncertain response/store/API/away-and-back/unmount fencing, legacy/non-myDATA/read-only preservation. Actual Chromium must exercise the No02 adapter navigation contract with synthetic requests and no real provider charge; existing No04 all-page/PDF and atomic transfer regressions remain mandatory. Full exact source/main CI and normal guarded installation precede bounded grouped acceptance. New bridge NOT STARTED/NOT TESTED; overall No02 remains OPEN.

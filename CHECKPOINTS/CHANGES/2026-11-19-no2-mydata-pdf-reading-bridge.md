# Νο02 — myDATA PDF reading on the existing draft / TECHNICAL LIVE — GROUPED PDF ACCEPTANCE OPEN

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

Required pure/native PostgreSQL readiness tests: exact same source, zero/populated lines, final/approved and wrong scope, orphan/duplicate jobs and metadata, read-only digest/no provider calls. Required endpoint/UI tests: first/reused PDF and existing draft route, exact existing IDs/payment context, explicit assistant for populated draft, no AI from GET/polling, double-click/uncertain response/store/API/away-and-back/unmount fencing, legacy/non-myDATA/read-only preservation. Actual Chromium must exercise the No02 adapter navigation contract with synthetic requests and no real provider charge; existing No04 all-page/PDF and atomic transfer regressions remain mandatory. Full exact source/main CI and normal guarded installation precede bounded grouped acceptance. At claim publication the bridge was NOT STARTED/NOT TESTED; current implementation evidence follows. Overall No02 remains OPEN.


## Source implementation and local evidence — 19/11/2026

Before-source claim #4068 merged as `82c441afa5574a3da3b61238500e6501f139b82a`. Implementation branch `fix/no2-pdf-reading-source`, same No02 owner `/root`.

The explicit original response now includes read-only readiness for the existing scoped canonical PDF draft. First acquisition and reopening preserve the exact inbox/store source context. Empty editable PDF drafts open the established reader. Existing lines and registered documents use their current review behavior. Single-flight navigation and store/API/generation/unmount checks reject duplicate or stale responses. The existing confirmation transfers the reader's proposed lines into the same draft.

Local source/helper/endpoint checks passed **23 tests, 0 failures, 0 skips**. Expanded mounted UI test passed **1/1** with the actual Chromium case excluded from this local invocation. Existing inbox UI regressions passed **4/4**, BackOffice regression **1/1**. The synthetic actual-browser fixture built successfully and the browser runner passed syntax checking. Production client and server build passed. An additional existing HTTP error route, scheduled receiving, archive and No04 manual draft-transfer/PDF route batch passed **17/17**, with 0 failures or skips. The native PostgreSQL readiness test is included for CI and was skipped locally because an eligible native database was unavailable. These results establish local technical behavior only.

Exact source full CI, mandatory native PostgreSQL and actual Chromium execution, exact merged-main CI and ordinary guarded installation remain pending. Hosted PDF reading/confirmed line transfer acceptance remains in the single grouped final LAB session. The prior payment-tolerance correction #4066 / merged `b44532a5135c916dc9da9f369003990e363a53f1` is already installed and retains its prior evidence. Overall No02 remains OPEN. Public tests use synthetic identities and documents.


## Exact source/main CI and normal installation — 19/11/2026

Source PR #4069, exact head `c6f748e2519813625d356723beb0eb5975d4d97f`, passed full CI **44569426991**, all **5/5 jobs**. It merged as `9246dfcb70d514c10e7264e6c48a9e5a487fbed9`. Exact merged-main CI **44571614418** also passed **5/5 jobs**. Both runs report **6416 tests / 6413 PASS / 0 FAIL / 3 optional skips**, plus **8/8** recovery tests. Decoded build-and-test logs independently confirm named non-skipped PASS for `native PDF readiness reads actual same-draft counts and rejects duplicate dangling and foreign sources without writes` and `real Chromium PDF readiness preserves explicit same-record desktop/mobile reading`.

The existing normal guarded deployment **44573707801** completed **2/2 jobs**. Render deployment `dep-dbvipsk0916s73b97ia0` reached terminal LIVE at **19:09:44 Europe/Athens**, exact merged revision `9246dfcb70d514c10e7264e6c48a9e5a487fbed9`. Independent unauthenticated health returned `ok=true` and that revision. Served `entry-BID7c1Vg.js`, SHA256 `3600169a79c80950a68eefe414e3a57f27ec5e425db897bf057c61f8683a3313`, contains the readiness protocol and new explicit metadata-PDF label alongside the ordinary matching and tolerance markers.

### Limited hosted payment-tolerance recheck

At **18:44–18:45 Europe/Athens**, the owner-authorized coordinator reused the existing signed-in selected-store session and reloaded the installed report. An existing verified payment difference within the accepted tolerance displayed as paid within tolerance, preserved its actual difference and showed no owed amount. The financial-difference filter retained only the same two larger existing overpayments. This is limited hosted PASS for the observed tolerance label and filter behavior. Business invoice identities, amounts and private fixture details are retained outside this public receipt. No invoice upload, payment or stock action was repeated.

### Remaining grouped PDF acceptance

Actual native PostgreSQL and desktop/mobile Chromium establish the adapter contract with synthetic data. A hosted read of a real supplier PDF, product-line quality, operator confirmation and resulting same-draft lines remain NOT TESTED for this bridge. They remain in the single grouped final session using existing authorized records. Overall No02 remains OPEN. The earlier local pending statements above are historical and are superseded only for the exact CI/installation evidence in this section.


The bounded post-installation browser check found that the existing signed-in BackOffice session had become inactive. One visible BackOffice reopening attempt confirmed the inactive-session response. A new sign-in was not requested under the user's grouped-session instruction. Therefore the newly installed hosted PDF label and real PDF reading remain NOT TESTED; independent served-bundle proof above remains valid. The earlier observed tolerance PASS remains valid for its recorded session and time.

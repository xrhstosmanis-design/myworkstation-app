## 18/10/2026 13:19 Europe/Athens — WHOLESALE-ORDER-LOCK-SNAPSHOT-01 / PENDING CLAIM / EXECUTOR BLOCKED / DO NOT MERGE BEFORE PDF REGENERATION

Retained owner codex/wholesale-suite-20261017. SourcePR2692/maina4d4efef passed PRCI39117550996 and exactmainCI39118006237/job117647740030 with2972PASS/0FAIL/0SKIP plus6backup/all required jobs. Ordinary release39118364642 succeeded; Render deploydep-dba9nleq1p3s73as1r3g is live at exacta4d4efef, finished10:15:26Z. Separate hosted functional/LAB acceptance remains NOT TESTED. Prior scoped native proofs remain valid; full product is OPEN.

Final source review independently confirmed by coordinator, pricing and order workers: RepeatableRead starts the advisory-lock waiter's snapshot before the predecessor commits. T1 holds originaltierP1 SHARE locks; a higher eligible tierP2 INSERT can commit independently. T2 starts afterP2 but beforeT1commit and waitskey. Its subsequent stale snapshot can miss the accepted order yet seeP2, returning PRICE_CHANGED before uniqueness retry; the UI would incorrectly unlock as if nonaccepted. This is concrete causal source evidence, not a reproduced native FAIL yet. Do not call the correction implemented or source acceptance complete.

Pending bounded follow-up branchfix/wholesale-order-lock-snapshot-20261018: change only order transaction to ReadCommitted, keeping advisory key serialization, current authorization, mandatory SHARE locks on company/store/customer/association/list/product/store-membership/chosen tier, exact decimal amounts, atomic request/event and bounded retries. The lookup after lock then sees committed predecessor; locked master data plus final batched tier query define coherent pricing. Quote endpoint remains RepeatableRead; later tier insertions are not serializably prevented. Order worker owns lib/unit tests; coordinator owns deterministic registered native HTTP test/docs/review; pricing worker reviews read-only. No other owner is taken over.

Required native regression: gate T1 after old-tier pricing and before actual request INSERT via transaction proxy (real PostgreSQL, no pricing stub); insert higher eligible tier through another connection; start same-key T2, verify its advisory wait via pg_locks, releaseT1, require201+200sameorder/originalsnapshot and one event. Prove oldRR fails and correctedRC passes, retaining existing scope/rollback/ledger controls and fullCI before merge. No financial/stock/fiscal/publicauth/offline/standalone/module/productionDB/backup/restart change.

BLOCKER: exec-server transport disconnected during the attempted local claim update. Root recovery and independent worker pwd/gitstatus probes cannot produce output. Local command completion/file state unknown; no follow-up source/test edit has been made or authorized by a merged claim. This text is saved directly on receiptPR2694 to preserve findings. Existing tracker PDF still represents the prior CI receipt and could not be regenerated during the outage; this PR MUST remain unmerged until executor recovery, gitstatus inspection, reconciliation with latest main, complete record/PDF regeneration and green claim CI. After claim merge implement only the scoped fix and deterministic regression, require fullCI and exact release before functional acceptance. Owner retained, no handoff or duplicate claim. SourcePR2692 is saved; receiptPR2694 is OPEN/BLOCKED. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md.

## 18/10/2026 13:08 Europe/Athens — WHOLESALE-ORDERS-01 / SOURCE MERGED / FULL PR CI PASS / AWAITING LAB

Coordinator codex/wholesale-suite-20261017 retained. SourcePR2692 finalheadc735afe8d4ed22b172b08aba631e9a0b70e445e9/fullCI39117550996/job117646433489 SUCCESS:2972tests/2972PASS/0FAIL/0SKIP plus6backup tests and all required Windows/build/Chromium/security/licensing/invariant/realHTTP flows. Actual guarded native PostgreSQL registered wholesale router/bootstrap/pricing/order scenario PASS, including5concurrentidentical submissions→1request+1event, immutable accepted replay after price change, changed-key409, stale-price409 with fresh quote, company/store/customer revocation, event failure atomic rollback and same-key recovery, unchanged synthetic Sale/StockMovement/StoreTransaction controls. This is isolated CI proof only, not hosted/LAB/business acceptance. Initial failed run39117252067 remains recorded; explicit NUMERIC casts resolved its typed-TEXT insertion error and the unchanged native tests passed.

Merged a4d4efef4cff20e89702051c27e5259ddd90474f after all checks green. Independent concurrent FCM claimPR2693/mainf9912764 changed documentation only and is preserved; all source/client blobs match the tested source tree. Exact mainCI39118006237 is in progress. Ordinary guarded release/exact public health proof still pending; no direct deploy/restart/production SQL, license or backup change. No manual PASS. Full suite remains OPEN: B2B customer site/identity, seller application/assignments, durable offline recovery, credit/receivables, reservation/picking/dispatch/fiscal integration, dedicated entitlement and standalone packaging remain future work. Existing ownership retained; no handoff or duplicate claim. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md. Next action observe exact source-main CI and guarded deployment, then prepare bounded functional acceptance; no state-changing LAB authorized by this receipt.

## 18/10/2026 13:00 Europe/Athens — WHOLESALE-ORDERS-01 / NATIVE CI FAIL RECORDED / FIX AWAITING RETEST

SourcePR2692 headba481290/fullCI39117252067/job117645531974:2972tests/2969PASS/3FAIL/0SKIP. Both Windows jobs PASS. Native tier audit/classification and exact scoped quote subtests PASS. Actual order INSERT failed PostgreSQL42804 because Prisma bound exact decimal-string totals as TEXT into NUMERIC columns; concurrent-submission and rollback-recovery subtests plus containing native test failed from that one cause. No merge, release or production operation occurred. This is isolated test evidence, not a LAB observation.

Causal correction in wholesale-orders.js: explicit ::numeric casts for net/vat/gross bindings, preserving exact decimal strings with no IEEE754 conversion. Existing real native scenario remains unchanged and must prove the correction; focused Node20 pricing/order18/18PASS. Previous full local and UI/build results retained, full corrected GitHub CI still required before merge. Shared owner remains codex/wholesale-suite-20261017; full suite OPEN/AWAITING LAB. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md. Next action run exact corrected full CI/native scenario, no bypass.

## 18/10/2026 12:53 Europe/Athens — WHOLESALE-ORDERS-01 / SOURCE REVIEW / AWAITING FULL CI AND LAB

Coordinator codex/wholesale-suite-20261017 retained; source feat/wholesale-orders-core-20261018. ClaimPR2691 finalhead70f4cd3a/docsCI39116588681 SUCCESS merged3a2835bd before any source edit. Three authorized workers implemented separate pricing, persistence and mounted UI scopes; coordinator integrated bootstrap/routes/launcher/native HTTP tests and reviewed the shared contract. All other owners and prior PASS remain untouched.

New bounded scope: exact BigInt NET/GROSS cent pricing from highest eligible active same-company quantity tier, explicit selected store and active StoreProduct membership, VAT0 and fractional units; legacy unclassified prices fail closed rather than acquiring an inferred basis. Additive tier priceBasis/version and transactional price audit, version-checked classification; legacy tier changes without basis reset it to NULL. New operational APIs accept BACKOFFICE_USER managers only and no client identity/price/channel overrides. Existing master/retail routes and CORE gate retained.

SUBMITTED request/event snapshots commit atomically; company/actor/clientOrderId + normalized fingerprint provide same-key replay and changed-payload409; current company/store/customer rechecked even on replay, stale quote409 before write, RepeatableRead and bounded full-transaction retry. No sale, payment, stock reservation/posting, invoice/myDATA/fiscal or credit approval is enabled. UI shows «Προς έγκριση» and no credit check, freezes ambiguous UUID/body, validates acknowledgement scope, blocks own tab/mode/close/minimize/open-event departure, warns on unload and preserves mounted request through temporary authentication loss. Re-login recovery concerns the same account within the still-open page; no persistence/offline/reload/crash recovery guarantee.

Focused local Node20 registeredHTTP/pricing/orders/mountedUI/launcher+existing BackOffice regression:52tests/50PASS/0FAIL/2nativeSKIP. The environment has no local PostgreSQL. New guarded native PostgreSQL test executes the complete real router/bootstrap/pricing/order services in a random myworkstation_test schema: store/product/tenant filters, audited basis/version CAS, NET/GROSS/VAT0/quantity tiers, five concurrent identical HTTP submissions yielding one order/event, replay after price change, changed key conflict, stale quote, company/store/customer revocation, event-trigger rollback/same-key recovery, unchanged synthetic Sale/StockMovement/StoreTransaction controls. This native scenario still requires actual green CI; its source is not acceptance proof.

Final local Node20 full server suite:2961tests/2848PASS/0FAIL/113environmentSKIP in53.7s; Work-safe frontend build PASS. Focused52/50PASS/0FAIL/2nativeSKIP; mounted wholesale UI15/15, existing BackOffice regression10/10 and new launcher lock1/1. Initial broad run exposed one old source-shape assertion requiring the exact close handler without a guard; assertion updated to require the new synchronous lock guard while retaining its visibleRef reset, then complete suite rerun green. No runtime failure was hidden. Text whitespace check and regenerated PDF first-page render/text check PASS. Full GitHub CI/native PostgreSQL/hosted acceptance remain pending. No new manual PASS. Full WHOLESALE-SUITE-01 remains OPEN: B2B customer identity/site, seller assignment/application, durable offline recovery, approval/credit/receivables, reservation/picking/dispatch/fiscal integration, dedicated entitlement and standalone commercial packaging remain unimplemented. Production/LAB functional acceptance NOT TESTED. No manual deploy, restart, production SQL, license or backup operation. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md. Next action required green full CI/native proof before source merge, then exact guarded release verification before any proposed LAB acceptance.

## 18/10/2026 12:35 Athens - WHOLESALE-ORDERS-01 / ASSIGNED / NOT TESTED

Owner/coordinator codex/wholesale-suite-20261017 retained; claim docs/wholesale-orders-claim-20261018, source feat/wholesale-orders-core-20261018. Owner says «ΞΕΚΙΝΑ» for next agreed shared pricing/order phase. Prior explicit public repository authorization remains valid. Previous sourcePR2685/main11235c4c and evidencePR2686 retained; baseline main d8ff16ef. No prior wholesale LAB PASS is invented. New scope is additive wholesale quote and SUBMITTED order requests, not fiscal/financial completion.

Three independent workers after green merged claim: wholesale_core owns new exact-decimal pricing lib and pricing tests; field_sales owns new atomic order-request lib and order tests; b2b_site owns internal wholesale quote/order UI and mounted tests. Coordinator owns bootstrap, routes, parent launcher integration, HTTP/native PostgreSQL acceptance, shared records and review. No code before claim merges. No other Gate6/Gate8/DAILY/efood/retail/POS/inventory/fiscal/assistant/store-lifecycle owner is taken over.

Scope: explicit nullable tier priceBasis NET/GROSS with legacy NULL unclassified; tier version and scoped price-change audit; no reinterpretation/backfill of legacy numeric values. Quote fixed eligible quantity tiers only, active same-company customer/list/store/product/store-membership and explicit source basis, decimal net/VAT/gross snapshots; ambiguous/unsupported/unclassified price fails closed. Operational APIs require explicit store. Actor/channel/prices derive from authenticated manager context. No public customer/seller token or new entitlement is enabled yet.

Submit one online BACKOFFICE order request with UUID clientOrderId, customerId,storeId,items,quoteId,notes. Transactional idempotency bound to company/actor/key + canonical hash, unchanged retry returns original committed order, changed reuse409, stale quote409 before write, atomic request/event. Status SUBMITTED/«Προς έγκριση», creditChecked=false; no stock reservation/posting, sale, payment, invoice, myDATA, fiscal or collection. UI freezes ambiguous submission and retries same key/body; blocks own launcher departure and warns on browser unload. No browser persistence/offline/crash-recovery guarantee in this slice.

Additive runtime bootstrap only for new wholesale tables and price metadata; no production SQL/migration from sandbox, no physical/LAB state-changing action, no server/backup/restart/license change. Isolated tests must prove exact cents/net/gross/zeroVAT/tier boundaries, tenant/store/product isolation, stale responses, quote mismatch, concurrent duplicate serialization and rollback, unchanged synthetic financial/stock controls. CI/build/invariants/registered HTTP/native PostgreSQL + mounted UI required before source merge. CI alone is not LAB PASS; new manual PASS absent. Full suite remains OPEN. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md. Next action merge this claim then implement the scoped vertical slice.

## 18/10/2026 - WHOLESALE-MASTERS-01 / SOURCE MERGED / FULL CI PASS / AWAITING MAIN CI, RELEASE AND LAB

Coordinator codex/wholesale-suite-20261017 retained. First bounded source PR2685 finalhead0c2a4524c1e975040eeb0a04efe68529a6a16ffc/fullCI39111762123/job117629287772 SUCCESS:2929tests/2929PASS/0FAIL/0SKIP plus6backup tests and all required Windows/build/Chromium/security/licensing/invariants/isolatedHTTP jobs. Exact native PostgreSQL registered wholesale router scenario executed PASS (not skipped), proving own/foreign/corrupt association handling, real persisted tiers/decimals and unchanged synthetic stock/money controls in its isolated schema. Mounted UI7/7 and registered HTTP5/5 are part of that suite. Previous local12PASS/1nativeSKIP and broad local2812PASS/110environmentSKIP remain separate local evidence.

Source merged main11235c4c98b41c744fe5b75f899366f3287d414c after green PR CI and independent review. Concurrent main e25a7e7d changes were documentation-only; their Android/scanner/assistant checkpoints, manual and owner records were preserved, PDF regenerated, runtime source blobs unchanged by reconciliation. MainCI39112180379 queued/pending at evidence preparation. Exact guarded deployment/hosted UI/physical/LAB acceptance NOT TESTED; no manual PASS and no activation of a full wholesale/B2B/seller product. Ordinary existing release workflow remains guarded; no direct deploy/restart/DB/license/business/stock/payment/fiscal operation was performed.

First master-data source scope is complete for CI review, with functional hosted acceptance still AWAITING LAB. Full WHOLESALE-SUITE-01 stays OPEN and owned by the coordinator. Quote/order lifecycle, customer B2B site, external-seller application, dedicated entitlement and standalone packaging remain PLANNED/NOT IMPLEMENTED. Read-only follow-up clarified gross retail prices versus unclassified B2B unit prices and the need for a dedicated portal-session boundary; plans updated without auth/schema source changes. Checkpoint CHECKPOINTS/CHANGES/2026-10-17-wholesale-suite-foundation.md; docs/wholesale plans.

Next single action: verify mainCI39112180379 and ordinary guarded exact-source release before any hosted acceptance; then begin a separately bounded authoritative quote/order slice. Existing owners/PASS retained; no claim release or financial LAB test is authorized by this evidence record.

## 18/10/2026 - WHOLESALE-MASTERS-01 / SOURCE PREPARED / LOCAL VALIDATED / AWAITING CI AND LAB

Coordinator codex/wholesale-suite-20261017 retained; source feat/wholesale-suite-foundation-20261017. Claim PR2680/headc7519a407ca7103e144193c7b0bf88baf3ed96af/docsCI39070541242 SUCCESS merged33ba81e2e0e096896ec4cdf56fb1ab611ab10167 before source. Owner18Oct00:18 explicitly approved public repository publication. Earlier publication blocker is resolved; all unrelated owners and PASS preserved.

Bounded first source slice: customer GET returns tenant-scoped assigned list; explicit null unlinks only same-company association; assignment validates/locks customer and list in one transaction, malformed/foreign/inactive references rejected and inconsistent association409. New saved-tier GET has bounded deterministic pagination and tenant joins, preserves zero/null/decimal prices. UI safely resets acknowledged customer/list creates, explicitly unassigns, displays persisted tiers with loading/error/retry/empty/page controls and guards stale/unmounted responses/overlapping refreshes. No wholesale quote/order, B2B customer site, seller application, dedicated entitlement or standalone package is implemented by this slice.

Local Node20.20.2 focused registered HTTP5PASS + mounted React/jsdom7PASS =12PASS/0FAIL/1nativeSKIP; skipped native PostgreSQL scenario requires isolated CI database. Existing retail/customer regression17/17PASS. Client build PASS/TABLE_SERVICE verified, server preparation/Prisma generation PASS. Full local server suite:2922tests/2812PASS/0FAIL/110environmentSKIP,112.1s; all13new focused cases included, native scenario skipped locally. Independent read-only worker review found no blocking API/UI mismatch. Native source-router test uses random isolated schema and real bootstrap/SQL, foreign/corrupt refs, persisted decimals and unchanged synthetic stock/money controls; native/LAB effects are NOT claimed from local mocks.

No production DB/bootstrap/config, license, stock, payment, fiscal, backup or server operation. No new manual PASS. Full suite remains OPEN/NOT TESTED. Checkpoint CHECKPOINTS/CHANGES/2026-10-17-wholesale-suite-foundation.md; plans docs/wholesale. Next action: required full CI and isolated PostgreSQL proof before merge; hosted/physical acceptance stays AWAITING LAB.

## 18/10/2026 00:18 Europe/Athens - WHOLESALE-SUITE-01 / PUBLICATION AUTHORIZED / ASSIGNED / NOT TESTED

Owner explicitly answered «Εγκρίνω» to publishing the technical plans, assignment/checkpoint records and generated tracker PDF to the existing PUBLIC repository https://github.com/xrhstosmanis-design/myworkstation-app. This authorization resolves the prior automatic-review publication blocker for this payload. Coordinator codex/wholesale-suite-20261017 and three worker scopes remain as recorded below. Source remains NOT STARTED until this claim passes CI and merges to main; production operations are not part of this publication. Full wholesale/B2B/field-sales suite remains OPEN / NOT TESTED. No existing owner or PASS is changed. Checkpoint CHECKPOINTS/CHANGES/2026-10-17-wholesale-suite-foundation.md. Next action: publish and merge this documentation claim, then the bounded master-data stabilization.

## 17/10/2026 23:58 Europe/Athens - WHOLESALE-SUITE-01 / PROPOSED ASSIGNMENT / LOCAL ONLY / PUBLICATION BLOCKED

Public publication rejected by automatic approval review; claim is not merged and source implementation has NOT started. Explicit authorization for the new payload in the public repository is required before another publication attempt.

Owner/coordinator `codex/wholesale-suite-20261017`; claim branch `docs/wholesale-suite-claim-20261017`, source branch `feat/wholesale-suite-foundation-20261017`. Owner explicitly requested a full wholesale product inside MyWorkStation and independently saleable, plus B2B site and field-sales app, then authorized three cooperating agents and said «Ξεκινά».

ΑΝΑΛΗΨΗ ΑΠΟ `agent/wholesale-b2b-20261001` - ASSIGNED `codex/wholesale-suite-20261017` for this owner-authorized expanded wholesale suite and the bounded master-data stabilization below. Historical phase1 implementation/NOT TESTED evidence is preserved, not promoted to PASS. No separate historical agent is presumed currently running. No unrelated Gate6, Gate8, DAILY online, efood, retail POS/customer pricing, inventory, fiscal, licensing or production assignment is taken over.

Three parallel workers: wholesale_core (existing B2B master readback/unassignment and tests), b2b_site (separate B2B architecture/contracts), field_sales (assignment/mobile/synchronization contracts). Coordinator exclusively owns shared tracker/checkpoint files, integration decisions and review. Source edits begin only after this claim is green and merged to main.

First bounded source scope: read back assigned customer price list; explicitly remove same-company assignment; safely reset successful customer/list forms; review saved list tiers with tenant-scoped bounded API. Architecture documents specify one shared future quote/order service for BACKOFFICE/B2B/FIELD_SALES and standalone licensing. Product identity remains Product/StoreProduct; WholesaleCustomer is not silently merged with retail Customer. No retail checkout, payment, fiscal, stock posting, production schema/config/data or live test action.

Evidence: read-only three-agent audit of main87b286473014c852ed83169fe7cda44ccc4dff32 and original phase1PR1625/commitc322453ea7edd139da71ccfd1ee7cf4d812a8014. No wholesale LAB PASS found. Missing quote/order/portal/seller/standalone lifecycle remains OPEN/NOT TESTED. CI is not LAB acceptance. Acceptance for this first source slice: mounted UI and registered HTTP tenant/role/readback/unassign tests; native isolated PostgreSQL where available, full existing CI and build; LAB remains AWAITING LAB until deployed and observed. No replay of historical transactions.

Checkpoint `CHECKPOINTS/CHANGES/2026-10-17-wholesale-suite-foundation.md`. Next: merge this documentation claim, then implement the bounded foundation and publish source PR. Full product remains OPEN; no claim that three audit agents constitute a finished product.

## 13/10/2026 — EFOOD-EVENT-PREVIEW-05 / SCOPED READ-ONLY LAB PASS / WHOLE 12 OPEN

Retained owner codex/efood-bearer-20261012. Actual desktop cloud Chrome Platform Super Admin readback13Oct approximately01:14 Europe/Athens, after exact guarded healthy revision7a880fb18bbee2232949f4a964ea459a61094971. Canonical entry https://myworkstation-app.onrender.com/platform-admin; selected MYWORKSTATION LAB companycmtpopbgk000prhb5qc60zxus / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ storecmtpopbgo000trhb5ng9ytiru, SANDBOX/vendor9344842. Receiver observed CONSUMED/locked, external/order/sale/stock/payment/fiscal flags all ΟΧΙ before read.

One GET-only list of already archived events displayed3 entries (one genuine provider event plus two historical mocks). Selected existing genuine event8aecdfb3-c3c2-4531-9ce1-391bc3baee7c/orderc79b178a-34e6-4d11-9eb5-2a7246209c60; one GET-only product preview. Actual displayed vendor9344842, READY_FOR_PICKUP/LAB_WEBHOOK_TEST, product “17 Delicatessen Hot Mustard 250g”, quantity1, SKU SLL45E, barcode05201050130791 preserving initial0, and “Δεν υπάρχει αντιστοίχιση”. UI explicitly says mapping, pricing, payments, availability and Pelican need separate confirmation. PASS is ONLY scoped archived-event read, real decrypt/current normalization and visible UNMATCHED preparation. No new callback, one-shot window, mock, mapping save, product change or business action was performed. This is not a new ingress acceptance PASS or complete efood/Pelican activation.

ClaimPR2410/docsCI38309237239 green/main4ea9dceba59430fb2f9d78a1e6e91bbed316feca preceded source. SourcePR2411/finalheade314bda5cd46eba36df2d7dcf9fffacc95da229d/fullCI38313270078/job115023886861 SUCCESS2536PASS/0FAIL/0SKIP plus6backup/all required jobs. Merge7a880fb18bbee2232949f4a964ea459a61094971 exact mainCI38314162822/job115026837691 SUCCESS2543/0/0 plus6backup/all required jobs (additional concurrent tests preserved). GuardedRender38314603700/job115028157846 SUCCESS: pinned2026-10-12T22:05:53.7596796Z, exact healthy2026-10-12T22:07:45.7341985Z, ok=true/version0.22.0+kat-test-pos/revision7a880fb. All8owned source/test blobs verified identical in released revision. Initial unchanged attempts38310596096/1+2 remain2532/1/0 due completed-tool timing bug; independently corrected under PR2416, no assertion/metric/threshold/workflow weakening.

Local focused26/0/0 includes actual registered HTTP routes with crypto, bounded scoped SQL, errors/privacy/manual mapping, existing parser/Bearer/window guards and mounted native parent+child. Negative roles/foreign tenant/hash/decrypt/malformed/positive+ambiguous mapping/stale store/unmount/redaction tests are ISOLATED CI ONLY; no live negative/positive-mapping/mobile acceptance claimed. New list/preview paths deliberately avoid schema/bootstrap/expiry writes and outbound/replay/window operations. Existing credential forms preserved, preview outside all3forms, buttons GET-only and stale generation/scope/config-version responses ignored; commercialExecutionReady=false, availabilityValidated=false/providerContractPending=true. Scoped store membership does not certify availability.

Independent financial/stock/business/Audit DB counts and after/control measurements were NOT TESTED in this read-only acceptance. Earlier00:26–00:27 UI baseline is contextual only; unrelated pages' transactions are not attributed to this preview and no financial/stock delta is inferred. No claim of overall no-side-effect financial PASS.

Completed preview implementation/readback is removed from active pending. Whole tracker12 remains OPEN and same owner retained until scoped completion/named handoff. Next single action: inspect the selected LAB catalog for an authoritative same-SKU/barcode product and store membership before any explicit manual mapping; do not invent productId or map to TEST1/TEST2 controls. Price/unit/VAT/payment/retry/recovery/reconciliation/full Pelican environment/certification require provider contract. Support follow-up already SENT12Oct23:16:46Athens/message1a131c2b6ac76a6e; no duplicate email this turn. Prior callback22:56 PASS remains protected; no repeat callback merely for paperwork. All other assigned Gates/owners preserved.
Checkpoint CHECKPOINTS/CHANGES/2026-10-13-efood-event-preview.md; verified usage docs/manual/efood/PASS.md; preparation worksheet docs/integrations/efood/acceptance-preparation.md.

## 13/10/2026 — CI-CAPACITY-DEADLINE-01 / VALIDATED / BOUNDED TOOL FIX CLOSED

Independent owner codex/ci-capacity-deadline-20261013 completed and released for this bounded scheduler correctness fix. ClaimPR2413/docsCI38311728376 SUCCESS/main8275bb603083260c70f60c1cb7a63ddceda3de6b preceded source. SourcePR2416/finalheadf03707abc68b05bb9a6c7ef67763f02a851d423f/fullCI38312482857/job115021512211 SUCCESS2532PASS/0FAIL/0SKIP plus6backup/all required jobs; merged05085cfd336f04fadbbf6bac945b787f7c43588f. Exact mainCI38313091136/job115023330813 SUCCESS2532/0/0 plus6backup/all required jobs. Earlier preliminary run38312028257 canceled only for shared-record reconciliation. Combined efood CI and exact main subsequently green.

Runner now waits ceil-positive remaining time and rechecks monotonic deadline before dispatch. Actual-source deterministic fractional timer case changed scheduled5.5/start5/response1/offered0.5/lag0 FAIL to scheduled5.5/start6/response1/offered1.5/lag0.5 PASS; early-wake recheck also passes. Original8tests/assertions, latency formulas, arrival rates, concurrency/drops, destination/privacy guards and event IDs preserved; focused10/10 including real slowHTTP original assertion. No workflow/threshold/Node/profile/resource/application runtime/DB change or hosted workload. Official timer semantics https://nodejs.org/download/release/v20.20.0/docs/api/timers.html.

This is CI tool VALIDATED, not LAB/business/production capacity PASS; no manual PASS entry for this tool. Historical tracker19 FINAL PASS protected. Production/100-store capacity remains OPEN with retained owner codex/pos-startup-loading-20261008; no takeover or duplicate workload. Remove completed isolated repair from active pending. Checkpoint CHECKPOINTS/CHANGES/2026-10-13-ci-capacity-deadline.md.

## 10/10/2026 13:31 Athens — N39 absolute correction LIVE PASS / final closure OPEN

Owner `codex/n39-inventory-acceptance-20261010` retained. PR2070 full CI38043861185 SUCCESS2062PASS/0FAIL/0SKIP, merged/deployed a90bfd3ce242b68d130250546bd761c87799f4ee; mainCI38044476432 and guardedRender38044664872 SUCCESS, independent exact health verified. Existing RECOUNT-REASON-01 DRAFT pencil CORRECTION01 replaced8→4 (explicit preview), expected5/report−1/retail4.80. Fresh before13:30:27 and after13:31:53: source stock5/ledger5/diff0/15moves/duplicates0/latestWASTE11:54:13; MAIN6tx/cash4/card0/IRIS0/total4/expense0/latest11:59; controlLAB-POS-022tx/cash0/card0/IRIS0/total0/expense120/latest— unchanged. Blank finalization reason disabled button; reason entered only as preparation, not persisted closure. This supersedes pencil LIVE FAIL13:04:56/AWAITING LAB only. Protected finalization/expired/transfer/SELF/waste-pair PASS are not repeated.

Remaining: one reasoned finalization of this same DRAFT, verify stock5→4/one adjustment−1/exact persisted reason/ledger16moves and unchanged controls, reject one prepared stale-tab count3, reopen read-only. Native getJsDialog blocked by retained-data protection: ordinary confirmation requires user manual browser handoff; no credential/security bypass. Early unresolved-close LIVE NOT TESTED. PR2060/2062/2066 native PostgreSQL mutation/reason/recount/scoped-role/replay proofs passed full CI separately; never labeled LIVE. Physical/mobile/new-store acceptance and assigned TODAY-07 remain separate NOT TESTED. Full39 OPEN. Checkpoints `2026-10-10-n39-recount-reason-live.md`, `2026-10-10-n39-absolute-recount.md`; manual and authoritative39/tracker/pending/PDF synchronized. Other owners33/40/44/45/46 preserved.

## AI-CREDITS-01 — source merged / CI PASS / AWAITING BILLING SETUP AND LIVE

Source PR #1989 merged 09/10/2026, main42bee63704d135e86992eaf92ae5064f8ffb256c. Exact final PR CI37986817256 SUCCESS; earlier CI37984602197/37985196722/37985730552/37986249842 also SUCCESS. Isolated PostgreSQL/HTTP flow observed PASS for authorization, persistence, Audit, concurrent update conflict, missing billing configuration and session revocation. Local26/26 targeted and1981server PASS/0FAIL/4environment skips; production build PASS. Shared changes preserved through main reconciliation. PDFs regenerated with final handoff, after source publication, to avoid repeated concurrent binary conflicts.

Current owner remains codex/ai-credit-alerts-20261009. Production push CI/guarded Render release initiated; exact deployed revision and authenticated UI remain NOT TESTED at this checkpoint. No billing Admin key acquired/installed and no baseline configured. Real credit/account identity and warning/critical evidence remain NOT TESTED; no LIVE/LAB/manual PASS. No invoice/payment/stock/fiscal or provider purchase mutation.

Single next action: verify guarded release of source42bee637, then deployment administrator securely sets same-organization OPENAI_BILLING_ADMIN_KEY and Super Admin confirms current prepaid balance in AI Command Center. Do not paste secrets into chat. Perform read-only LIVE alert/settings acceptance after configuration; maintain same owner until explicit handoff. Setup: docs/ops/ai-credit-alerts-20261009.md.


## AI-CREDITS-01 — implemented / LOCAL PASS / AWAITING CI, setup and LIVE

Claim PR1987, docs CI37983339777 SUCCESS, merged main4a69eb48 before source. Same owner codex/ai-credit-alerts-20261009; source codex/ai-credit-alerts-implementation-20261009. Added central homepage/Command Center warning,5USD/2USD defaults and validated current-balance/threshold settings, dedicated persistence + transactional Audit/version conflict, bounded all-organization Costs API reads. Unknown/failure/stale never green; estimates clearly labelled. Page polling60s/server cache5min; no email/push/scheduled external task. No provider credential installed or invoice/business mutation.

Local Node20.20.2 targeted26/26; full server1981PASS/0FAIL/4environment skips; production build PASS. New isolated PostgreSQL/authenticated HTTP CI flow still pending. Same-account OPENAI_BILLING_ADMIN_KEY, real current-balance baseline, exact deployment and LIVE acceptance remain NOT TESTED. No new manual PASS. Ops docs/ops/ai-credit-alerts-20261009.md; checkpoint CHECKPOINTS/CHANGES/2026-10-09-ai-credit-alerts.md. Owner retained.


## 09/10/2026 22:36 Europe/Athens — AI-CREDITS-01 ASSIGNED / NOT TESTED

Owner codex/ai-credit-alerts-20261009. Independent new owner-authorized low-credit warning, defaults5$/2$, configurable thresholds and honest unknown/estimated balance. Preserve AI Command Center phases1–14/manual and all existing owners. No invoice extraction change, financial/stock action or provider credential change. Checkpoint CHECKPOINTS/CHANGES/2026-10-09-ai-credit-alerts.md. Read main4cd333b7, public healthb40a09df; authenticated LIVE NOT TESTED. Claim must merge before source.

## 07/10/2026 12:09 Athens — Central Management full LIVE audit — ASSIGNED / LIVE BLOCKED

- Ο ιδιοκτήτης ανέθεσε σε αυτή τη σελίδα πλήρη, μία-μία LIVE επιθεώρηση όλων των ενοτήτων, καρτελών, υποκαρτελών, ενεργειών και οθονών της Κεντρικής Διαχείρισης, με scoped διορθώσεις μόνο μετά από green claim PR/merge.
- TODAY-04 περνά στην παρούσα ανάθεση. Η προηγούμενη σελίδα δεν παρέδωσε handoff· δεν επινοείται αποδέσμευση ή τεκμήριο.
- Τελευταίο γνωστό main κατά την ανάληψη: 4e1f96ea78ca3a92b4ad7a900b09766f4502d7fd. Τα ανοιχτά PR #1735/#1702 και οι κοινές αλλαγές checkpoint/tracker ελέγχθηκαν πριν από αλλαγή.
- Η σύνδεση παραμένει BLOCKED: ο browser προστατεύει τα native credential πεδία και δεν δέχεται πληκτρολόγηση/handoff· το ασφαλές αίτημα επέστρεψε locator_invalid. Καμία διαπιστευτήρια στο chat. Η τρέχουσα production revision δεν επαληθεύτηκε.
- Ιστορικό εύρημα μόνο: στις 07/10 00:25, revision 6caa27b7e0667b453ef99db13360e3c0c6e561c1, Bulk Price normal mode έφτανε το Preview με πραγματικό scroll· σε maximize το κάτω μέρος κοβόταν και το scroll δεν κινούσε τη φόρμα. Χρειάζεται νέα LIVE επιβεβαίωση στην τρέχουσα production.
- Τα προηγούμενα PASS άλλων σελίδων και όλων των άλλων owners διατηρούνται. Καμία πραγματική χρέωση/πώληση, price apply, stock, fiscal ή μη αναστρέψιμη μεταβολή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-07-central-management-bulk-price-scroll.md`.

## TODAY-08 — functional hierarchy · CODE CI PASS / OPEN (06/10/2026)

- PR #1775 is merged at `a707adc616a6a28a295b4cb102e6d0b5837ede73`. The current shared tracker records code/CI PASS; this does not close the UI acceptance.
- Remaining: inspect the exact LIVE page and confirm the new hierarchy, preserved authorized actions/handlers/permissions/tab destinations, and desktop viewport fit. Do not mark TODAY-08 PASS without that evidence.
- LAB functional acceptance remains NOT TESTED in the current tracker. Preserve existing LAB records; no financial, stock or shift action is part of this documentation update.
- The earlier pre-merge notes below described the 05/10 checkpoint and are historical; use `docs/roadmap/OPEN_WORK_TRACKER.md` for current status and owner.

## POS — mandatory shift open fail-closed AWAITING CI 05/10/2026\n\n- USER physical observation: sales UI appeared before shift overview resolved. Existing opening form already requires Συρτάρι/Φύλαξη/Κέρματα/Χρηματοκιβώτιο. Fix blocks StorePosPanel while `shiftState===null`; sales render only after overview proves openSession. Checkpoint `CHECKPOINTS/CHANGES/2026-10-05-pos-shift-open-fail-closed.md`.\n\n## Workforce — AUTO OUT 12h safety AWAITING CI 05/10/2026\n\n- USER rule: OPEN attendance without OUT auto-closes at IN+12h, creates AUTO_OUT_12H entry/audit and becomes NEEDS_APPROVAL for Owner/Super Admin review. Server worker runs startup + every 5min; row lock + OPEN recheck prevents duplicate close. No manual LIVE attendance mutation. Checkpoint `CHECKPOINTS/CHANGES/2026-10-05-workforce-auto-out-12h.md`.\n\n## Workforce — attendance flow confirmed / fast coworker QR AWAITING CI 04/10/2026\n\n- Operator shift open→IN / close→OUT already wired. «Κάρτα εργασίας» coworker QR/PIN already toggles Workforce IN/OUT without POS session and blocks OUT <1min after IN. Attendance camera preserves native QR+Code128 fast path, continuous focus and target frame. Checkpoint `CHECKPOINTS/CHANGES/2026-10-04-workforce-attendance-fast-qr.md`.\n\n## Workforce — camera/QR/card login PHYSICAL PASS · QR speed optimization AWAITING CI 04/10/2026\n\n- USER physical test entered LAB POS 2 successfully via phone QR, but decode took ~20s. Optimize camera only: QR-only ZXing hints, faster scan interval, 1280×720 preference, continuous focus where supported, targeting frame. Checkpoint `CHECKPOINTS/CHANGES/2026-10-04-workforce-pos-qr-speed.md`.\n\n## Workforce — POS camera permission PASS / preview render fix AWAITING CI 04/10/2026\n\n- Physical test: Chrome permission PASS + webcam light ON, but no modal/video. Root cause: overlay JSX was outside component return. Moved existing overlay into returned fragment. Checkpoint `CHECKPOINTS/CHANGES/2026-10-04-workforce-pos-camera-modal-render.md`.\n\n## 04/10/2026 — Archive structural redesign to approved mockup · AWAITING CI / VISUAL PASS

## 04/10/2026 — Archive structural redesign to approved mockup · AWAITING CI / VISUAL PASS

- Changed the real InventoryArchivePanel JSX structure: item count + page navigation now live in the results header; page-size control moved into the bottom action bar; actions grouped cleanly. Styling updated to match the approved mockup. No inventory business logic changed.
- Final PASS requires LIVE deploy and user visual confirmation.

## 04/10/2026 — Approved production Archive visual polish · AWAITING CI / VISUAL PASS

- Applied the user-approved navy/teal visual design directly to the verified production Archive screen: cleaner panels/filters, stronger table hierarchy, clearer edit/selection states and polished action bar. Functionality unchanged.
- Final PASS requires LIVE deploy and user visual confirmation.

## 03/10/2026 — Verified production Archive legibility · AWAITING CI

- Screenshot-matched production screen uses inventory-archive.css. Increased actual Archive header/row/filter/action typography and touch targets; widened table columns to prevent cramped 10–11px rendering.
- Visual PASS requires user confirmation after LIVE deploy.

## 03/10/2026 — Production UI route verification / visible legibility fix · AWAITING CI

- Verified real path: entry.jsx → CommerceLauncher → KioskStyleProductCenterWithStock → KioskStyleProductCenter → OwnerProductCenter for opening full product workspace.
- Added a production-visible legibility layer directly to kiosk-style-backoffice.css so the actual KioskStyle route has large readable controls, rows, tabs and product-card fields.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-production-route-ui-fix.md`.

## 03/10/2026 — TODAY-09 Owner store page simplification · AWAITING CI

- Owner store landing view simplified: RBS and detailed transactions moved behind large clear action tiles; Owner/Manager payment quick actions remain directly visible alongside the cash/shift area. Large legible typography applied. Business logic unchanged.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-owner-store-page.md`.

## 03/10/2026 — TODAY-08 Commercial Modules layout · AWAITING CI

- POS removed from redundant commercial module navigation. Module cards now use compact responsive 3-column layout (2 tablet / 1 mobile), with large legible typography and touch-friendly navigation.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-modules-layout.md`.

## 03/10/2026 — TODAY-07 Inventory 2.0 unknown barcode · AWAITING CI

- Mobile/tablet unknown barcode now offers attach-to-existing or new-product path with large touch UI. Existing-product search is company/store scoped; duplicate barcode ownership is blocked. Inventory return context is preserved for new-product continuation.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-inventory-unknown-barcode.md`.

## 03/10/2026 — TODAY-06 Excel / Barcode UI · AWAITING CI

- Καθαρός διαχωρισμός Barcode και Excel, μεγάλα ευδιάκριτα controls, scanner/touch-first barcode input και εμφανές Excel upload. Business logic αμετάβλητο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-excel-barcode-ui.md`.

## 03/10/2026 — TODAY-05 Offers UI · AWAITING CI

- Εγκεκριμένη καθαρή εμφάνιση Προσφορών με μεγάλα/ευδιάκριτα controls, μεγαλύτερη αναζήτηση και λίστα προϊόντων, καθαρές ημερομηνίες/καταστήματα και εμφανή σύνοψη επιλογών. Business logic αμετάβλητο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-offers-ui.md`.

## 03/10/2026 — TODAY-04 Mass price change UI · AWAITING CI

- Εγκεκριμένη ροή: 1 Προϊόντα → 2 Καταστήματα → 3 Ενέργεια → 4 Τιμή/ποσοστό, με μεγάλη γραμματοσειρά/controls και εμφανή σύνοψη πλήθους αλλαγών πριν την εφαρμογή. Business logic αμετάβλητο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-bulk-price-ui.md`.

## 03/10/2026 — TODAY-03 Product Management legibility refresh · AWAITING CI

- Εφαρμόζεται ο εγκεκριμένος γενικός κανόνας: μεγάλα/ευδιάκριτα γράμματα, μεγάλα touch-friendly tabs, κουμπιά και πεδία στην Κεντρική Διαχείριση προϊόντων. Δεν αλλάζει business logic.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-product-management-legibility.md`.

## 03/10/2026 — TODAY-02 VAT Department product editing · AWAITING CI

- Από «Είδη τμήματος ΦΠΑ» το μολύβι ανοίγει επεξεργασία της πραγματικής καρτέλας προϊόντος και μετά την αποθήκευση επιστρέφει στην ίδια σελίδα/τμήμα. Δεν αλλάζει αυτόματα το VAT department από category.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-vat-department-product-edit.md`.

## 03/10/2026 — Larger card-terminal selector · AWAITING CI

- TODAY-01 claimed by current ChatGPT page. EFTPOS/card-terminal picker enlarged with large touch targets and responsive mobile layout. No RBS/CAPDriver/payment-routing behavior changed.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-card-terminal-picker-large-ui.md`.

## 03/10/2026 — RBS checkout itemSummary runtime fix · AWAITING CI

- With regclass errors cleared and Writer ONLINE, controlled 7UP €1.20 reached checkout but failed before Writer claim with ReferenceError: Cannot access 'itemSummary' before initialization at store-pos.js. RBS request snapshot now copies the already-resolved item summary and uses the final summary totals. No fiscal mapping/protocol change. No physical retry until green CI + exact deploy + clean logs.

## 03/10/2026 — Startup regclass cleanup · AWAITING CI

- After runtime reconciliation fix became LIVE, remaining regclass log errors were isolated to startup/repair helpers: online-transaction-actor-fix, repair-kat009-duplicate-sale and kat-online-ordering-bootstrap. All their to_regclass probes now cast to TEXT. These errors were startup maintenance paths, but production must be clean before next fiscal retest.

## 03/10/2026 — Runtime store-transactions regclass · AWAITING CI

- Root cause of the post-deploy recurrence found: the previous patch script was corrected, but the generated runtime file server/src/routes/store-transactions.js still contained the uncased OnlineOrder to_regclass query. Runtime route now casts to TEXT directly. No physical retest until CI + exact deploy + clean logs.

## 03/10/2026 — RBS follow-up: online reconciliation regclass · AWAITING CI

- After exact Render LIVE of 88def886, controlled 7UP €1.20 still failed before Writer claim; C:\\capture remained clean. Production logs identified the remaining Prisma regclass failure specifically in online shift reconciliation. Fixed the OnlineOrder existence probe to CAST(to_regclass(... ) AS TEXT). No fiscal mappings/Writer/CAPDriver settings changed. No more physical retries until green CI + exact deploy.

## 03/10/2026 — RBS CAP Driver v1 · production regclass fix · AWAITING CI

- KAT controlled cash test used 7UP 330ML, €1.20, confirmed VAT code 42 → register department 2 → 13%. POS returned internal error; cart remained open, no receipt printed.
- Writer stayed ONLINE. C:\\capture contained only CapDriverSVC_log; writer.log contained only WRITER_START, with no REQUEST_CLAIMED/REQUEST_WRITTEN/REQUEST_UNCERTAIN. Therefore no fiscal request reached the Writer/CAPDriver in this attempt.
- Render production logs around the attempt show Prisma failing to deserialize PostgreSQL regclass values. PR #1645 changes table-existence probes in store-pos.js to return TEXT to Prisma. No CAPDriver/AURORA/Writer/VAT/payment mapping changed.
- CI #37100955025 failed only checkpoint policy because the code commit did not include ACTIVE + a new CHANGES checkpoint. Windows CAPDriver parse/smoke job passed. Do not perform another physical sale until fresh CI passes, merge/deploy is exact, and production logs are checked.

## Workforce — POS camera QR scanner, AWAITING CI / DEPLOY / PHYSICAL TEST 02/10/2026\n\n- Mobile employee QR is visible; Store Mode «Κάρτα» previously supported only hardware scanner input. Added explicit camera QR scan using existing ZXing while preserving USB scanner and existing card-login backend. Checkpoint `CHECKPOINTS/CHANGES/2026-10-02-workforce-pos-camera-qr.md`.\n\n## Workforce — mobile PIN PASS / QR store-context fix AWAITING CI 01/10/2026\n\n- Production mobile login LAB POS 2 PASS; QR GET was rejected by STORE_MODE middleware because GET lacked explicit store context. Send session storeId as query and resolve it in requireStoreModule; entitlement remains enforced. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-store-context.md`.\n\n## Workforce — mobile PIN numeric validation root cause, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production message «Ελέγξτε τα στοιχεία εισόδου» traced to mobile-only Zod regex escaping; ordinary numeric PINs were rejected before bcrypt. Fixed to same 4–8 digit regex as normal POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-regex.md`.\n\n## Workforce — mobile PIN 401 routing fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- `entry.jsx` reloaded `/store` on every 401, hiding the actual mobile-pin response. Employee-card mobile login now handles its own 401; normal Store/POS session reset unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-401.md`.\n\n## Workforce — employee-card mobile login UI, AWAITING CI / DEPLOY / USER PHONE RETEST 01/10/2026\n\n- Mobile invitation showed full POS login. `employee-card=1` now gets compact «Η κάρτα μου» PIN-only UI; normal POS unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-login-ui.md`.\n\n## Workforce — stable invitation share modal, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Desktop native share άνοιξε στιγμιαία και έκλεισε μετά το 500 fix. Προστίθεται σταθερό MyWorkStation modal με Αντιγραφή/WhatsApp/Viber/Κοινοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.\n\n## Workforce — mobile invitation 500 fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production USER test του #1598 απέτυχε στο «Αποστολή εφαρμογής». Διορθώθηκε block-scope `legacyEmployeeId` στο work-card response χωρίς αλλαγή QR/PIN/attendance/POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n## Workforce — mobile employee card, AWAITING CI / DEPLOY / LAB 01/10/2026\n\n- PR #1598 / `agent/workforce-mobile-card-20261001`: «Αποστολή εφαρμογής» + απομονωμένο mobile PIN login + «Η κάρτα μου» με υπάρχον Workforce QR. Δεν δημιουργεί POS session και δεν αλλάζει attendance IN/OUT. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

## 02/10/2026 — Κεντρική επιλογή Τμήματος ΦΠΑ ανά προϊόν · MERGED / CI PASS / RENDER LIVE

- Ο κανόνας είναι επιλογή Τμήματος ΦΠΑ πάνω στο προϊόν, όπως στο Kiosk Manager. Η κατηγορία προϊόντος δεν επιλέγει ούτε αλλάζει τμήμα/συντελεστή. Η οθόνη εμφανίζει και το «Τμήμα ταμειακής» για να επιλέγεται το σωστό mapping.
- Η ομαδική αλλαγή τμήματος επαληθεύει ότι ο ήδη αποθηκευμένος συντελεστής προϊόντος ταιριάζει με το επιλεγμένο τμήμα· σε ασυμφωνία απορρίπτεται χωρίς αλλαγή. Η λειτουργία ενημερώνει μόνο `vatDepartmentId`, ποτέ `vatRate`.
- PR #1642 merged στο `main` ως `511c72c92da7ddddafbe9ce2032301ece730e9bc`; CI #4131 PASS. Το Render deploy `dep-db011du0tbcc73fo5pr0` επιβεβαιώθηκε `live`· νεότερο deploy του descendant `eb7e71d` περιλαμβάνει το fix και βρίσκεται σε εξέλιξη. Δεν άλλαξαν live προϊόντα ή ρυθμίσεις KAT/Kiosk Manager/RBS/CAP Driver/EFTPOS/Windows. Το προηγούμενο €1,20 παραμένει προς συμφωνία· μην επαναληφθεί συναλλαγή/εκτύπωση έως τότε. Αναλυτικό checkpoint: `CHECKPOINTS/CHANGES/2026-10-02-rbs-capdriver-v1-operator-confirm.md`.

## Workforce — mobile PIN PASS / QR store-context fix AWAITING CI 01/10/2026\n\n- Production mobile login LAB POS 2 PASS; QR GET was rejected by STORE_MODE middleware because GET lacked explicit store context. Send session storeId as query and resolve it in requireStoreModule; entitlement remains enforced. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-store-context.md`.\n\n## Workforce — mobile PIN numeric validation root cause, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production message «Ελέγξτε τα στοιχεία εισόδου» traced to mobile-only Zod regex escaping; ordinary numeric PINs were rejected before bcrypt. Fixed to same 4–8 digit regex as normal POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-regex.md`.\n\n## Workforce — mobile PIN 401 routing fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- `entry.jsx` reloaded `/store` on every 401, hiding the actual mobile-pin response. Employee-card mobile login now handles its own 401; normal Store/POS session reset unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-401.md`.\n\n## Workforce — employee-card mobile login UI, AWAITING CI / DEPLOY / USER PHONE RETEST 01/10/2026\n\n- Mobile invitation showed full POS login. `employee-card=1` now gets compact «Η κάρτα μου» PIN-only UI; normal POS unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-login-ui.md`.\n\n## Workforce — stable invitation share modal, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Desktop native share άνοιξε στιγμιαία και έκλεισε μετά το 500 fix. Προστίθεται σταθερό MyWorkStation modal με Αντιγραφή/WhatsApp/Viber/Κοινοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.\n\n## Workforce — mobile invitation 500 fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production USER test του #1598 απέτυχε στο «Αποστολή εφαρμογής». Διορθώθηκε block-scope `legacyEmployeeId` στο work-card response χωρίς αλλαγή QR/PIN/attendance/POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n## Workforce — mobile employee card, AWAITING CI / DEPLOY / LAB 01/10/2026\n\n- PR #1598 / `agent/workforce-mobile-card-20261001`: «Αποστολή εφαρμογής» + απομονωμένο mobile PIN login + «Η κάρτα μου» με υπάρχον Workforce QR. Δεν δημιουργεί POS session και δεν αλλάζει attendance IN/OUT. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

## RBS CAP Driver v1 — LIVE TEST FAILED / VAT FIX OPEN / WRITER SAFETY LOCAL PASS (02/10/2026)

- MyWorkStation POS showed Coca-Cola 500 ml, 13% VAT, €1.20. Owner pressed **Μετρητά** once; generic internal error; **no receipt printed**. Do not retry, resend, reprint, or duplicate; owner has left KAT.
- KAT Windows `CapDriverSVC` was Running, but `C:\\capture\\Xcommand.txt` was absent. Visible CAP log activity was from Kiosk Manager, not proof of this MyWorkStation dispatch. Root cause remains unknown; evidence does not establish whether dispatch reached the writer.
- Pairing was performed; do not copy/store the one-time secret. Saved Fiscal/EFTPOS mapping is separate from CAP Driver pairing/delivery and is not proof of a receipt.
- PR #1632 is merged at `874c6bd2e0c8efcf578e6ee2a98026d8057c5c6f`; CI #4097/#4099/#4107 passed and Render deployment `dep-davqli0u01pc73fpjphg` was verified. This is **not** physical acceptance.
- **VAT category correction:** PR #1635 adds company-scoped category → VAT-department mapping; POS will take fiscal register department from product category and reject mixed-rate category mappings without changing product VAT. CI #4117 failed the checkpoint policy gate before application tests; Windows PowerShell parse/writer smoke passed. Required docs are now in reopened PR #1635, but no fresh run is visible for head `63653f898d09f283e174e25107cabc5381a32b1e`. Do not merge/deploy until a full CI run passes. No live mappings changed.
- **Writer safety fix:** this branch requires a real authenticated writer poll within 15 seconds, blocks checkout while a paired writer is offline, quarantines unclaimed requests after 60 seconds, adds non-claiming `Test-Connection.ps1`, durable local diagnostics and visible ONLINE/OFFLINE status. Focused CAP tests 9/9, full server suite 1796 PASS / 1 SKIP and client build PASS locally. CI #4126 parsed all scripts and executed pairing, safe connection, one request write and dispatch acknowledgement, but its final assertion used a child-script-scoped counter and failed at 0; the isolated test counter is now global/namespaced with cleanup. Fresh CI, merge, deploy and physical acceptance remain pending.
- Next: merge/deploy only after full green CI. At KAT, reconcile the €1.20 attempt first and inspect dispatch/writer evidence read-only. Then verify the category-to-department mapping, run `Test-Connection.ps1`, start the writer, wait for `WRITER ONLINE`, and perform one separately identified controlled cash test. No retry while outcome is uncertain.
- Full evidence and exact steps: `CHECKPOINTS/CHANGES/2026-10-02-rbs-capdriver-v1-operator-confirm.md`.

---

## Workforce — mobile PIN numeric validation root cause, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production message «Ελέγξτε τα στοιχεία εισόδου» traced to mobile-only Zod regex escaping; ordinary numeric PINs were rejected before bcrypt. Fixed to same 4–8 digit regex as normal POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-regex.md`.\n\n## Workforce — mobile PIN 401 routing fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- `entry.jsx` reloaded `/store` on every 401, hiding the actual mobile-pin response. Employee-card mobile login now handles its own 401; normal Store/POS session reset unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-401.md`.\n\n## Workforce — employee-card mobile login UI, AWAITING CI / DEPLOY / USER PHONE RETEST 01/10/2026\n\n- Mobile invitation showed full POS login. `employee-card=1` now gets compact «Η κάρτα μου» PIN-only UI; normal POS unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-login-ui.md`.\n\n## Workforce — stable invitation share modal, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Desktop native share άνοιξε στιγμιαία και έκλεισε μετά το 500 fix. Προστίθεται σταθερό MyWorkStation modal με Αντιγραφή/WhatsApp/Viber/Κοινοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.\n\n## Workforce — mobile invitation 500 fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production USER test του #1598 απέτυχε στο «Αποστολή εφαρμογής». Διορθώθηκε block-scope `legacyEmployeeId` στο work-card response χωρίς αλλαγή QR/PIN/attendance/POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n## Workforce — mobile employee card, AWAITING CI / DEPLOY / LAB 01/10/2026\n\n- PR #1598 / `agent/workforce-mobile-card-20261001`: «Αποστολή εφαρμογής» + απομονωμένο mobile PIN login + «Η κάρτα μου» με υπάρχον Workforce QR. Δεν δημιουργεί POS session και δεν αλλάζει attendance IN/OUT. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

- Φυσικό LAB POS2 απέρριψε COFFEE UNION/ΤΔΑ0012183 **344,54 €** έναντι διαθέσιμων **344,53 €** με σαφές μήνυμα. Μετά το τιμολόγιο 344,53 €, owner queue 0, LAB εικονική τράπεζα −43,62 €/αναμονή 0, POS1 1 κίνηση/0 έξοδα, POS2 16 κινήσεις/0,20 € έξοδα και ΚΑΤ 22,36 € ίδια. PASS μόνο client-side UI και απομόνωση· API/race, απόκλιση αποδεικτικού, τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## Gate 5 — G5-P09 UI ποσού και πληκτρολογίου, περιορισμένο LAB PASS 25/09/2026

- PR #1250 CI #3165 πράσινο, exact Render `a3a1a040`: στο BackOffice LAB viewport 1363×936 το παράθυρο x84–1264 περιέχει πλήρως το ποσό x985–1215 και το κουμπί πληκτρολογίου x1177–1211. Οπτικός έλεγχος σε δύο ανοικτά τιμολόγια COFFEE UNION, χωρίς νέα πληρωμή. Desktop UI PASS· μικρότερη οθόνη/φυσικό POS και χρήση πλήρους πληκτρολογίου NOT TESTED. G5-P09 οικονομικό περιορισμένο PASS, συνολικό Gate 5 OPEN.

## Gate 5 — G5-P09 ολική εικονική τραπεζική πληρωμή ιδιοκτήτη, περιορισμένο LAB PASS · UI AWAITING LAB 25/09/2026

- [x] Render `55dbbf3`, FRESH/ΒΒ 6529 46,92→0 €, LAB εικονική τράπεζα επιβεβαιωμένη 3,30→−43,62 €, αναμονή/ουρά 0, POS1 1 κίνηση/0 έξοδα, POS2 16 κινήσεις/0,20 € έξοδα και ΚΑΤ 22,36 € αμετάβλητα. Audit αυτόματη επιβεβαίωση 13:19 χωρίς δεύτερη έγκριση. Αρνητικό LAB bank balance ως περιορισμός· κανένα πραγματικό έμβασμα. Στενή φόρμα/πληκτρολόγιο εκτός παραθύρου: bounded UI fix, frontend build PASS, CI/deploy και οπτικό LAB **AWAITING LAB**. Διπλή/υπερπληρωμή, mismatch, τελική συμφωνία OPEN. `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## Gate 5 — G5-P08 κεντρικό Audit ακύρωσης, περιορισμένο LAB PASS 25/09/2026

- PR #1243 CI #3147 πράσινο, Render `94ae647`: παλιά ακύρωση FRESH 46,92 € ορατή μία φορά στα Συμβάντα 12:36 Αθήνας, LAB. Εικονική τράπεζα LAB 3,30 € επιβεβαιωμένο/0 € αναμονή, ΚΑΤ 22,36 € ίδιο. Το όνομα χειριστή εμφανίζεται ως τεχνικό ID, όριο αναγνωσιμότητας. Καμία νέα οικονομική πράξη. Ολική εξόφληση και τελική συμφωνία OPEN.

## Gate 5 — G5-P08 ορατό Audit ακύρωσης, AWAITING LAB 25/09/2026

- Νέα ανάγνωση LAB τράπεζας 3,30 € λογιστικό/επιβεβαιωμένο, 0 € αναμονή· ΚΑΤ 22,36 € ίδιο. Το συμβάν `SUPPLIER_SETTLEMENT_CANCELLED` καταγράφεται από API αλλά το κεντρικό Audit δεν το εμφάνιζε επειδή έλειπε από το φίλτρο τύπων. Προστίθεται προβολή/ετικέτα· CI/deploy και LAB ανάγνωση του υπάρχοντος συμβάντος εκκρεμούν. Δεν γίνεται νέα πληρωμή. Το περιορισμένο PASS ακύρωσης παραμένει, συνολικό Gate 5 OPEN.

## Gate 5 — G5-P08 ακύρωση εκκρεμούς, περιορισμένο LAB PASS 25/09/2026

- Μετά PR #1237/#1241, πράσινα CI #3135/#3143 και ακριβές Render `90ec8b7`: μία ακύρωση της λανθασμένης CASH_SHIFT FRESH/ΒΒ 6529 46,92 € επανέφερε POS2 **17→16 ενεργές κινήσεις**, έξοδα **47,12→0,20 €**, ουρά **0 €**, κεντρικές δεσμεύσεις **0 €**, οφειλή ΒΒ 6529 **46,92 €**. Πωλήσεις POS2 7,00 € μετρητά/0,50 € κάρτες/0 IRIS αμετάβλητες. POS1 είχε κλείσει από Gate4· τράπεζα και ακριβές audit ακύρωσης **NOT TESTED**. Η αρχική λανθασμένη μέθοδος παραμένει ιστορικό FAIL. Ολική εξόφληση και τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P07 έξοδο χειριστή POS2, περιορισμένο LAB PASS 25/09/2026

- Μία εικονική δαπάνη 0,10 € από ενεργή βάρδια POS2 με αρχικό PDF στις 11:03: 15→16 κινήσεις, έξοδα 0,10→0,20 € ήδη σε αναμονή, μία ουρά 0,10 €. Μία έγκριση ιδιοκτήτη 11:11: ουρά 0, ενεργή `#pay_5327…`, δύο διακριτά audit γεγονότα υποβολής/έγκρισης. Πωλήσεις POS2 7,50 €, LAB τράπεζα 3,30 €, POS1 και ΚΑΤ 22,36 € αμετάβλητα. Συνολικό Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P06 λοιπό έξοδο ιδιοκτήτη, περιορισμένο LAB PASS 25/09/2026

- PR #1222/CI #3095, deployed `352f636a`: μία BackOffice «Λοιπά Έξοδα» ιδιοκτήτη 0,10 € `G5-P06 VIRTUAL LAB` στις 10:37, αναφορά `#pay_3ffd…`, τράπεζα LAB λογιστικό/επιβεβαιωμένο 3,40→3,30 €, αναμονή και ουρά 0, POS2 14 κινήσεις/0,10 € έξοδα ίδια, POS1 1/0 ίδιο, ΚΑΤ 22,36 € ίδιο. Μόνο η πράξη ιδιοκτήτη χωρίς δεύτερη έγκριση PASS· POS δαπάνη/τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P05 κατάθεση με αρχικό PDF, περιορισμένο LAB PASS 25/09/2026

- Μία κατάθεση 0,10 € LAB POS 2 με αρχικό PDF: 13→14 κινήσεις, PENDING_REVIEW, LAB λογιστικό 3,30→3,40 €, αναμονή 0→0,10 €, μετά μία έγκριση ιδιοκτήτη στις 10:04, επιβεβαιωμένα 3,30→3,40 €, αναμονή 0, audit διαφορά 0. POS 1/ΚΑΤ ίδια. Γενικό «Ανανέωση» BackOffice δεν φόρτωνε ουρά ιδιοκτήτη· UI fix στο παρόν PR, επανέλεγχος μετά deploy. Gate 5 συνολικά OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P04 εικονική κατάθεση, περιορισμένο LAB PASS 25/09/2026

- LAB POS 2: μία κατάθεση 0,10 € χωρίς αρχικό αποδεικτικό, μετά ίδιο PDF 0,10 € και αυτόματη αντιστοίχιση 09:25. Εικονική LAB τράπεζα επιβεβαιωμένα 3,20→3,30 €, αναμονή 0,10→0,00 €· POS 2 κινήσεις 12→13, πωλήσεις/έξοδα αμετάβλητα, POS 1 και ΚΑΤ αμετάβλητα. Κατάθεση με αρχικό PDF, απόκλιση, φυσικό συρτάρι και όλο το Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

# ACTIVE CHECKPOINT

- Ενεργή αλλαγή: 2026-09-22 — FRESH SNACK: διόρθωση του κεντρικού προφίλ στο πραγματικό ΑΦΜ `999162880`, ώστε να ενεργοποιείται η ένωση των 18 μισών γραμμών σε 9 προϊόντα.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-fresh-snack-correct-tax-id.md`

- Ενεργή αλλαγή: 2026-09-22 — FRESH SNACK: ένωση κάθε τυπωμένης γραμμής προϊόντος με την αμέσως επόμενη αριθμητική συνέχεια, με υποχρεωτική συμφωνία γραμμών και footer πριν γίνει αποδεκτή.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-fresh-snack-wrapped-line-pairs.md`

- Ενεργή αλλαγή: 2026-09-22 — POS: η τυπωμένη μονάδα `pc` θεωρείται τεμάχιο και δεν πολλαπλασιάζεται ξανά από `8TMX/9TMX/10TMX` της περιγραφής.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-pos-pc-quantity-no-double-conversion.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: η αλλαγή ΦΠΑ ενημερώνει άμεσα τη γραμμή, τα σύνολα και την επαγγελματική προβολή.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-vat-live-update.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: popup προτάσεων στα πεδία «Μονάδα τιμολογίου» και «Μονάδα stock», με διατήρηση ελεύθερης πληκτρολόγησης.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-unit-suggestions.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: ασφαλής αναγνώριση κανονικού τιμολογίου πώλησης, χωρίς ψευδή μετατροπή σε πιστωτικό από αρνητικό προηγούμενο υπόλοιπο ή άσχετη αναφορά επιστροφής.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-explicit-document-type.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: επαναφορά πριν από τα λανθασμένα crops και σύνδεση της ίδιας δοκιμασμένης προεπεξεργασίας φωτογραφίας που χρησιμοποιεί το POS.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-rollback-crop-reader.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: ο πίνακας προσαρμόζεται στο πλάτος οθόνης χωρίς δεξιά–αριστερά.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-no-horizontal-scroll.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: Enter → επόμενο κελί, πλήρης κάθετη προβολή και χρωματισμός επιβεβαιωμένων γραμμών.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-review-navigation.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: η παλιά λίστα «Εκκρεμή Barcodes» κρυφή στην αρχική φόρτωση και διαθέσιμη μόνο από το κουμπί.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-collapse-pending-barcodes.md`
- PR: #1060 — περιμένει πράσινο CI και merge.

- Ημερομηνία: 2026-09-14
- Εργασία: Gate 3 — πληρωμένο τιμολόγιο εμφανίζεται αμέσως στα Πρόχειρα BackOffice
- Κατάσταση: LAB `2612188`: αποθηκεύτηκε κεντρικό InvoiceSupplierReadingProfile για ΑΦΜ `998878583`, από το επιβεβαιωμένο checkpoint των 38 γραμμών / 608 τεμαχίων / `2.369,99 €`. Ο κανόνας κρατά μόνο τις θέσεις των στηλών λιανικής, μονάδας, ποσότητας και αγοράς· οι τιμές κάθε νέου τιμολογίου διαβάζονται αποκλειστικά από το δικό του πρωτότυπο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-paid-draft-before-ai.md`

## Κανόνες δοκιμής

- Η γρήγορη φόρμα τιμολογίου κλείνει άμεσα ώστε να συνεχίζεται η πώληση και η λίστα Παραγγελίες & Αγορές δείχνει το νέο πρόχειρο.
- Η ένδειξη στην πράσινη κεφαλίδα δείχνει μόνο την κατάσταση της παραλαβής: επεξεργασία, επιτυχία BackOffice ή αποτυχία.
- Σε επανάληψη αναγνωρίζεται και επαναχρησιμοποιείται η υπάρχουσα πληρωμή· δεν γίνεται δεύτερη χρέωση.
- Stock και οριστικοποίηση παραμένουν BackOffice-only.

## Επόμενο βήμα

1. Πράσινο CI, merge και deploy της δημιουργίας πρόχειρου πριν την πλήρη AI ανάγνωση.
2. LAB: οι δύο σελίδες του `2612188` διαβάζονται ξανά σε μία ενιαία προεπισκόπηση με 38 γραμμές, 608 τεμάχια και `2.369,99 €`, σωστή λιανική/αγορά/ποσότητα και χωρίς νέα πληρωμή.
3. Επιβεβαίωση ότι η πλήρης ανάγνωση συμπληρώνει αυτόματα τις γραμμές στο ίδιο πρόχειρο· καμία δεύτερη πληρωμή, stock κίνηση ή οριστικοποίηση.

## Workforce V2 — καρτέλες Προγράμματος & AI draft version — 2026-09-23

- Κατάσταση: σε CI πριν από merge.
- Το Πρόγραμμα & Άδειες χωρίζεται σε AI Πρόγραμμα, Βάρδιες, Άδειες & Ρεπό και Audit ώστε να αφαιρεθεί το μεγάλο scroll.
- Τα μηνύματα εμφανίζονται κάτω από την ενεργή πλοήγηση και η επιτυχής AI αποθήκευση μεταφέρει στις Βάρδιες.
- Η AI αποθήκευση δημιουργεί την επόμενη έκδοση της εβδομάδας και δεν συγκρούεται πλέον με υπάρχουσα έκδοση 1.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-section-tabs-ai-version.md`

## Workforce V2 — εύκολη ροή και καθαρή εβδομάδα — 2026-09-23

- Κατάσταση: σε CI πριν από merge.
- Η αναλυτική εβδομάδα εμφανίζεται χωρίς επικαλύψεις, με responsive κάρτες ανά ημέρα και βάρδια.
- Οι καθημερινές ενέργειες χρησιμοποιούν αυτόματη αιτιολογία Audit· η δημοσίευση έχει μία απλή τελική επιβεβαίωση και ανοίγει την τελική εβδομάδα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`

- Διόρθωση δεύτερης δοκιμής Workforce: μεγαλύτερο modal και αυστηρή απομόνωση κάθε βάρδιας σε ξεχωριστή σειρά, χωρίς επικαλύψεις.

## Workforce V2 — Πρόγραμμα βαρδιών ΟΛΟΚΛΗΡΩΘΗΚΕ — 2026-09-23

- Κατάσταση: **PRODUCTION PASS / USER VISUAL PASS**.
- Ολοκληρώθηκε η ροή AI Πρόγραμμα → Πρόχειρο → Έλεγχος → Προεπισκόπηση → Έγκριση → Δημοσίευση.
- Ολοκληρώθηκαν οι ενότητες Βάρδιες, Άδειες & Ρεπό και Audit με χωριστή πλοήγηση.
- Οι συνηθισμένες ενέργειες γράφουν αυτόματη αιτιολογία στο Audit χωρίς επαναλαμβανόμενα textarea· χειροκίνητη αιτιολογία μένει στις κρίσιμες ενέργειες.
- Μετά τη δημοσίευση ανοίγει αυτόματα η τελική Αναλυτική εβδομάδα.
- Το modal είναι σχεδόν πλήρους οθόνης και κάθε ημέρα/βάρδια εμφανίζεται καθαρά, χωρίς επικαλύψεις.
- Ο χρήστης επιβεβαίωσε οπτικά την τελική παραγωγική προβολή.
- Production revision της τελικής οπτικής διόρθωσης: `5eb06f2c307029d044efe5cc8ea732b425c33154` (PR #1100, πράσινο CI #2813).
- **Να μη γίνει ξανά η εργασία του Προγράμματος βαρδιών. Επόμενο Workforce βήμα: Παρουσίες / Κάρτα εργασίας.**
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`.

## Workforce V2 — Παρουσίες / Κάρτα εργασίας από POS — 2026-09-23

- Κατάσταση: LOCAL IMPLEMENTATION / AWAITING CI + LAB.
- Το άνοιγμα και κλείσιμο ταμειακής βάρδιας δημιουργεί και κλείνει αυτόματα την παρουσία του συνδεδεμένου εργαζομένου.
- Η υπέρβαση άνω των 8 ωρών απαιτεί έγκριση· καθυστέρηση/πρόωρη αποχώρηση/υπερωρία καταγράφονται για έλεγχο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-attendance.md`.

## Workforce V2 — κάρτα συναδέλφων από POS — 2026-09-23

- Κατάσταση: **AWAITING CI / LAB**.
- Νέο μικρό κουμπί «Κάρτα εργασίας» για προσέλευση/αποχώρηση μη ταμιών με προσωπική κάρτα, χωρίς αλλαγή χειριστή.
- Τα βοηθητικά κουμπιά POS έγιναν συμπαγή ώστε να μη σκεπάζουν πίνακες και modals.
- Η εργασία του Προγράμματος βαρδιών παραμένει ολοκληρωμένη και δεν επαναλαμβάνεται.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-colleague-card.md`.

## Workforce V2 — πρόγραμμα ανά εργαζόμενο — 2026-09-23

- Κατάσταση: **AWAITING CI / LAB**.
- Προστίθεται προβολή ανά εργαζόμενο με όλες τις ημερομηνίες, ώρες βάρδιας και εμφανές ΡΕΠΟ.
- Οι νέες δημοσιεύσεις θα στέλνονται στο Store Chat με την ίδια ομαδοποίηση.
- Η ολοκληρωμένη προβολή ανά ημέρα διατηρείται χωρίς αλλαγή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-schedule-by-employee.md`.

## Workforce V2 — εκτυπώσιμες κάρτες εργασίας — 2026-09-23

- Κατάσταση: **LOCAL PASS / AWAITING CI + LAB**.
- Δίπλα σε κάθε ενεργό εργαζόμενο του καταστήματος βάσης υπάρχει κουμπί «Εκτύπωση κάρτας».
- Η προεπισκόπηση είναι σε φυσικό μέγεθος κάρτας, χωρίς PIN ή άλλα ευαίσθητα στοιχεία, με Code 128 συμβατό με το υπάρχον POS.
- Η επανεκτύπωση κρατά τον ίδιο κωδικό και δεν αντικαθιστά σιωπηρά διαφορετική υπάρχουσα κάρτα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-printable-cards.md`.

## POS — σάρωση κάρτας εργασίας με κάμερα — 2026-09-23

- Κατάσταση: **LOCAL PASS / AWAITING CI + LAB**.
- Στην επιλογή «Κάρτα» προστέθηκε κουμπί «Σάρωση με κάμερα» για ανάγνωση του Code 128 από την κάμερα PC/tablet.
- Παραμένουν διαθέσιμα το κανονικό barcode scanner, η χειροκίνητη εισαγωγή και το προσωπικό PIN.
- Η κάμερα κλείνει μετά την αναγνώριση ή όταν κλείσει/αλλάξει η επιλογή του παραθύρου.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-attendance-camera-scan.md`.

## Gate 5 — G5-P03 LAB PASS με περιορισμένο scope, 25/09/2026

- Χειριστής LAB-POS-02: μερική πληρωμή FRESH DELICACIES / ΒΒ 6529, 0,10 € μετρητά ενεργής βάρδιας και PDF· μία εκκρεμής έγκριση ιδιοκτήτη, κατόπιν μία επιβεβαίωση και μηδενισμός ουράς. Οφειλή 47,02→46,92 €, έξοδο POS 2 0,10 €, POS 1 και εικονική τράπεζα αμετάβλητα, Audit 08:46 με σωστό ΒΒ 6529. Χωριστή πώληση POS 2 0,90 € στις 08:33 εξηγεί την αύξηση των πωλήσεων μετρητών 3,80→4,70 €.
- Κατάσταση: μόνο αυτό το σενάριο PASS· συνολικό Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`, κεντρική λίστα `docs/roadmap/PENDING_WORK.md`.
## Gate 5 — G5-P08 λάθος μέθοδος πληρωμής, LAB FAIL / AWAITING LAB διόρθωση 25/09/2026

- Μία ολική πληρωμή FRESH DELICACIES / ΒΒ 6529 **46,92 €** στο LAB POS2 καταχωρίστηκε στις 11:52 Αθήνας ως **μετρητά ενεργής βάρδιας**, ενώ το συνθετικό αποδεικτικό προέβλεπε τραπεζική μεταφορά. POS2 16→17 κινήσεις, έξοδα 0,20→47,12 € ήδη εν αναμονή, πωλήσεις 7,50 € ίδιες· POS1 1 κίνηση / 1,00 € / 0 έξοδα ίδιο. Μία εκκρεμής έγκριση 46,92 €. **Μη γίνει επιβεβαίωση ή δεύτερη πληρωμή.** Η υπάρχουσα «Απόκλιση» στο API μπορούσε να επιβεβαιώσει λανθασμένα. Διόρθωση σε εξέλιξη: διακριτή κατάσταση απόκλισης, ακύρωση εκκρεμούς με αναστροφή μίας κίνησης, εμφανής τρόπος πληρωμής στην ουρά. Αποδοχή μόνο με πράσινο CI, ακριβές deploy, μία ακύρωση και μετρημένη αποκατάσταση βάρδιας/οφειλής/ουράς, μετά φρέσκια νέα προετοιμασία. Το συνολικό Gate 5 παραμένει OPEN. Αναλυτικό checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.
## Gate 5 — G5-P08 ακύρωση με ασυμφωνία προβολής, LAB FAIL / AWAITING LAB 25/09/2026

- Deploy `148c6b1` και μία ακύρωση εκκρεμούς FRESH/ΒΒ 6529 46,92 € από τον ιδιοκτήτη: owner queue 1→0, Platform Admin δεσμεύσεις 46,92→0 €. BackOffice POS2 **μένει 47,12 € έξοδα / 17 κινήσεις**, επειδή η προβολή μετρά τις αναστραμμένες συναλλαγές `recent`, ενώ το backend `totals()` τις εξαιρεί. Διορθώνεται το frontend, νέα CI/deploy/LAB επαλήθευση εκκρεμούν. POS1 έκλεισε σε παράλληλη Gate4 εργασία, όχι μάρτυρας ανοιχτής βάρδιας. Μη γίνει νέα πληρωμή ώσπου να επαληθευτούν οφειλή, βάρδια, audit και τράπεζα. Συνολικό Gate 5 OPEN.
## Gate 3 — προτεραιότητα βοηθού μετά την πληρωμή, 26/09/2026

- Νεότερη οδηγία ιδιοκτήτη: μία πληρωμή POS δημιουργεί ένα επεξεργάσιμο πρόχειρο με φωτογραφίες· η οθόνη δείχνει «Ανάγνωση από βοηθό». Ο βοηθός διαβάζει και διορθώνει το ίδιο πρόχειρο. Η πρώτη αυτόματη ανάγνωση γραμμών είναι χωριστή μελλοντική βελτίωση. PR #1364: αντικαθιστά το κόκκινο τεχνικό OCR diagnostic μόνο όταν το πρόχειρο έχει ήδη παραδοθεί· πραγματική αποτυχία παράδοσης παραμένει σφάλμα. CI/deploy/LAB **AWAITING**. Τα ιστορικά FAIL, η επαλήθευση 17 γραμμών ΜΑΝΤΖΗΛΑ και η ασφαλής τελική καταχώριση OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## TABLE_SERVICE — προϊόντα παρασκευής ανά πόστο — 27/09/2026

- Κατάσταση: **END-TO-END LAB PASS** για προϊόντα, τραπέζι, δύο πόστα, ετοιμασία και πληρωμή.
- Δημιουργήθηκαν στο LAB τα δοκιμαστικά `LAB ΚΑΦΕΣ ΔΟΚΙΜΗΣ` και `LAB ΤΟΣΤ ΔΟΚΙΜΗΣ`, με απόθεμα 0. Δεν έγινε πώληση, πληρωμή ή μεταβολή βάρδιας.
- PR #1414, CI #3598 και exact production revision `7dd85a751f940bf2b6a53dfd5404913d22555ab3` **PASS**.
- LAB readback: ο καφές αποθηκεύτηκε στο `ΚΑΦΕ` και το τοστ στην `ΚΟΥΖΙΝΑ`, και τα δύο ως προϊόντα παρασκευής με αυτόματη εκτύπωση.
- Μία παραγγελία Γύρου 1 στο `ΤΡΑΠΕΖΙ LAB 1` διαχωρίστηκε σε `ΚΑΦΕ 1` και `ΚΟΥΖΙΝΑ 1`, ολοκληρώθηκε ανά πόστο και πληρώθηκε μία φορά μετρητά. Πώληση `b408a720-967c-4f72-9862-be56bc2485fd`, 3,00 €. Βάρδια MAIN 0→3,00 € / 0→1 συναλλαγή, LAB-POS-02 αμετάβλητη, τοπική ουρά 0, stock καφέ και τοστ 0→-1.
- Αναλυτικό checkpoint: `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.
- Modifiers και ελεύθερη σημείωση είδους: **production LAB PASS** μετά τα PR #1428 και #1430· εμφανίστηκαν μαζί στην ουρά `ΚΑΦΕ` και το δελτίο ολοκληρώθηκε. Οικονομικά/stock αμετάβλητα, χωρίς πώληση ή πληρωμή. Αλλεργιογόνα ως first-class πεδίο παραμένουν OPEN.

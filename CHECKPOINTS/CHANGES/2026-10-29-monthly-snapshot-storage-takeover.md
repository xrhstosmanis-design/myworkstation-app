# D2 - Monthly inventory snapshot storage/history/recovery - owner-directed narrow takeover

29/10/2026 Europe/Athens. Status: ASSIGNED BEFORE SOURCE / NOT IMPLEMENTED / NOT TESTED. Base readc8891625f4b15d1ce5b4fbfa0b01b1c5dc633ca1; preserves incoming AI-wallet invoice-request claimPR3286 and central BackOffice sourcePR3280. Sole coordinating owner/branch: codex/central-monthly-snapshot-storage-20261029. Source begins only after this exact claim passes applicable CI and merges to main; no source changes are included here.

## Explicit owner direction and boundary

The central page asked: «Εγκρίνεις να αναλάβει αυτή η σελίδα το συγκεκριμένο σκέλος αποθήκευσης, ιστορικού και ανάκτησης;», explaining the existing ASSIGNED lock and linking AGENTS.md. The owner replied «ΕΓΚΡΙΝΩ». Therefore: ΑΝΑΛΗΨΗ ΑΠΟ feat/store-shifts-inventory-clear-20261018 / feat/store-lifecycle-central-execution-20261019 - ASSIGNED codex/central-monthly-snapshot-storage-20261029. This explicit owner-directed reassignment supersedes the prior assignment only for the new MonthlyInventorySnapshot storage/history/recovery slice. It does not pretend the previous page published a release or accept silence as consent. All remaining lifecycle and scheduler ownership stays retained.

The concrete technical proposal in CHECKPOINTS/CHANGES/2026-10-29-monthly-snapshot-storage-handoff-request.md is the baseline, now historical only as an unaccepted ownership request. This claim authorizes bounded source implementation and isolated native fixtures, not production DDL, enrollment, reset, deletion, restore, actual stock/financial posting, provider/email/scheduler activation or a paid resource. No installed schema, actual capture, stored snapshot or USER/LAB/manual PASS is claimed.

## Current evidence and invariants

D1 pure immutable format/date contract and C2 full internal invoice/pending reader are technically installed with exact PR/main CI, ordinary guard and independent root health recorded in their checkpoints. C2 source PR3281/maince5ec3a6b37c3844aa57298a88a787ed05ec1def passed exact mainCI40953041609:4606server+8backup/0FAIL/0SKIP including native1945/all7. Formal request/receipt PR3285 merged72c14e975f949efe8ae276032bc4e92a90bf9348. Fresh main016b15d also preserves central BackOffice access PR3280. Engineering CI is not USER/LAB acceptance. No previously accepted transaction is repeated for documentation.

Keep the unchanged D1 candidate candidateOnly:true/persisted:false/FORMAT_VALIDATED_ONLY inside exact stored candidate text. A separate trusted receipt follows admitted immutable insert and verified readback. Distinguish logical sourceHash/payloadHash from SHA256 of exact UTF8 stored bytes. Unique company/store/generation/issueMonth key; first success wins, duplicate returns verified existing row ALREADY_CAPTURED, no overwrite or empty placeholder. Bound exact candidate text to4MiB, preserve decimal strings and timestamp bytes. No generic audit/CASH payload reuse.

Two phases remain mandatory: bounded actual READ ONLY RR/Serializable source observation, then separate fresh authorized generation/maintenance/retired-fenced write using the existing reviewed lifecycle lock/CAS protocol. Missing generation/enrollment is not an automatic grant or fictitious generation0 lock. Reject generation/reset transition and authorization/license changes before write. Future capture source transaction must start at or after the fixed first-day07:00Athens slot; a pre-due held view finishing later is not a post-due snapshot. Source observation/storedAt/nominal schedule remain distinct, no fake backdating.

Preserve signed/unknown facts, complete counts, unknown primary dates and source limits; stock PACKAGE division must be exactly representable under existing D1 precision or hold/explicit existing MISSING/INVALID limitation, never implicit rounding. Stock source and capture coordinator need a separate exact before-source claim; this slice provides storage prerequisites only. No new UI/route/settings button is included.

## Exact public source/test allowance after green claim

Only necessary new-relation edits in these existing files are allowed; all unrelated bytes/behavior remain owned and protected:

- server/src/services/store-lifecycle-manifest.js
- server/src/services/store-lifecycle-application-links.js
- server/src/services/store-lifecycle-policy.js
- server/src/services/store-lifecycle-executor.js
- server/src/services/store-lifecycle-generation.js
- server/src/services/store-lifecycle-dependencies.js
- server/src/services/store-lifecycle-schema.js
- server/src/services/store-lifecycle-recovery.js
- server/src/services/store-lifecycle-recovery-stream.js
- server/src/services/store-lifecycle-recovery-proof.js
- server/test/ai-wallet-recovery-postgres.test.js
- server/test/store-lifecycle-manifest.test.js
- server/test/store-lifecycle-application-links.test.js
- server/test/store-lifecycle-executor.test.js
- server/test/store-lifecycle-generation.test.js
- server/test/store-lifecycle-dependencies.test.js
- server/test/store-lifecycle-schema.test.js
- server/test/store-lifecycle-recovery.test.js
- server/test/store-lifecycle-recovery-stream.test.js
- server/test/store-lifecycle-recovery-proof.test.js
- server/test/store-lifecycle-copy-roundtrip.test.js

New exact storage paths: server/src/services/monthly-inventory-snapshot-repository.js; server/src/services/monthly-inventory-snapshot-schema.js; server/test/monthly-inventory-snapshot-storage.test.js; server/test/monthly-inventory-snapshot-storage-postgres.test.js; server/test/monthly-inventory-snapshot-lifecycle-postgres.test.js. These are internal and unmounted; no runtime schema bootstrap, route/index wiring, production migration, scheduling or automatic capture. The schema module may define reviewed installation SQL for isolated tests/operator review, never silently execute it against production.

Exact same-root D1 amendment included here: server/src/services/monthly-inventory-snapshot-payload.js and server/test/monthly-inventory-snapshot-payload.test.js may expose and test the existing single canonical serialization/logical-hash verification contract for storage; preserve all existing candidate output, validation, hash projections, flags, decimal/date/resource bounds and tests. No duplicated canonical/hash algorithm or unrelated D1 behavior change. server/prisma/schema.prisma is excluded from this minimal raw-DDL/internal schema slice; any future Prisma change or other source path requires a named before-source amendment. The source PR updates its own checkpoint and active evidence; final technical receipt synchronizes registries/PDF without a global numbered/manual PASS.

Exact same-root C authorization amendment included here: server/src/services/monthly-invoice-audit.js may expose its existing persisted authorization core for the repository's fresh write authorization. Preserve existing public C GET, C2 response/RO-RR contract, classifiers and tests; no duplicate authorization policy. Repository storage takes its own fresh READ COMMITTED transaction and uses the existing enrolled lifecycle fence FOR SHARE/NOWAIT with exact generation checks. No ensure/enrollment/schema creation occurs at runtime. Its receipt must say FORMAT_VALIDATED_STORED_ONLY for the supplied validated candidate, never imply authentic complete source capture until a future stock/coordinator claim.

## Recovery inclusion and history policy

Phased installation is mandatory. Existing ops/backup/lifecycle/manifest.json and ops/backup/lifecycle/column-review.json remain BYTE-FOR-BYTE UNCHANGED in this increment: the live closed catalogue requires every known relation to exist, so adding an unprovisioned relation would disable current lifecycle operations. Their canonical activation and any production DDL require a separate coordinated rollout; this claim does not authorize either.

Exact NEW reviewed extension paths: ops/backup/lifecycle/monthly-inventory-snapshot-manifest.proposed.json and ops/backup/lifecycle/monthly-inventory-snapshot-column-review.proposed.json. They describe the full reviewed future catalogue including only the new MonthlyInventorySnapshot relation/columns/raw-ID classification/history exception and exact regenerated plan hash; preserve every baseline node/policy. Explicit unmounted installation and isolated native full/selective recovery tests use this proposed catalogue deliberately; default production lifecycle/worker catalogue selection remains unchanged. Existing ops/backup/lifecycle/worker.py, verify_restore.py and test_worker.py may receive ONLY necessary new-relation exact-byte recovery coverage and tests without activating or defaulting to the proposed catalogue. No duplicated recovery implementation, production backup/restore or worker activation is authorized.

The public policy may add the narrow KEEP eligibility and the executor a conditional history-aware DELETE refusal, but they must remain inactive for absent/unreviewed relations and preserve all current baseline lifecycle behavior. A source release of this foundation is not installation of a production table or actual monthly capture.

The reviewed policy target is preserved immutable prior-generation monthly history across fresh starts through an explicit MonthlyInventorySnapshot-only FRESH_STORE_V1 exception. No universal KEEP rule or removal of closed unknown-object refusal. Store/company deletion must refuse while retained monthly history exists unless a separately approved export/retention/deletion policy is implemented; do not add cascade deletion or invent legal/numerical/forever retention promises. No new purge policy is authorized. Generation changes use existing executor protocol, preserve payload bytes/hash/count/old generation and never replay old source jobs into a fresh store.

## Required isolated verification and acceptance

Require real native PostgreSQL tests for exact signed decimals/UTF8 candidate text/timestamps, schema constraints and immutability, duplicate and concurrent producers, corrupt existing record refusal, cross-store/company/user/license/generation boundaries, reset/write races, preserved old-generation history, unaffected sibling/foreign/shared controls, and existing full/selective encrypted recovery inclusion and exact readback through the actual retained recovery implementation. No skipped native test is a successful proof. Full PR/main CI, independent review, unchanged existing regression suites and ordinary guarded exact release are required before technical installation is claimed.

Actual source stock capture, automatic schedule first-day07:00Athens, monthly email last-day23:59Athens, actual device/user acceptance and whole item9 remain OPEN. No manual PASS is added by this claim. Next single action after green/main assignment: inspect the bounded schema/lifecycle/recovery integration and implement the internal immutable storage prerequisite with native controls; preserve unrelated recovery and lifecycle behavior.

## 11/10/2026 — CAP-DESCRIPTION-SLASH-01 / SOURCE READY / AWAITING CI AND DEVICE

Owner `codex/cap-description-slash-20261011` retained. Claim PR2321 exact headf1e24063723b495fe53c5f94d67cff6cd96d5ef1/docs CI38171533045 SUCCESS, mergedde24e5ac4be801ba5cefd38a4933ce1030851869 before source edits. Source branch `fix/cap-description-slash-20261011` based on this merged claim, preserving concurrent DAILY integration43594017 and all other owners.

Bounded serialization change only: validate original trimmed description length80 and CR/LF, then replace slash with space for outbound SL description. Original catalog/checkout names stay unchanged. Empty slash-only names reject; barcode/payment label remain strict, Windows1253 still rejects unsupported Unicode. No truncation, state-machine/payment/VAT/queue changes or live dispatch. Exact observed ON THE GO BOOST name serializes as one7-field SL with unchanged qty/price/department/VAT and one final CR; injected ITEM/CR/1 becomes inert text, multiline/overlong/emoji/unsafe barcode/label still reject. Local Node20 focused CAP/store-profile/installation22PASS/0FAIL; frontend build21.38s/TABLE_SERVICE and server preparation/Prisma generation PASS. First full local attempt began without generated Prisma client and includes environment failures; fresh prepared rerun/full native CI still required. Tests are simulated command generation, not physical/LAB PASS.

Actual production transaction/DB/device state remains NOT TESTED; no sale/payment/stock/shift/fiscal command, historical replay or data correction. Protected KAT/Diadoxou physical USER observations and broader installation/fiscal owners retained. Full source/main CI and ordinary guarded exact healthy deploy before owner acceptance. Do not replay an uncertain paid request. Physical acceptance requires fresh baseline and a genuinely intended separately identified one-shot sale, not repetition for evidence. No manual PASS. Central generated PDF publication deferred following automatic review rejection; Markdown records remain authoritative.

Prepared full local suite now2369PASS/0FAIL/23isolated-DBSKIP after generating Prisma; production preparation invariants PASS. Earlier40environment failures remain recorded above, not product PASS. Concurrent invoice continuationPR2323 is preserved; source blobs unchanged.

Shared-record source entry moved to end to preserve concurrent prepend claims (including PR2325); own code blobs unchanged. Earlier full PR CI38171804373 was cancelled by reconciliation after2399PASS/0FAIL; subsequent checks remain separate.

Single next action full CI/build/invariants/native isolated E2E/Windows, then guarded release verification and owner acceptance. Owner retained until named handoff/completion.

# CAP Driver description slash correction

## 11/10/2026 23:12 Athens — CAP-DESCRIPTION-SLASH-01 / ASSIGNED / USER FAIL

Owner `codex/cap-description-slash-20261011`, source branch `fix/cap-description-slash-20261011`. Independent bounded owner-requested correction of slash-containing product descriptions at CAP command serialization; broader fiscal/installation/returns owners remain unchanged. Screenshot shows ON THE GO BOOST ΑΝΑ/ΣΤΑΦ/ΜΠΑΝ/ΛΕΜΟΝΙ 500ML and `line description contains an unsupported CAP Driver character`. Main0a857601 source reproduces rejection of this42-character name by field slash guard. Failure precedes request/Sale insertion in checkout; actual transaction/DB/device state NOT TESTED, no inferred measured financial delta.

Scope: normalize description slash delimiters to spaces for outbound SL field only; retain original catalog/checkout description, strict CR/LF rejection,80-character limit,Windows1253 validation,barcode/payment validation,VAT mappings,writer liveness,one-shot dispatch/idempotency. No production sale/payment/stock/shift/fiscal command, request replay or existing-data correction. Read current active/tracker/pending/checklist/manual and relevant CAP checkpoints/history before change. Existing KAT/Diadoxou profiles and CASH/CARD/Delivery protections preserved. Acceptance: exact observed name serializes as one SL with unchanged numeric fields and one CR; injection/newlines/overlong/encoding fail closed; full Node20 CI/build/isolated E2E/Windows, exact guarded release and physical acceptance still required. CI is not LAB PASS. No manual PASS until real observation.

Claim must merge green before source edits. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-cap-description-slash.md`. Single next action bounded serialization correction after merged claim. Owner retained until completion/named handoff.


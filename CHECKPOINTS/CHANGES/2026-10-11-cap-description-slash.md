# CAP Driver description slash correction

## 11/10/2026 23:12 Athens — CAP-DESCRIPTION-SLASH-01 / ASSIGNED / USER FAIL

Owner `codex/cap-description-slash-20261011`, source branch `fix/cap-description-slash-20261011`. Independent bounded owner-requested correction of slash-containing product descriptions at CAP command serialization; broader fiscal/installation/returns owners remain unchanged. Screenshot shows ON THE GO BOOST ΑΝΑ/ΣΤΑΦ/ΜΠΑΝ/ΛΕΜΟΝΙ 500ML and `line description contains an unsupported CAP Driver character`. Main0a857601 source reproduces rejection of this42-character name by field slash guard. Failure precedes request/Sale insertion in checkout; actual transaction/DB/device state NOT TESTED, no inferred measured financial delta.

Scope: normalize description slash delimiters to spaces for outbound SL field only; retain original catalog/checkout description, strict CR/LF rejection,80-character limit,Windows1253 validation,barcode/payment validation,VAT mappings,writer liveness,one-shot dispatch/idempotency. No production sale/payment/stock/shift/fiscal command, request replay or existing-data correction. Read current active/tracker/pending/checklist/manual and relevant CAP checkpoints/history before change. Existing KAT/Diadoxou profiles and CASH/CARD/Delivery protections preserved. Acceptance: exact observed name serializes as one SL with unchanged numeric fields and one CR; injection/newlines/overlong/encoding fail closed; full Node20 CI/build/isolated E2E/Windows, exact guarded release and physical acceptance still required. CI is not LAB PASS. No manual PASS until real observation.

Claim must merge green before source edits. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-cap-description-slash.md`. Single next action bounded serialization correction after merged claim. Owner retained until completion/named handoff.


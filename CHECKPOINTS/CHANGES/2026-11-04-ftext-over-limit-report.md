## 04/11/2026 — FTEXT-OVER-LIMIT-REPORT-01 / ASSIGNED BEFORE SOURCE / NOT TESTED

ΑΝΑΛΗΨΗ ΑΠΟ FTEXT-RESILIENCE-01 — ASSIGNED fix/ftext-over-limit-report-20261104 /root. Owner explicitly requests this bounded verifier compatibility fix. Preserve other FTEXT assignments and scoped PASS.

Public-source diagnosis: verifyFtextOriginalUnknownFiles accepts only four-field reports, while the existing connector may emit code/rawResultHash. Add rejection-specific support for the canonical six-field code2 report, preserving complete original report bytes, stored result digest, raw RES digest, command/settings/scope/lifecycle/device checks, exact first/only CASH S OVER LIMIT and app-only idempotent audited release. Do not broaden late printed receipt, CARD, timeout or any financial/fiscal execution.

Required synthetic tests: legacy/current reports, full hashes, tamper/code/command/refusal and native no-business-write/idempotency regression. No private incident IDs, original files, customer data, amounts or local configuration included. New compatibility NOT TESTED/AWAITING IMPLEMENTATION; no live or manual PASS. Exact full CI/main and ordinary guarded release precede user acceptance. Next: publish this before-source claim green/main, then source/test edits. Checkpoint CHECKPOINTS/CHANGES/2026-11-04-ftext-over-limit-report.md.


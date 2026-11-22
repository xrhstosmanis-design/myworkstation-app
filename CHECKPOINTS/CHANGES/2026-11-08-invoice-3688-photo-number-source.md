# #3688 — Conflicting numbers across invoice photos, source candidate

2026-11-08 Europe/Athens · retained owner /root · pre-source claim #3739 merged at `1538bb6b94d86799dabf93e8eead6cbb8b159779`.

The multi-image form combines the number and date independently and leaves competing numbers blank for operator review. Explicit manual edits are preserved. The existing FAST prompt now explicitly excludes MARK, UID, QR and related-document identifiers. No additional provider request. One plausible number is still a provider candidate and has no new printed-label verification. The historical Stefanidis path remains. Amount verification is unchanged.

24 focused local assertions/tests across identity, total and durable handoff suites passed. Full CI, guarded deployment and fresh no-submit LAB acceptance are pending. Real-photo number accuracy, issuer VAT and physical POS remain open.

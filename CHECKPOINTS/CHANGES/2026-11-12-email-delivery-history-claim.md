## 2026-11-12T08:48:44+02:00 — Email delivery history / ASSIGNED

Owner /root. Implementation branch: `feat/email-delivery-history`. Scope: capture SMTP acceptance identifiers and sanitized failure reasons for invoice stock exclusion email, then expose delivery outcomes in a read-only history scoped to the authorized company and store. Existing report delivery records are the source for report status. SMTP acceptance and confirmed inbox delivery remain distinct.

Baseline: four accepted automatic report records with message IDs and zero invoice exclusion queue records in the latest read-only audit. Implementation, CI and LAB delivery verification pending. Checkpoint: `CHECKPOINTS/CHANGES/2026-11-12-email-delivery-history-claim.md`.


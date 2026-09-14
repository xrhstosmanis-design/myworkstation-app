# Gate 3 — secondary-page link during reread

- LAB 12:03–12:11 exposed the exact operation: `POS_BACKGROUND_PURCHASE_INTAKE`.
- The additional page was rejected because a reconciliation reread required it to already carry the primary draft link, although safe-shell creation links only the primary page first.
- A locked reread now accepts an additional page only when it is unclaimed or already linked to the same draft. A page linked to any other document remains blocked.
- This exact historical failure is retryable, so refresh can reclaim the existing paid invoice without upload or payment duplication.
- No payment, credit, stock, approval, or finalization behavior changed.
- Validation: 50/50 targeted tests PASS; syntax and whitespace checks PASS.


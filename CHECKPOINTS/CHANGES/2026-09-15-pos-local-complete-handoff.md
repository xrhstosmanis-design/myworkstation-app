# POS — reused LOCAL_COMPLETE handoff

- LAB invoice `620889` was accepted at POS but stayed at `LOCAL_COMPLETE / AZURE` with no full background start.
- Root cause: a reused one-page OCR job was not promoted back to `POS_QUEUED` after the durable draft was created.
- The initial handoff now promotes safe reused `LOCAL_COMPLETE` jobs, and recovery repairs a missing one-page `pageJobIds` list without a new payment or upload.
- No payment creation, reversal, stock, approval, invoicing or finalization behavior changed.


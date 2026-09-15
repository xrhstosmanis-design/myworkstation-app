# POS OCR — table recheck fallback

- LAB recovery of invoice `620889` exposed `POS_BACKGROUND_AI_RECHECK: AI_RECHECK_INTERNAL [table-recheck]`.
- A supplemental OpenAI table pass failure no longer aborts the invoice before Azure recovery.
- The existing historical failure is retryable using the same durable draft, source image and payment state.
- No payment creation, reversal, stock, approval, invoicing or finalization behavior changed.


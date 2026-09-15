# POS Greek piece marker and unique total gap

The current POS draft proved two remaining extraction variants: Greek `ΤΕΜ/ΤΜΧ`
was not accepted by the generic description conversion, and the OCR text layer could
omit the repeated supplier code even though exactly one line gross amount closed the
positive invoice-total gap. Both variants are now handled only from current-document
evidence. Ambiguous total-gap matches remain untouched for review.

A versioned reread replaces the same DRAFT rows atomically. It does not create or
change a payment, post stock, approve, invoice, or finalize the purchase.

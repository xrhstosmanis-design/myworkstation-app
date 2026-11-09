# #3688 — A lone FAST issuer VAT candidate

2026-11-09 Europe/Athens · INVOICE-HEADER-LATENCY · retained owner /root · `140977d031b7c5a07a564312579cc08c2a0ee8e7`.

#3750 and #3754 verified cross-photo conflict review. A single wrong VAT still has no independent issuer proof. Azure exposes VendorTaxId to FAST but the adapter does not retain the customer field. In FAST, a catalog match can replace the returned candidate tax ID, so matching a known supplier does not independently show which party the OCR read.

Next scope: retain role evidence from the same Azure response for FAST and test an issuer candidate that equals the structured recipient VAT. Resolve only with reliable evidence, otherwise leave automatic supplier selection and new-supplier suggestion empty and ask for a check against the original. Distinguish absent evidence from contradictory evidence, preserve manually selected supplier, and keep normal legitimate matching and company/store isolation. No extra provider request or business write. Do not assert that a single wrong non-recipient candidate can be detected from the current data.

Test distinct issuer/recipient, same VAT across fields, missing role evidence, provider fallback, original candidate versus catalog VAT, and existing cross-photo conflict behavior. Use fresh no-submit LAB inputs after CI and guarded deploy. Real-photo and physical POS acceptance remain open.

# #3688 — Conflicting issuer VAT in FAST photo headers

2026-11-08 Europe/Athens · INVOICE-HEADER-LATENCY · retained owner /root · branch `docs/invoice-3688-issuer-vat-claim-20261108` · base `b1997ca7bc012a406d7386e1d4fdb6e22aeaf65a`.

The consumed Mouchalis 172949 sample showed the wrong issuer VAT and suggested creating a new supplier. The intermediate provider payloads were not captured, so the source of the digits is unknown. In synthetic local reproduction, two known VAT matches select whichever appears first. A supplier ID on one response also takes priority over a different exact VAT match on another. Azure's structured VendorTaxId is a candidate, not independent proof of issuer identity.

Scope one change before runtime work: detect competing supplier identities across the FAST multi-image headers, including earlier attachments, and leave the automatic supplier choice for explicit operator review. Do not suggest a new supplier from a disputed OCR VAT. Preserve explicit manual selection and the normal single-photo/PDF flow. Treat a single consistent OCR identity as a candidate; verification of an isolated misread VAT against the printed issuer remains a separate acceptance item. No extra provider calls, supplier creation, payment, invoice writes or replay of used photos.

Test order reversal, equivalent formatted VATs, matching IDs, ID/VAT disagreement, partial headers and manual selection. Verify with fresh no-submit LAB inputs after green CI and guarded deploy. Preserve the accepted amount and number conflict safeguards from #3733 and #3740. Physical POS remains open.

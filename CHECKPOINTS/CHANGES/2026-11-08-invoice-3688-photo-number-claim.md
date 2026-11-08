# #3688 — Invoice number from multiple photos

2026-11-08 Europe/Athens · INVOICE-HEADER-LATENCY · retained owner /root · branch `docs/invoice-3688-number-claim-20261108` · base `9f2445cdeabffcb1f0e60e0f2fb4c974c01762cd`.

The payable sub-scope is verified in #3733 and #3738. Two consumed real-photo LAB samples printed 172950 and 172949. The FAST form showed 40001594112631 and a related-document-like reference respectively. Provider responses per image were not captured, so the source of those digits is unconfirmed.

The current Azure adapter exposes InvoiceId, the FAST fallback accepts a digit-bearing string, and the client picks the first response with a number or date. Neither the digit check nor the image order proves invoice identity. Existing Stefanidis handling is a separate compatibility case.

Proposed scope: use a reliably associated printed invoice-number label or structured field evidence when available, distinguish MARK, UID and related-document references, and leave an ambiguous number for operator review. Preserve legitimate series, leading zeros, long numeric invoice numbers and manual entry. Exercise both orders, neighboring labels and conflicting candidates. No fixed length heuristic, provider call increase, invoice write or replay. Supplier VAT and physical POS remain open.

Before source changes, publish this checkpoint through the normal documentation CI. Use targeted regressions and fresh no-submit hosted LAB samples after the guarded deployment.

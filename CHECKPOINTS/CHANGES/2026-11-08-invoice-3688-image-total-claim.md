# #3688 — Conflicting totals across invoice photos

2026-11-08 Europe/Athens · INVOICE-HEADER-LATENCY · retained owner /root · branch `docs/invoice-3688-image-total-claim-20261108` · base `fb72a3f82a2baecc4fc39043bf97d2365c7754b7`.

## Observed LAB failure

Two new synthetic two-page invoices with the same layout and different numbers were selected once each. The expected payable was EUR 496.00, with a EUR 120.00 first-page subtotal. In order 1→2 the UI returned 496.00 in 10.158 s. In order 2→1 it returned 120.00 in 10.421 s. Supplier, number and date matched in both cases. Before/after LAB and N40 CONTROL matched in both trials. No submission or payment occurred.

## Proposed implementation scope

Keep the existing Azure/OpenAI order and request count. For the multiple-image FAST path, carry an explicit server-derived indication of whether an amount has supporting invoice-total evidence. Evaluate the existing balanced VAT summary and payable helpers with fixtures before relying on them, including subtotal, receipt and balance counterexamples. A uniquely supported amount may resolve competing values. Otherwise leave the amount blank and ask the operator to verify the original. The current API sends a numeric total and a provider name, which do not establish whether an individual response contains a subtotal. Do not use upload order, provider name or the largest amount as proof. Preserve single-image, whole-PDF and the established Stefanidis behavior unless separate evidence warrants a change. Preserve operator-entered values explicitly and check the incremental attachment flow.

This scope covers the payable only. Wrong invoice number and supplier VAT for the Mouchalis photos remain open. No source or production changes in this claim.

## Checks

A local policy simulation passed eight assertions using synthetic evidence flags, including both orders, conflicting verified or unverified amounts, equal cent amounts, one candidate and no usable amount. This does not validate provider evidence. Follow with targeted regressions, normal CI, and fresh no-submit LAB samples in both orders on the verified deployed revision. No replay of prior samples and no financial, fiscal or inventory action.

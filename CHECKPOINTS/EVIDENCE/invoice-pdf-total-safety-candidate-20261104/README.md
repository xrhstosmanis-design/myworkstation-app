# OCR4: PDF final-total safety — isolated tested candidate

Status: CANDIDATE ONLY / NOT APPLIED TO APPLICATION SOURCE / NOT INSTALLED.
User request, 4 November 2026: «ξεκινα την διορθωση» for invoice OCR completeness.

## Evidence and exact scope

Base commit: `8f558f094776fb4e2b0d1bfc7616bf48b0a7af53`.
Inspected actual route: `server/src/routes/commerce-pos-v244.js`, lines 595–717.
Inspected existing tests: `server/test/pos-fast-header-latency.test.js`, including lines 141–153.

The existing known-one-page PDF bypass guard does not protect later return paths. A useful Azure page subtotal can still be returned when the fallback key is absent or the fallback fails; it can fill a missing fallback amount, and an Azure partial-page footer can overwrite the full-reader amount. Related historical evidence is retained in #3617, #3632, #3633 and #3637. This diagnosis is a local control-flow reproduction, not a new hosted producer trace.

The attached patch proposes one common amount-reuse predicate for those remaining paths. Images and known numeric-one-page PDFs keep their existing behavior. Multi-page or unknown-count PDFs cannot silently fall back to Azure money or replace the full-reader amount with a partial Azure footer. A missing/non-finite full-reader amount produces `FAST_HEADER_PDF_TOTAL_UNVERIFIED` rather than a successful amount. No provider/model/timeout/retry, original-file, financial, stock or posting change is proposed. Existing early bypass, durable exact-file reuse, wallet failure propagation and tenant/store checks are retained.

The patch contains the route delta, two updated existing unsafe-policy expectations, and a new 78-case regression file. No source file is actually changed by this evidence-only draft.

## Executed validation

Node.js v22.16.0, isolated actual-handler source excerpt with mocked provider/normalization/database/wallet/arithmetic dependencies:

- Before candidate: 78 tests, 18 passed, 60 failed, 0 skipped.
- After candidate: 78 tests, 78 passed, 0 failed, 0 skipped.
- Exact published patch applied with `git apply --check` and `git apply` to both copied source/test excerpts. All three resulting target files matched the locally tested candidate.
- The added test was then run through its repository-relative default path: 78 passed, 0 failed, 0 skipped.

These are return-policy tests, NOT OCR accuracy, footer-parser accuracy, tax/package arithmetic, real billing settlement, native database/HTTP/UI tests, full repository CI, independent review, deployment or LAB acceptance. The two updated existing expectations were inspected and patched, but their complete existing suite was not executed here. No paid provider, real document upload, payment, draft submission, stock change or production configuration action was performed.

## Reproduction after normal integration authorization

In a separate full checkout, review the patch against the current route and the retained timing owner's changes, then:

```sh
git apply --check CHECKPOINTS/EVIDENCE/invoice-pdf-total-safety-candidate-20261104/candidate.patch
git apply CHECKPOINTS/EVIDENCE/invoice-pdf-total-safety-candidate-20261104/candidate.patch
node --test server/test/pos-fast-header-pdf-total-safety.test.js
```

Full existing tests and project checks remain required. Do not treat the above isolated checks as substitutes.

## Coordination and remaining gates

Retain the existing invoice/header owner and #3648 timing scope; this candidate does not transfer ownership or authorize a competing runtime branch. Before integration, the retained owner must publish the bounded policy claim in the authoritative tracker/checkpoint/active/pending records and regenerate the required PDFs, with applicable green checks and main publication. Those central records are deliberately NOT overwritten by this evidence draft, and their synchronization is still pending.

Then apply/review the actual source/test delta on current main, run full exact PR/main CI, use the ordinary guarded release, and perform one new synthetic no-submit LAB check with control evidence. Do not replay historical F/D/G or paid/CREDIT documents. General supplier accuracy, physical-page completeness, quantities/packages, discounts, VAT and EFK remain OPEN. No overall OCR/Gate3/latency PASS is claimed.

The local environment had no full repository checkout because direct GitHub DNS access failed; source inspection/publication used the connected GitHub API. This is why a tested portable patch is supplied rather than claiming a fully integrated correction.

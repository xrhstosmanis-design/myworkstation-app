# #3688 — Conflicting invoice photo totals, source candidate

2026-11-08 Europe/Athens · /root · before-source checkpoint merged via #3732 at `c98d08fa963b81748698f1eb8d46b4efd39bc24f`.

In the multi-image FAST payment form, retain amounts from already-read images. Resolve competing values only when one distinct amount matches the server's balanced payable evidence. Clear the automatic amount and show a verification prompt when values conflict without unique evidence. Preserve manually edited amounts. No extra provider calls or changes to invoice writes. The existing whole-PDF and Stefanidis merge rules remain in place.

Local regression checks cover both orders, equal cent values, conflicting evidence, incremental candidates, single input and the legacy merge. Balanced-payable examples cover a valid footer, an unbalanced footer, a subtotal and a separate receipt. Hosted LAB and physical POS are pending. Use fresh samples and read-only before/after checks. The separate number and supplier VAT issues remain open.

CI 42510215581 on `dca60a8` ran 5,964 server tests. Exactly one source-shape assertion failed because it searched for the previous one-argument merge call. The adjusted assertion retains the ordering guarantee: the per-page catch precedes the merge. Reconciled with main `b2b3f17` and preserved its independent invoice owner-posting changes.

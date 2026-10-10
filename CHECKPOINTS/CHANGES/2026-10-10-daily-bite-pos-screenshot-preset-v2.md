# DAILY BITE POS screenshot preset v2 — 10/10/2026

Rebased delivery of issue #2054 POS screenshot mapping on current main after PR #2148 became non-mergeable due to concurrent main changes.

Scope and safety are unchanged:
- MyWorkStation visual theme;
- DAILY BITE company/product IDs only;
- exact normalized active-product matching;
- missing/ambiguous names are reported, never guessed;
- captured categories: ΣΦΟΛΙΑΤΕΣ, ΜΠΑΡΕΣ ΓΚΡΑΝΟΛΑ, ΧΩΡΙΣ BARCODE, ΚΙΣΣΑΣ, ΤΑΡΤΕΣ - ΓΛΥΚΑ, DELISNACKS, ΜΠΑΛΕΣ, ΜΑΓΑΚΗΣ, ΚΕΙΚ, ΠΑΙΧΝΙΔΙΑ;
- four remaining fixed category slots stay blank;
- no publication occurs from the preset endpoint;
- no Product/StoreProduct/stock/fiscal/payment/shift/employee/online-ordering/KAT mutation.

Protected state: DAILY BITE import PASS remains 9 departments / 8,753 products. Do not reimport or recreate departments.

Status: AWAITING CI; LAB/LIVE NOT TESTED. Coffee/KAT modifier behavior and name-only coffee normalization are not included in this PR and remain the next bounded step.

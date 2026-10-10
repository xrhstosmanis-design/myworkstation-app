# DAILY BITE POS screenshot preset — 10/10/2026

## Scope
Issue #2054, owner `codex/daily-bite-pos-layout-20261010`.

User supplied Kiosk Manager screenshots and requested:
- MyWorkStation colors/visual language;
- DAILY BITE product bindings only;
- no guessed products for blank/ellipsis buttons;
- KAT coffee behavior only in a later bounded step, with DAILY BITE data;
- coffee name normalization from KAT only as display/product name where explicitly matched, without changing SKU/barcode/prices/VAT/departments/stock/supplier links.

## This PR
PR #2148 adds a Super Admin read-only preset resolver to the existing POS designer.

Captured categories:
1. ΣΦΟΛΙΑΤΕΣ
2. ΜΠΑΡΕΣ ΓΚΡΑΝΟΛΑ
3. ΧΩΡΙΣ BARCODE
4. ΚΙΣΣΑΣ
5. ΤΑΡΤΕΣ - ΓΛΥΚΑ
6. DELISNACKS
7. ΜΠΑΛΕΣ
8. ΜΑΓΑΚΗΣ
9. ΚΕΙΚ
10. ΠΑΙΧΝΙΔΙΑ

The resolver:
- requires the selected company to be DAILY BITE;
- reads only active Product rows from that company;
- matches exact normalized names only;
- returns missing and ambiguous items separately;
- fills the existing draft layout only;
- uses MyWorkStation theme values;
- does not publish or mutate Product, StoreProduct, stock, fiscal, employee, shift, payment, online-ordering or other-store state.

## Evidence/status
Initial CI run 38070527900 stopped at checkpoint policy because same-PR active-list/new-checkpoint updates were missing. This checkpoint and the active-list update correct that process failure. No application test result from that failed run is claimed.

Current status: **AWAITING CI**.
LAB/LIVE acceptance: **NOT TESTED**.

## Protected state
DAILY BITE definitive catalog import remains PASS: 9 departments / 8,753 products. Never repeat the import or recreate departments for this work. KAT data and behavior remain unchanged by this PR.

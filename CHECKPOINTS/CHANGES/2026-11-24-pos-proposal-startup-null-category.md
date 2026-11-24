# POS proposal release dependency — missing tobacco category

24/11/2026 · ASSIGNED /root · fix/pos-proposal-vat-startup-20261124 · SOURCE NOT STARTED.

User explicitly requested starting resolution after failed approved POS4197 deployment. Independent bounded follow-up to original codex/inventory-free-count-20261013 startup predicate; retain that owner and all prior fiscal/inventory acceptance. No takeover of unfinished inventory or fiscal work. No concurrent open PR for this script observed.

Observed:4197 merged d5e7582, both full CI runs successful; Render dep-dc2rqbcs728c73bf2cug UPDATE_FAILED in repair-diadoxou-vat.js. Previous aae50a7 stays healthy. Read-only production SQL confirms tobacco department VAT0/register1/code12, standard VAT24/register6/code15, zero rate mismatches. Of570 associated tobacco-department products,568 have category ΚΑΠΝΙΚΑ and2 existing VAT0 cigarette products have NULL categoryId. No product/tax/stock writes performed by this investigation.

Proposed source only: count VAT0 products with NULL categoryId separately for recognition of the already-repaired no-write state. Keep explicit other categories, nonzero/NULL VAT, missing/changed departments, register/code guards rejected; preserve exact legacy585/565/20 mutation and20-write rollback unchanged. No startup command/global catch/schema/lifecycle change and no production recategorization. Tests execute the actual script with isolated adapter, including observed570/568/2 and negative cases. Publish this claim before source. New full CI then approved release required. No hostedLAB/manual PASS.

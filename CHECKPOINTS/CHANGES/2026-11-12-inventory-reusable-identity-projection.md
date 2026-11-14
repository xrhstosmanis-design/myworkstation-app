# Inventory reusable identity within the selected store

Retained /root, INVENTORY-RECONCILIATION-01, following #3833. Branch feat/inventory-reusable-identity-20261112 from f091136.

An authorized reviewer can explicitly opt a link into reuse. The audit record remains in its original comparison. Other comparisons in the same company, selected store and lifecycle generation read active confirmed links and group matching rows when the canonical code is present. The original comparison can revoke the link. Existing pair-only links remain pair-only. Report fingerprints reflect the applied grouping and the original counts and movements remain intact. PDF and XLSX use the same projection.

Local reconciliation, review and export suites: 26 passed. Native PostgreSQL, mounted UI, hosted LAB, cross-store company identity, independent warehouse/time and verified originals remain open. Next step is native SQL validation and a hosted follow-up comparison with the confirmed aliases and an origin revocation.

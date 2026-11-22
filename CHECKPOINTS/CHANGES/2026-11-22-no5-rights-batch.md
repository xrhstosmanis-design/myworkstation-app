# No 5 · Manager permissions release candidate

CENTRAL-BACKOFFICE-ACCESS-01 continues with one package for five changes: operator access to POS invoices and receipts, approval of schedule exceptions, attendance CSV, shift print and warehouse print. Schedule exception approval is separate from schedule editing and publication, requires the scoped read grant, checks the employee's eligibility and current schedule version, and records the approval. The delegated view exposes supported rule codes only.

The package excludes unimplemented Owner workflows such as PIN and account provisioning, manual clock writes, force-close and payment import. These actions need distinct authorization and their normal operational safeguards. Production acceptance of the earlier #4133 and #4149 is still open.

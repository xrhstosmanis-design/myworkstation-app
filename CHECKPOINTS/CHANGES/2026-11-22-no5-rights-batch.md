# No 5 · Manager permissions release candidate

CENTRAL-BACKOFFICE-ACCESS-01 continues with one package for five changes: operator access to POS invoices and receipts, approval of schedule exceptions, attendance CSV, shift print and warehouse print. Schedule exception approval is separate from schedule editing and publication, requires the scoped read grant, checks the employee's eligibility and current schedule version, and records the approval. The delegated view exposes supported rule codes only.

The package excludes unimplemented Owner workflows such as PIN and account provisioning, manual clock writes, force-close and payment import. These actions need distinct authorization and their normal operational safeguards. Production acceptance of the earlier #4133 and #4149 is still open.

Follow-up in the same release candidate: separately delegated POS access with open-shift protection, employee contact/availability updates, manual attendance, attendance print, and schedule CSV. 31 focused tests passed. Account/PIN provisioning, force-close and payment import remain separate gaps. Release and manual acceptance are pending.

POS entry now rechecks the enabled profile under the same credential lock used by access revocation before either PIN or card issues a session. The isolated PostgreSQL fixture covers both credential types and verifies no session was created while disabled.

Separate opt-in creation of an employee POS operator now provisions an initial hashed PIN, no linked BackOffice account and POS access disabled. Scoped idempotency and audit share the same transaction. Existing operators and Owner-managed PIN resets are outside this path.

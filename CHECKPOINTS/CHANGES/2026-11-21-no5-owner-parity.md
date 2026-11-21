# No 5 · Owner and delegated manager access

CENTRAL-BACKOFFICE-ACCESS-01 remains OPEN. Owner may bulk-select available company views separately from store grants. Individual selections and explicit saving remain available. The existing store bulk selection includes the newly selectable cancellation of a requested leave. Approval, rejection and cancellation each need the matching store grant and the existing personnel entitlement. The decision writer retains the REQUESTED-only update, employee/store scope, transaction grant check and audit reason.

The Owner view census is in docs/roadmap/BACKOFFICE_OWNER_VIEW_COVERAGE.md. Remaining Owner actions include schedule draft and publication, attendance correction and the supported actions identified in the source census. Stored original promotion remains in INVOICE-PAYMENT-RECOVERY-01 (#4137). Scope and deployment are coordinated for one final release.

Validation: six focused Workforce access tests passed, three touched React components transpiled. Full integrated CI and common LAB acceptance pending.

Follow-up: delegated leave creation requires leaves.create and leaves.read. The picker returns only active eligible employees in the selected store. The transaction verifies the current grant and employee and writes a single REQUESTED record and audit on matching request replay. Mounted tests cover denial, store mismatch, employee mismatch, replay and conflicting payload. No approval is implicit.

Follow-up: separate opt-in attendance correction, review approval and overtime approval reuse scoped, audited writers with a revision check. Schedule creation accepts a new draft for a period without an existing active schedule in the selected store. Focused tests pass for management denial, store scoping, stale revision, payroll lock, distinct approvals, and no replacement of a published schedule. The previous full CI failed on the function catalogue and stale capability count in two PostgreSQL variants. Updated both while retaining persisted equality. Publishing and schedule assignment editing remain open.

Rights release scope: separate grants for editing assignments, previewing, approving and publishing schedules. Scoped editor options, transaction authorization, stale version protection and no conflicting published schedule for delegated publication. Invoice Assistant recovery #4137 stays in its own assignment. Grouped manual acceptance covers rights only after the release.

# No 5 · Owner and delegated manager access

CENTRAL-BACKOFFICE-ACCESS-01 remains OPEN. Owner may bulk-select available company views separately from store grants. Individual selections and explicit saving remain available. The existing store bulk selection includes the newly selectable cancellation of a requested leave. Approval, rejection and cancellation each need the matching store grant and the existing personnel entitlement. The decision writer retains the REQUESTED-only update, employee/store scope, transaction grant check and audit reason.

The Owner view census is in docs/roadmap/BACKOFFICE_OWNER_VIEW_COVERAGE.md. Remaining Owner actions include schedule draft and publication, attendance correction and the supported actions identified in the source census. Stored original promotion remains in INVOICE-PAYMENT-RECOVERY-01 (#4137). Scope and deployment are coordinated for one final release.

Validation: six focused Workforce access tests passed, three touched React components transpiled. Full integrated CI and common LAB acceptance pending.

Follow-up: delegated leave creation requires leaves.create and leaves.read. The picker returns only active eligible employees in the selected store. The transaction verifies the current grant and employee and writes a single REQUESTED record and audit on matching request replay. Mounted tests cover denial, store mismatch, employee mismatch, replay and conflicting payload. No approval is implicit.

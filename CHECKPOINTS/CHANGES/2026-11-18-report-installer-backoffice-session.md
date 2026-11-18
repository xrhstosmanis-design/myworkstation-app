# 7–9 · Canonical Super Admin session in report installer

Owner/root, continuation4000/4021, branch fix/report-installer-backoffice-session-20261118. User authorized autonomous installation and own LAB checks.

## Actual observation

4021 PR fullCI44369366335 passed5/5, merged18ca22a94fea91135f13ce16d6eb0f29d3a960fa. Render environment update started API deploy dep-dbuv036i0phs73eu2nkg automatically despite app autoDeployoff. It is LIVE at exact18ca22a94, healthHTTP200/oktrue. MainCI44371403093 stillrunning at observation; no hosted schema mutation was attempted. Saved app configuration selects MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1 and enables the installer gate. Backup profile is not changed.

Fresh native central page platform-admin shows authenticated platform owner. Existing LAB report settings read/write works. On the new reports-only read-only installer preflight the server returns403: Απαιτείται πρόσβαση Platform Super Admin. Production auth.js mints tokenType BACKOFFICE_USER for real platform sessions (roleOWNER/platformRoleSUPER_ADMIN/isSuperAdmintrue), while the new installer route rejects any tokenType. This is a deterministic route bug, not a login failure or reason to request another login.

## Bounded fix

Allow only absent legacy tokenType or exact BACKOFFICE_USER at the existing central role gate. Support impersonation, store/background/chat/unknown token types remain denied. Persisted SUPER_ADMIN user role, active UserSession, matching session version, expiry/revocation and mustChangePassword checks remain mandatory, including inside the installation transaction. No global authentication/role/permission changes.

## Preserved state

No hosted DDL, lifecycle generation/hash change or report event authorization occurred. Earlier9table native transition/rollback PASS protected. The daily LAB reviewedReconciliation setting was enabled and freshreadback retained it; MAIN1/2/3 at07/15/23 and approved recipient unchanged. Read-only17Nov preview correctly HOLDs unfinished/overlap/missingthirdshift. No email or new financial/stock transaction.

## Validation

Two mounted regressions PASS/0FAIL/0SKIP. One uses actual production issueSession and JWT through real auth middleware into the installer, admitting current central BACKOFFICE_USER while rejecting signed unknown token, persisted owner and revoked session. Additional operator/empty/unknown/forged owner/version/password-change cases stay denied. FullCI, exact release, hosted preflight/install and final business acceptance pending.

# Νο16 - OWNER acceptance and named continuation

07/10/2026 22:02-22:08 Europe/Athens - Νο16 περιορισμένο OWNER login/chooser/read-only UI LAB PASS. Secure browserAuth και προσωπική αλλαγή προσωρινού κωδικού από ιδιοκτήτη· πραγματικός Υπεύθυνος Εργαστηρίου/cmtpopbgm000rrhb5xk15uytz, roleOWNER/companycmtpopbgk000prhb5qc60zxus/mustChangePasswordfalse και AuthAudit επιβεβαιώθηκαν ανεξάρτητα. Chooser μόνο τα2LAB stores, χωρίς support/SuperAdmin ένδειξη. Ίδια υπάρχουσα εργασίαchat-task-1791393082635-c4vy05z23ea OPEN/assigneeLABPOS2 και μήνυμαΝΕΟ,50unread, managerselect8activeEmployee επιλογές/settings/pin/completion ορατά. SQL19:07:24Z:50messages/3tasks/fixtureReads0/fixtureAudit18, flagsfalse και assignedAt18:16:52.741 αμετάβλητα από προηγούμενο PASS. Δεν εκτελέστηκε Owner μεταβολή ή logout, δεν επαναλήφθηκε εργασία/μήνυμα. Current health9230c0ab, main8132723a μετάdocs-only1851. OWNER mutation/keyboard/live αρνητικοί ρόλοι/tenant και logout/devices/Push OPEN. CHECKPOINTS/CHANGES/2026-10-07-n16-owner-acceptance.md/manualChat. ΑΝΑΛΗΨΗ ΑΠΟ codex/n16-chat-acceptance-20261007 - ASSIGNED codex/n16-owner-acceptance-20261007 μετά greenCI/merge· ονομασμένο handoff από ρητή εντολή αυτής της συνομιλίας. Προηγούμενα16PASS και17/23/27/λοιποίowners προστατεύονται.

## Scope and protected evidence

Read AGENTS, complete active/pending content, current tracker/checklist/manual, assignment/takeover checkpoints and main history since PR1848. Compare0fbd05f6...8132723a changed only No19/23 documentation/PDF, no Chat source. No source change, auth bypass, new account, real-store action, message/task recreation or stock/financial/fiscal mutation. Existing completed SA/operator paths will not be repeated to fill documentation.

## Initial observation and limits

Browser tab14/cloudChrome (not physical POS). Initial real Owner login was blocked by mandatory temporary-password replacement; user performed it using manual handoff. Visible OWNER greeting and two-own-store selector, independent DB role and non-secret AuthAudit corroborate actual account. Initial supportContext was exited through normal UI, not impersonation. OWNER first login/chooser/read-only control visibility are scoped PASS only. No before-login financial baseline: no unchanged financial/stock PASS claimed. No adversarial API, Owner mutations, logout/login, notification delivery or sound PASS yet. Initial count7332 was all historical Chat audits; correct existing-fixture audit is18, not the full store total. Diagnostic missing WorkforceAudit relation was corrected to observed WorkforceAuditLog with no writes.

## Evidence

Initial SQL snapshot (19:07:24Z):

```json
{"content":[{"type":"text","text":"[{\"auth_events\":[{\"createdAt\":\"2026-10-07T19:07:06.411\",\"event\":\"LOGIN_SUCCESS\",\"success\":true},{\"createdAt\":\"2026-10-07T19:01:52.909\",\"event\":\"TEMPORARY_PASSWORD_REPLACED\",\"success\":true},{\"createdAt\":\"2026-10-07T18:59:42.509\",\"event\":\"TEMPORARY_PASSWORD_LOGIN\",\"success\":true},{\"createdAt\":\"2026-10-05T16:28:59.826\",\"event\":\"TEMPORARY_PASSWORD_LOGIN\",\"success\":true}],\"fixture_audit\":18,\"fixture_reads\":0,\"lab_owner\":[{\"companyId\":\"cmtpopbgk000prhb5qc60zxus\",\"fullName\":\"Υπεύθυνος Εργαστηρίου\",\"id\":\"cmtpopbgm000rrhb5xk15uytz\",\"mustChangePassword\":false,\"role\":\"OWNER\"}],\"measured_at\":\"2026-10-07T19:07:24.102445Z\",\"message\":[{\"completed\":false,\"id\":\"chat-1791392960195-p5hevl1gnw\",\"important\":false,\"pinned\":false}],\"messages\":50,\"task\":{\"assignedAt\":\"2026-10-07T18:16:52.741\",\"assignedBy\":\"cms1k1bje001xhn3xulr0rooz\",\"assigneeEmployeeId\":\"cmtrm1iri000ql8b4j580836r\",\"companyId\":\"cmtpopbgk000prhb5qc60zxus\",\"completedAt\":null,\"completedBy\":null,\"createdAt\":\"2026-10-07T17:11:22.703639\",\"createdBy\":\"cms1k1bje001xhn3xulr0rooz\",\"id\":\"chat-task-1791393082635-c4vy05z23ea\",\"messageId\":\"chat-1791392960195-p5hevl1gnw\",\"status\":\"OPEN\",\"storeId\":\"cmtpopbgo000trhb5ng9ytiru\",\"title\":\"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα.\"},\"tasks\":3}]"}],"isError":false}
```

Screenshot CHECKPOINTS/EVIDENCE/2026-10-07-n16-owner-initial.jpg. Current UI shows50unread and fixtureNEW. Eligible8 employees visible; independent eligible-list reconciliation and server acceptance remain open. Physical terminal/operator/shift/payment/SKU for auth/UI: not applicable; no POS transaction.

## Next single action after merged handoff

Fresh exact health and SQL baseline (same task/message/read/audit/eligible employees, transaction groups and shift controls) then click/keyboard-operate the unread manager assignment selector without changing selected employee. If no read occurs, record scoped UI containment. A separately baselined Owner task assignment action and restoration may test live OWNER permission; no pin/message/completion repeat needed. Then normal logout/login through securebrowserAuth and verify same authenticated Owner/same task/assignee/read counts. Negative API role/tenant and actual device Push remain separately NOT TESTED until executable permitted test surface/physical device exists.

## Publication

Proposed owner transfer and limited UI result are published together; old owner retains assignment until this PR merges. FullCI required, no mock or CI-alone LABPASS. Associated PR carries CI/head/merge evidence. Overall16 OPEN.

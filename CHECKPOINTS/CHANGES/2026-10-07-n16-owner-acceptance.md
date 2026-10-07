# Νο16 - OWNER acceptance and named continuation

07/10/2026 22:18–22:25 Europe/Athens — Νο16 περιορισμένο LAB PASS πραγματικού OWNER: selector click/Escape/Enter δεν διαβάζει το ΝΕΟ μήνυμα. ArrowDown άλλαξε τον υπεύθυνο της υπάρχουσας εργασίας chat-task-1791393082635-c4vy05z23ea από LAB POS 2 σε Άγγελο και ArrowUp επανέφερε LAB POS 2. assignedBy και δύο STORE_CHAT_TASK_ASSIGNED Audit επιβεβαιώνουν OWNER cmtpopbgm000rrhb5xk15uytz· fixtureAudit18→19→20, fixtureReads0 και 50unread αμετάβλητα. Κανονική έξοδος μετά κλείσιμο Chat, reload στη φόρμα σύνδεσης και ασφαλής επανείσοδος στον ίδιο OWNER PASS· νέο LOGIN_SUCCESS19:24:35.667Z, ίδια εργασία OPEN/υπεύθυνος/ιστορικό. Φρέσκα SQL πριν/μετά κάθε ενέργεια:50messages/3tasks,22financialgroups/2open shifts/controlstore0 αμετάβλητα. Δεν δημιουργήθηκε εργασία και δεν επαναλήφθηκαν παλαιά PASS. Runtime9230c0ab για keyboard/ανάθεση, b7e4da2f για logout. Τεκμήρια CHECKPOINTS/CHANGES/2026-10-07-n16-owner-acceptance.md και CHECKPOINTS/EVIDENCE/n16-owner-*.json. Νο16 συνολικά OPEN: live αρνητικοί API ρόλοι/tenant, server token revocation, πολλαπλές/πραγματικές συσκευές και πραγματικό background Push/ήχος/σωστό terminal. ASSIGNED codex/n16-owner-acceptance-20261007· άλλοι owners και παλαιά PASS διατηρούνται.

## Final secure login AFTER

Fresh SQL19:25:45.155921Z confirms same OWNER/company, LOGIN_SUCCESS19:24:35.667Z, taskOPEN/LABPOS2 assignedByOWNER, fixtureReads0/audit20/50messages/3tasks. All22financialgroups/2open shifts/controlstore0 unchanged from each fresh preceding snapshot. UI sameOWNER/own2LABstores, fixtureNEW/50unread. First publication PR1852 merged b7e4da2f5f88f3cb8aee2e951188fa2c9e90ab93 with full CI4650/run37672991210:1888pass/0fail/0skip. New evidence publication supplements that initial login PASS. No token revocation/replay, adversarial role/tenant API, stock or physical Push/sound claim. OverallNo16OPEN. Audit assignment IDs chat-1791400769905-g0l93o9x3cu and chat-1791400814557-nrddlgwci, assignedAt19:19:29.903Z and19:20:14.556Z respectively. Existing task restored, flagsfalse, no new business object.

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


## OWNER keyboard action BEFORE

Handoff PR1852/fullCI4650 succeeded and merged b7e4da2f. Exact pre-action health9230c0ab (documentation/evidence-only changes after it, no Chat source change). Next single action: click the existing unread task assignment selector and keyboard Enter/Escape without changing its value. Expected assignee remains LABPOS2, fixtureReads0,50unread,audit18,50messages/3tasks/control0 and22financialgroups/2shifts unchanged. Physical POS operator/SKU/payment not applicable. Fresh SQL snapshot is captured separately before action. No new task or message.

## Keyboard AFTER and next Owner mutation BEFORE

Click/Escape/Enter/Escape preserved fixtureNEW/50unread/LABPOS2; fresh SQL after confirms fixtureReads0/audit18/task unchanged and22financialgroups/2shifts/control0 unchanged. Scoped UI containment PASS, not changed-assignment keyboard PASS. Next single identified OWNER permission action: change existing assignee LABPOS2 to Άγγελος using keyboard ArrowDown. Expected sameOPENtask/message/read0, one fixtureAudit18->19 with actualOWNER actor, selectedemployee cmua7zc35000srkbgt6bzhclt;22financialgroups/2shifts/control0 unchanged. No new task/message, no completion/flags/setting change. Fresh AFTER keyboard SQL serves BEFORE this one change and is saved separately. Restore originalLABPOS2 only after measuring this action.

## Owner assignment AFTER / restoration BEFORE

Single ArrowDown saved Άγγελος; UI remainsNEW/50unread. Fresh SQL confirms assignee cmua7zc35000srkbgt6bzhclt with assignedBy actualOWNER cmtpopbgm000rrhb5xk15uytz, fixtureAudit18->19, reads0. Same taskOPEN/messageflags/counts/22financialgroups/2shifts/control0. Exact action-start health9230c0ab. Next single restoration: select originalLABPOS2 cmtrm1iri000ql8b4j580836r using ArrowUp; expect audit19->20/OWNER actor, reads0, same unchanged controls. AFTER-assignment SQL serves fresh BEFORE restoration; no completed path replay.

## Restoration AFTER / logout BEFORE

Fresh SQL verifies originalLABPOS2 restored byOWNER, fixtureAudit19->20/read0 and same22financialgroups/2shifts/control0. Expected actual Owner session logout next, existing Chat history/task/assignee remains server-side; normal login form must render and reload remain logged out. No read/ack/message/financial action. Fresh restoration SQL is BEFORElogout; auth-event list captured but token revocation semantics NOT TESTED. SecurebrowserAuth is required for subsequent login, never inspect tokens/passwords.

First logout click while Chat overlay open left UI unchanged; no logout PASS inferred. Closed the unnamed X dialog normally. Next one actual logout from exposed sidebar, latest fresh SQL BEFORE saved. Exact health now b7e4da2f5f88f3cb8aee2e951188fa2c9e90ab93. No duplicate business action.

## Actual logout AFTER / secure login BEFORE

Normal logout renders login form, full reload still login form (no owner greeting/Chat). Fresh SQL AFTER: sameOPENtask/LABPOS2/assignedAt/assignedBy, fixtureReads0/audit20/50messages/3tasks/22financialgroups/2shifts/control0 unchanged. Next one securebrowserAuth login as sameLABOwner; user provides existing new password, not SuperAdmin credentials. Expected owner greeting/own2LABstores and same history/task/unread after reopening; LOGIN_SUCCESS AuthAudit should be new. No token-replay/server revocation PASS inferred.

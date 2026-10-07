# Νο16 — πραγματικό Android Push / ήχος / tap

08/10/2026 00:14–00:21 Europe/Athens — Νο16: mobile μηνύματα/γραφή με πληκτρολόγιο USER PASS6275. Android background ειδοποίηση USER PASS6277 και ήχος ρητά επιβεβαιωμένος00:21. Ένα νέο N16-PUSH-20261008-001/chat-1791407778563-8ia6slbcpwj από OWNER στο LAB00:16:18. BEFORE21:15:34Z/AFTER21:16:27Z: messages50→51/sendAudit40→41/subscriptions1/tasks3/controlstore0. Tap USER FAIL6278/επιβεβαίωση00:20: νέα καρτέλα POS login MYWORKSTATION LAB αντί Chat. Καμία επανάληψη αποστολής. Settings-toggle/άλλες συσκευές/αρνητικοί authenticated API ρόλοι-tenant/token revocation OPEN. Financial/stock/read deltas NOT MEASURED. Νο16 overallOPEN/ASSIGNED codex/n16-owner-acceptance-20261007. Checkpoint2026-10-08-n16-physical-push.md.

## Πριν / μετά

Company cmtpopbgk000prhb5qc60zxus/store cmtpopbgo000trhb5ng9ytiru. Sender OWNERcmtpopbgm000rrhb5xk15uytz, receiver AndroidChrome SuperAdmincms1k1bje001xhn3xulr0rooz. User Home-ready00:15. BEFORE2026-10-07T21:15:34.633362Z messages50/tasks3/subscriptions1/sendAudit40/controlstore cmuk8gxui000ppabfykdxwb1y messages0. Μοναδικό κανονικό UI send21:16:18.564463Z: N16-PUSH-20261008-001 | Δοκιμή ειδοποίησης και ήχου μόνο στο LAB. AFTER21:16:27.655483Z messages51/tasks3/subscriptions1/sendAudit41/control0. SQL exact new row/body/sender/company/store επιβεβαιώθηκαν. No repeat/old fixture read/task recreation. Financial/stock/read NOT MEASURED.

Latest pre-test independent health f84691d254f023658ed191c71222a3166284222b περίπου21:12Z, PR1867 CI4680/1896PASS/deploy dep-db3b9k67bikc73c7cv5g LIVE21:11:23Z. Sender tab παλαιότερο frontend χωρίς reload, send API unchanged. Mobile exact revision δεν εκτίθεται· served mobile bundle readback NOT CAPTURED.

## Παρατηρήσεις / όρια

6275.jpg00:14 ιστορικά μηνύματα/unsent Δοκιμή και keyboard ορατά: limited usability PASS, settings toggle NOT TESTED. 6277.jpg00:16 Android MyWorkStation notification, περιορισμένο receipt PASS σε συνδυασμό με το ένα controlled send, truncated title/body όχι πλήρες message-text proof. Χρήστης00:21 ρητά επιβεβαίωσε ήχο. 6278.jpg00:17/χρήστης00:20 tap άνοιξε POS login στο LAB όχι Chat: USER FAIL. PIN δεν εισήχθη ως μέρος της δοκιμής.

## Διάγνωση / επόμενο

Τρέχον sw.js επιβάλλει /store/{storeId} αντί payload url και ανοίγει νέα καρτέλα όταν δεν υπάρχει matching store tab. Εξηγεί την POS login σε receiver συνδεδεμένο Platform Admin. Fix AWAITING IMPLEMENTATION/LAB: νόμιμη store-scoped Chat είσοδος του receiver context, ίδια auth/tenant προστασία, καμία πλοήγηση άλλου POS. Δεν άλλαξε κώδικας σε αυτό το PR. Προηγούμενα PASS/owners διατηρούνται, overallOPEN.

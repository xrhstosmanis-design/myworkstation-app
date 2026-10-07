# Νο16 — Android Push FAIL και ασφαλής διάγνωση

07/10/2026 23:25–23:41 Europe/Athens — Νο16 Android ενεργοποίηση Push LAB FAIL: φυσικό Android Chrome/SuperAdmin στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ επέστρεψε το ίδιο γενικό σφάλμα εγγραφής, ακόμη μετά τη ζητημένη επιλογή «Χωρίς περιορισμούς». Site και OS άδειες ειδοποιήσεων εμφανίζονται ενεργές. SQL20:44:27.056895Z: LABsubscriptions0/pushAudit3, όπως baseline20:01:49.30245Z. Δεν εστάλη δοκιμαστικό μήνυμα ούτε δημιουργήθηκε εργασία. Πραγματική παραλαβή/ήχος NOT TESTED· ακριβής mobile revision και οικονομικά πριν/μετά τελευταίας απόπειρας NOT CAPTURED. Προσθήκη ασφαλών κωδικών browser error names και διατήρηση error στην οθόνη αντί καθαρισμού από polling: AWAITING LAB, όχι διόρθωση αιτίας. Παλαιά OWNER/assignment/logout/anonymous PASS και λοιποί owners διατηρούνται. ASSIGNED codex/n16-owner-acceptance-20261007, Νο16 overallOPEN. Checkpoint2026-10-07-n16-android-push-diagnostic.md.

## Evidence and pre-change reconciliation
Read current AGENTS, active list, tracker, pending roadmap, checklist, chat manual and relevant Sept13/Oct1/Oct7 checkpoints. Main447abd41fbe71a35874642ac8109d06a700b22de history since last OWNER/anonymous runtime955fa2a0 contains documentation/evidence only, no Chat registration source change. Existing owner claim continues; no parallel scope takeover.

Physical screenshots6271 (battery recommended selected),6272 (23:41 same complete red error) and earlier6267/6268 show site/OS notifications permitted. Owner was asked to choose unrestricted before6272; selection itself is not visible in6272. No causal battery assertion. Android model/Chrome version/mobile exact deployed revision NOT CAPTURED. Receiver is SuperAdmin, not OWNER acceptance.

Baseline20:01:49.30245Z subscriptions0/audit3; first independent after20:26:37.563457Z same; read-only latest20:44:27.056895Z same0/3. No endpoint/key/subscriptionJson read. Last attempt has no independent financial before/after measurement: no financial/stock zero-delta PASS inferred. No test message or task creation by this page.

## Bounded diagnostic change — AWAITING LAB
Original subscribe catch discards both exceptions and blames Chrome settings. Preserve original worker-ready wait, existing subscription reuse, options, worker update and exactly one retry. Expose only allowlisted standardized exception names for first/retry under PUSH_SUBSCRIBE. Unknown names become UnknownError; raw provider message/endpoint/keys never displayed or sent to server. Preserve final exception as cause for local debugging. No claim that error name proves root cause.

Push errors now have independent UI state so normal15-second message polling cannot erase them. Only a new activation clears that state; permission/registration failures do not show a success indicator. No new telemetry/API, service worker, schema, VAPID, role, tenant, routing, sound or message/task modification. Existing foundation expectations now point to diagnostic helper instead of removed generic advice.

Four actual-function mock tests protect existing subscription reuse, successful retry, two-error diagnostics and secret exclusion. LocalNode24 fourPASS/0FAIL/0SKIP; Node20 full GitHubCI/build/invariants/HTTP E2E required before merge. This is simulated software validation, not device PASS.

## Next one action after verified exact deploy
Fresh LAB before counts/health and then one physical Android activation. Read new safe code without browser console/token extraction. Record subscription/audit after. Send no new message until actual subscription confirmed. If still fails, diagnose actual classified exception before another causal fix. Background delivery/sound/correct-store tap and authenticated negative role/tenant remain NOT TESTED. OverallNo16 OPEN; completed OWNER/SA/operator/anonymous PASS protected.

PR/CI/merge/exact deployed revision will be recorded in associated PR and handoff; current diagnostics AWAITING LAB.

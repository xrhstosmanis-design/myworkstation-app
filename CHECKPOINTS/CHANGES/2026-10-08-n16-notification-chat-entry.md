# Νο16 — bounded notification Chat entry

08/10/2026 — Νο16 notification tap fix AWAITING CI/deploy/LAB. Ειδοποίηση οδηγεί σε /chat/{storeId}, ξεχωριστή είσοδο που ανοίγει το υπάρχον StoreChatPanel μόνο μετά από εξουσιοδοτημένο read του υπάρχοντος scoped messages API και exact storeId match. Χρησιμοποιεί την υπάρχουσα σύνδεση, χωρίς PIN/POS login για manager, χωρίς auth/session/module bypass ή νέο API. Κανένα POS παράθυρο δεν πλοηγείται/αλλάζει. Υπάρχον ίδιο Chat εστιάζεται, αλλιώς ανοίγει ξεχωριστό Chat. Legacy notification /store URL μετατρέπεται σε Chat. Foreground ίδιο store/Chat και sound/Apple routing διατηρούνται. Προηγούμενο background Push/ήχος PASS PR1868/CI4682/1896PASS διατηρείται· πραγματικό tap παραμένει USER FAIL μέχρι αποδοχή. Νο16 overallOPEN, ίδιος owner.

## Pre-change gate

Current main b13b4dc2f9af715db83c99f77829331849d14830 includes PR1868 physical evidence/manual/lists/twoPDF, fullCI4682/1896PASS. History since actual Push health f84691d is acceptance documentation/passive evidence only. Read AGENTS/full active list/tracker/pending/checklist/manual, Sept12/13 Push checkpoints, Oct1 Push routing, assignment/Owner/Android/mobile checkpoints. Same ownercodex/n16-owner-acceptance-20261007. No new claim or test replay. Observed Android tap6278 shows LAB POS login; user explicitly confirms tap00:20. Sound confirmed00:21/receipt6277 PASS. Old fixed /store routing prevented cross-store POS navigation but cannot open management Chat because StoreOperatorApp requires a separate operator session. New routing preserves isolation intent while replacing POS landing with Chat-only entry.

## One causal change

sw.js emits /chat/{encoded storeId}. Legacy /store notification URL normalized at click; same origin guard preserved. Exact existing Chat tab focused; all POS and other-store tabs left untouched. Foreground same-store POS suppression retained; same-store dedicated Chat included. Notification sound/vibration/Apple behavior unchanged. Entry additive chatMatch renders existing StoreChatPanel only after loadNotificationChatStore validates authoritative result.store.id from existing authenticated /api/store-chat/stores/:id/messages. No new server endpoint/schema/write. Denied401/403/404/module request displays failure without choosing any other store or issuing login. No token-copy, role assumption, support transition, backoffice renewal, POS gate bypass, automatic read or task change. Old management and POS entry paths unchanged.

## Tests / safety

Local Node24 actual worker vm + actual loader14PASS/0FAIL/0SKIP. Covers legacy/new targets, same-store Chat focus, same/other POS left untouched, exact store vs prefix, foreign/malformed origin fallback, foreground routing, sound request, denied API propagated/no fallback, absent/wrong authoritative store and encoded path. Simulated tests not physical LAB PASS. Existing full Node20 CI/frontendbuild/server/invariants/isolatedHTTP required before merge.

## Acceptance after exact deploy

Physical Android current-session LAB direct Chat URL must show correct store/messages/compose without PIN. Then a separately identified notification tap test with fresh before/after, never resend N16-PUSH-20261008-001 or recreate old task. No16 remains OPEN for real tap, settings-toggle, authenticated negative API role/tenant/token revocation and other devices. Financial/stock zero effects NOT TESTED. Until physical retest this fix AWAITING LAB. Background receipt/sound and protected Owner/SA/operator/anonymous/assignment PASS remain.

Existing Chat notification focus also sends STORE_CHAT_OPEN for its exact store. The Chat-only entry listens and reopens a previously closed panel without navigation/draft reset or touching any POS. Fifteen focused tests now PASS; previous14 count is historical initial verification.

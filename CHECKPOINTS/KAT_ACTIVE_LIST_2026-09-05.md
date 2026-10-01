**01/10/2026 — #27 reversal counters LIMITED READ-ONLY LAB PASS / remaining ASSIGNED same page:** Exact `7b7ff23`, PR1612 / CI4047–4048 / Render1869 PASS. Υπάρχουσες RETURN5/CANCEL2, ημερήσια κατανομή5/2, CSV824bytes δύο μηνών και October0/0 PASS. Sales54.60/missing8/75 προστατεύονται, δύο POS ίδια πριν/μετά. Original-date cost2 αντί later9 και orphan NULL μόνο isolatedCI· ανεξάρτητο positive live κόστος NOT TESTED. VAT εξόδων, ιστορικό κόστος, Owner/print/fullmodule OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task27-returns-review.md`, manualprofitability και κεντρικό PDF.

**01/10/2026 — Workforce invitation share UX AWAITING CI:** μετά το 500 fix το desktop native share άνοιξε/έκλεισε στιγμιαία. Νέο σταθερό modal δείχνει το employee-specific URL και επιλογές Αντιγραφή/WhatsApp/Viber/Κοινοποίηση· native share δεν ανοίγει αυτόματα. Backend/QR/PIN/attendance/POS αμετάβλητα. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.

**01/10/2026 — #27 Greek calendar LIMITED READ-ONLY LAB PASS / remaining ASSIGNED same page:** Exact4c5cc8d, PR1606/1609, CI4041/4042 andRender1867PASS. Default01Aug–01Oct, PreviousQuarter01Jul–30Sep, CurrentMonth01Oct and loaded-periodCSV657bytes PASS. Sales54.60/52.20/2.40 and unknown-cost guard preserved. Both tills MAIN2/2.40 andLAB-POS-02 2/0 unchanged freshbefore/after. DST/microsecond bounds isolatedCI-only; liveOwner/returns/expenseVAT/historicalcost/printing/fullmodule OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task27-athens-periods.md`, manualprofitability and centralPDF.

**01/10/2026 — Workforce mobile invitation USER FAIL / FIX AWAITING CI:** production #1598 εμφανίζει «Παρουσιάστηκε εσωτερικό σφάλμα» στο «Αποστολή εφαρμογής» για LAB POS 2. DB readback: active legacy employee + active credential/card. Root cause: `legacyEmployeeId` χρησιμοποιούνταν έξω από το transaction scope κατά τη δημιουργία `mobileUrl`, προκαλώντας 500. Fix επιστρέφει το ID μέσα στο transaction result· QR/PIN/attendance/POS/οικονομικές ροές αμετάβλητες. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n**01/10/2026 — #27 LIMITED READ-ONLY LAB PASS / remaining ASSIGNED `codex/task27-profitability-20261001`:** PR #1604, CI #4029–4030, Render #1862 και exact `75f663e0f85dc0cd4079a5cf1ec4a493eb5e6188`. LAB: έλλειψη κόστους σε 8/75 γραμμές (Οκτώβριος 4/4, Σεπτέμβριος 4/71), κέρδος και margin «—» ανά ημέρα, μήνα και σύνολο. Πραγματικό CSV δύο μηνών με ίδιους μετρητές και κενά κέρδη. Πωλήσεις 54,60 € και δύο ταμεία αμετάβλητα. Καμία επιχειρησιακή εγγραφή. Επιστροφές, ΦΠΑ εξόδων, ιστορικό κόστος, Owner χωρίς SA και συνολικό module παραμένουν OPEN στον ίδιο υπεύθυνο. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task27-profitability.md`, manual `docs/manual/profitability/PASS.md`.



**01/10/2026 — Workforce mobile employee card ASSIGNED / AWAITING CI:** PR #1598 / `agent/workforce-mobile-card-20261001`. Προστίθεται «Αποστολή εφαρμογής», απομονωμένο mobile PIN login χωρίς POS session και «Η κάρτα μου» με το ήδη εκδομένο Workforce QR. Δεν αλλάζει attendance IN/OUT, POS, πληρωμές, stock, fiscal ή payroll. CI/deploy/φυσικό κινητό και πραγματικό QR scan NOT TESTED. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n**01/10/2026 — #26 LIMITED READ-ONLY LAB PASS / remaining ASSIGNED `codex/task26-monthly-cashier-20261001`:** PR1599, CI4016/4018 και Render1856 PASS, exact `edeba510531b8e7940983f22c8a5e31ef3b90b19`. SuperAdmin LAB: μήνας Οκτωβρίου/Σεπτεμβρίου και επιστροφή rolling30 λειτουργούν· Σεπτέμβριος27ω56λ/υπερωρία7ω. Explicit unlinked POS operator, καμία αξιολόγηση ή οικονομική/stock πράξη. MAIN2/2.40€ και LAB-POS-02 2/0€ ίδια. Θετική εμφάνιση πωλήσεων/βαρδιών με verified σύνδεση εργαζομένου, Owner χωρίς SA και συνολικό score NOT TESTED/OPEN. Δεν είναι συνολικό #26 PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task26-monthly-cashier.md`.

**01/10/2026 20:43 Europe/Athens — ASSIGNED `codex/remote-windows-agent-20261001`, PIN-only pairing AWAITING CI/DEPLOY/WINDOWS LAB:** Owner rejects manual long IDs and requests only six-digit code plus local consent. Scoped #1607 merged7057bc; env update at17:29Z succeeded with exact laptop016cb0e6-cd2f-46e0-8854-b9c036b93500 and absolute17:54:08.702Z expiry. Runtime4c5cc8dc LIVE17:35:13Z contains gate. Job896cee6d-e943-4830-8d13-f6b992302c62 created17:32:01Z; readback AWAITING_DEVICE, expiry17:42:01Z. No local pairing, desktop/input/STOP test or POS activation; physical functionality NOT TESTED. New code-only endpoint atomically resolves exactly one pending, unexpired job inside configured terminal/company/store; ambiguous matches fail closed, five attempts/minute, IDs supplied by client ignored. New Windows UI needs only code; local consent/STOP, creator-only access, TTL and default closed trial remain. Retain old exact-ID route compatibility. Form-reset error corrected by capturing form before await. Eleven targeted local tests PASS; required CI, Windows compilation, exact deployment and new binary delivery pending. Existing approval does not renew elapsed activation window; leave closed until next supervised trial. No overall PASS/manual claim. Same owner; next action is CI/build/deploy verification then deliver updated Windows package for owner acceptance.


**01/10/2026 — #25 LIMITED READ-ONLY LAB PASS:** exact production `a882bb47493085eb0443b6122bcc8db21d2f25a4`, #1595/CI4006–4007 PASS. LAB21 στοιχεία (10 τιμολόγια/11 αρνητικό stock), φίλτρα πηγής/προτεραιότητας/store και μετάβαση σε υπάρχουσα αποθήκη/θυρίδα PASS. MAIN2/2,40€ και LAB-POS-02 2/0€ ίδια μετά fresh reload. Payment empty state0 μόνο· θετικό payment/link, Owner χωρίς SA, live adversarial/error/cap και χαμηλό μη αρνητικό stock NOT TESTED / ASSIGNED στην ίδια `codex/task25-pending-sources-20261001`. Καμία οικονομική/stock πράξη. Δεν είναι συνολικό #25 PASS και δεν αλλάζει #16/#17. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task25-pending-sources.md`, manual pending-center, κεντρικό PDF.

**01/10/2026 — #25 διοικητική συμφιλίωση υπάρχοντος Κέντρου Εκκρεμοτήτων Chat:** Το checkpoint `CHECKPOINTS/CHANGES/2026-09-12-pending-center-chat.md` καταγράφει ιστορικό USER/LAB PASS μετά το #751 / CI1916 / merge9080739a. Η υπάρχουσα καρτέλα συγκεντρώνει Chat tasks της ενεργής εταιρείας με φίλτρα καταστήματος/κατάστασης και κλείσιμο/επαναφορά. Δεν έγινε νέο live test, task mutation ή runtime αλλαγή01/10. Ευρύτερη ανάθεση/διαχείριση μέσα στο Chat, Push και συσκευές παραμένουν στο #16/#17· νέα συγκέντρωση οικονομικών/stock εκκρεμοτήτων δεν τεκμηριώνεται ως PASS. Η γενική καταγραφή #25 OPEN αντικαθίσταται με το ακριβές ήδη υλοποιημένο scope. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task25-existing-scope-reconciliation.md`.

**01/10/2026 — #16/#17: λογισμικό merged, περιορισμένο UI LAB PASS, πραγματικές συσκευές AWAITING LAB.** Υπεύθυνη ίδια σελίδα: #16 `fix/task16-chat-push-routing-20261001` (συνέχεια destination) / #17 `fix/task17-apple-push-20261001`. #1589/#1590/#1591 merged· PR/main CI PASS,1746 server tests/0FAIL/0SKIP/build/invariants/E2E. #16 πραγματικό UI στο exact `6bcfe05b82f19b53e150949cef7c2e86a797694d`:49 μηνύματα/9 αδιάβαστα πριν και μετά μία απόπειρα ενεργοποίησης Push· Chrome permission blocked13:17:55Z, καμία αποστολή μηνύματος. Άλλο LAB0 μηνύματα μετά πλήρη φόρτωση13:24:15Z· MAIN2/2,40 € και LAB-POS-02 2/0 € ίδια μετά φρέσκο readback13:20:42Z. Τελικό Chat στοc26053413:30:05Z49/9 ίδια. Νέα Push routing/Apple policy/PWA PNG είναι CI PASS, όχι πραγματικό Push/iPhone PASS. #17 exact production `/api/health` `c260534436d986cdb003465d777d9a4c6e6e3fe7` / CI4000–4001 / guarded Render1850 PASS13:27Z. Πραγματικό άνοιγμα PNG180/192/512 και νέο HTML iconhref13:28Z επιβεβαιωμένα· αυτό δεν αποδεικνύει iOS εγκατάσταση. Read receipts/αρχεία/άδειες που έχουν πραγματικά checkpoints12–13/09 δεν επαναλαμβάνονται και συμφιλιώνονται στο manual. Καρφίτσωμα, σημαντικό, διαχείριση/ανάθεση task, live adversarial roles, logout/login, background/mobile Push, iPhone και υπόλοιπος εξοπλισμός παραμένουν OPEN/NOT TESTED. Δεν αλλάχτηκαν πωλήσεις, πληρωμές, stock, OCR/#15 ή TABLE_SERVICE. Επόμενη ενέργεια: πραγματική LAB συσκευή με επιτρεπόμενο Push, σύμφωνα με `docs/testing/task16-17-device-acceptance.md`. Τα δύο scopes παραμένουν ανατεθειμένα μέχρι ρητή μεταφορά.

**01/10/2026 — Diadochou POS LIMITED LIVE PASS (configuration only):** #1588 merged `eeb7ad215acd578aebd978f1937996165c3a4d41`, CI build/test PASS, Render `dep-dav5ick1nsns738o6cjg` LIVE13:02:39Z. SuperAdmin selected Diadochou company, validated ranked Product-ID import, saved and explicitly published only Diadochou. StorePosLayout version1 published13:06:18Z; readback13:07:21Z matches all527 unique active eligible IDs,14 ordered categories,20 quick slots (ΝΕΡΟ500ML / ΝΕΡΟ1,5LT / ΝΕΡΟ750ΠΙΠΙΛΑ;17 empty). Source01Jan–01Oct2026 14:59,363593 net units after returns;359 unmatched positive sales rows excluded safely. Fresh before13:06:00Z/after: StoreTransaction0, StockMovement0, stock hash `5c2d467360c261d58b6f1701b0dd6f88` unchanged; other stores versions test2/LAB8/KAT3107 unchanged. No sale/payment/fiscal action. Cross-company rejection verified in route tests/CI only. Physical POS rendering/key presses/sales/RBS/EFTPOS NOT TESTED; no overall installation or USER PASS. Bounded assignment closed; physical installation remains OPEN; unmatched catalog review CANCELLED by owner01/10/2026 18:00 Europe/Athens. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-diadochou-pos-catalog.md`; PDF `output/pdf/MyWorkStation_Diadochou_POS_2026-10-01.pdf`.

**01/10/2026 — #14 READ-ONLY USER/LAB PASS · ευρύτερες write ροές OPEN:** exact production `/api/health` `35a52c4ef056453955b3764aefc8cf16e978f750`, #1586 / CI3985–3986 / deploy1844 PASS, Node20.20.2 /1727 serverPASS /0FAIL /0SKIP /build/invariants/E2E PASS. MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: μία τελική query5449000000996 στις12:11:21 browser επέστρεψε9 αποτελέσματα, history14→15. Αποθήκη/σύνδεση barcode, active provider, unit/ambiguous price guard και net margin LAB PASS. SKU763 κόστος0,814, μικτή λιανική1,30,ΦΠΑ13% ⇒margin29,24%, ίδιο με αποθήκη. Matching5exact/3probable/1non-comparable,0manual confirmations. kalestimes unit rate κενό με λόγο· πολλαπλές τιμές κενές· πιθανή0,32 € και μη συγκρίσιμα δεν μπήκαν στη φθηνότερη ένδειξη0,93 €. Stock/λιανική μετά φρέσκο readback:1LT9/2,60,330ML0/1,30,500ML0/1,60 ίδια. MAIN2/2,40 €,POS02 2/0 € ίδια μετά refresh,1057 Audit ακριβώς ίδια. Δεν υποβλήθηκαν proposal,order,payment,stock ή price/VAT μεταβολές. Latest StockMovement/independentSQLcount, Owner live, disabled provider live και submission/approval/order write paths NOT TESTED· δεν δηλώνεται συνολικό PASS αυτών. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md`, manual `docs/manual/internet-search/PASS.md`. Το ανατεθειμένο read-only σκέλος έκλεισε· τα ευρύτερα write σενάρια παραμένουν χωριστά OPEN.

**01/10/2026 14:28–14:29 Greece — LIMITED LIVE PASS: store address and two report recipients.** PR #1583, exact runtime `ea530316b5682c808ffc1638590719c5445c36bc`; PR/main CI and Render `dep-dav45fe0tbcc73dhfmcg` LIVE11:26:25Z verified. Super Admin saved authorized Diadochou address and two emails once; UI success, reopened form and independent DB readback confirm persistence at11:28:15.898Z. SMTP delivery, report dispatch and other stores NOT TESTED; no email or financial/stock/fiscal action. Completed configuration subtask removed from pending; physical installation remains pending. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-store-report-recipients.md`, manual `docs/manual/pilot-installation/README.md`, PDF `output/pdf/MyWorkStation_Diadochou_Installation_Status_2026-10-01.pdf`.

**01/10/2026 — Εργασία #21 · USER/LAB PASS (read-only):** exact production `6d892277796e458c2d0ba2f16297189fe19d24cd`, /api/health και πραγματική αρχική πλοήγηση καταλόγου → «€ Ποσά / Πιστωτικά» PASS. PR #1578 αρχική υλοποίηση· PR #1580 ελάχιστη διόρθωση αρχικού κουμπιού, PR CI #3971 / main CI #3972 PASS, 1699 server PASS / 0 FAIL / 0 SKIP, build PASS. MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: 01/01–01/10/2026, όλοι οι προμηθευτές, κενή αναζήτηση, 58 γραμμές. Τιμολόγια 1.859,49 €, πιστωτικά −4,27 €, πληρωμές −4.914,70 €, διορθώσεις 0 €, κίνηση/τρέχον υπόλοιπο −3.059,49 €. Πραγματικό XLSX ανοίχθηκε: 58 ταυτότητες/348 τιμές συμφωνούν, μεταδεδομένα περιόδου και σύνολα ίδια. Εκτυπώσιμη HTML αναφορά PDF/Εκτύπωση ανοίχθηκε, 58 γραμμές και σύνολα ίδια, αρχή/τέλος οπτικά ελεγμένα. Φυσική εκτύπωση/αποθηκευμένο native PDF NOT TESTED. LAB Audit 1057→1057 ακριβώς ίδιο, MAIN 2/2,40 € και LAB-POS-02 2/0 € αμετάβλητα. Καμία νέα πληρωμή, συμψηφισμός, stock ή άλλη επιχειρησιακή εγγραφή εκτελέστηκε· ανεξάρτητος DB count NOT TESTED. Αφαιρείται από ενεργές εκκρεμότητες, δεν επαναλαμβάνεται. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task21-supplier-credit-exports-assignment.md`, manual `docs/manual/suppliers/PASS.md`.

**01/10 13:16 Greece — ASSIGNED `codex/backoffice-filter-visibility-20261001`:** Independent owner-requested BackOffice column-filter visibility follow-up: high-contrast active icon, visible summary and clear-all for this table only. User confirms persisted filter hid 99/100 rows; clearing restores rows. Existing filtering works; new visibility NOT TESTED / AWAITING USER. Preserve sorting, column widths, persisted rules, pagination, tenant boundaries and all financial/stock flows. Task21 remains with its assigned page. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-backoffice-filter-visibility.md`.

**01/10 12:08 Greece — #1574 exact LIVE / AWAITING USER quantity confirmation:** runtime `aace0e7b31c46e3375db81775f0e2dd81ae9bfc0`, Render `dep-dav24gp7lnhs73agb3b0` LIVE2026-10-01T09:08:08.178347Z; PR CI36839865731/main CI36840168237 PASS (Node20/server/build/invariants/isolated HTTP E2E). All-row selection plus explicit quantity confirmation deployed, no USER application/posting PASS yet. Original delivery scoped USER PASS recorded in all five surfaces by #1574. BEFORE acceptance2026-10-01T09:06:14.956515Z: existing document5d61d44f-4611-4c2c-9f1b-c4d31bdb0a55 DRAFT/ordera0094679-8a4b-4333-a77b-9a4b793b34ba NEW,0storedrows,1job,116.96header/issue01Oct,paymentnull,0StoreTransaction/0StockMovement,all-stock hash6fb0a432ecdef428ca5f1cb137189d40. Preview/apply next only on same draft; physicalPOSpayment/posting separate. Owner retained `codex/mydata-draft-pos-receipt-20260930`; Epsilon OPEN.

**01/10 11:47 Greece — TDA6538 limited USER PASS original delivery; quantity review FAIL / ASSIGNED `codex/mydata-draft-pos-receipt-20260930`:** owner confirms same original and editable draft. Screenshot11:43, runtimeca354a97; read-onlybefore/after +1PurchaseDocument,0transactions/0movements. 7rows63units versus printedfooter19 blocks apply. Bounded explicit all-row quantity confirmation implemented;22targeted/full1693PASS1SKIP/buildPASS, AWAITING CI/EXACT DEPLOY/USER, no line-application/posting PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-mydata-quantity-human-review.md`; original number-padding acceptance closed, Epsilon/POSarrival remain OPEN. Same owner retained.

**01/10 11:31 Greece — #1571 exact LIVE / AWAITING USER:** runtime `ca354a97821dd5696f45db81b65c5ba9d5894426`, Render `dep-dav1jgd9fdbs73as07rg` LIVE2026-10-01T08:31:29.263986Z; PR CI36836022482 and main CI36836320927 PASS (Node20/server/build/invariants/isolated HTTP E2E). Same real TDA0006538 PDF passes local identity verification; no production attachment/draft USER PASS yet. Read-only11:32:07 Greece target inbox remains RECEIVED, attachmentnull, attempts3, draftnull; store PurchaseDocument1/StoreTransaction0/StockMovement0, unchanged since before. Existing-record manual retry next; no attempt reset/new invoice/payment/posting. Same owner ASSIGNED; Epsilon remains OPEN.

**01/10 11:22 Greece — ASSIGNED `codex/mydata-draft-pos-receipt-20260930`:** new real FAIL TDA6538: original prints0006538, myDATA6538; exact MARK/issuer/recipient verified. Bounded document-number zero-padding correction,13 targeted tests and same real PDF local verification pass; AWAITING CI/EXACT DEPLOY/USER, no attachment/draft/posting PASS. Retry attempts3 exhausted; existing-record manual retry after live revision, no attempt reset/new invoice/payment. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-mydata-original-number-padding.md`. Existing Gate3/POS PASS and Epsilon OPEN retained.

## 01/10/2026 11:18 Greece - Task 20 POS gift stock ledger / LOCAL PASS - AWAITING CI/DEPLOY/LAB

- [ ] `fix/promotion-stock-ledger` LOCAL PASS / AWAITING CI, MERGE, EXACT DEPLOY AND LAB: μία πραγματική LAB πώληση στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ / MAIN / LAB POS 2 στις 10:44:20, 1 × `LAB EXCEL TEST 1` και 1 × δώρο `LAB EXCEL TEST 2`, ΜΕΤΡΗΤΑ 1,20 €. Sale `328547a7-3d2a-43e3-a34a-ae646add870d`, StoreTransaction `e56ac35d-454d-42a8-8955-60efdd56a99e`. Βάρδια/Audit έχουν ακριβώς μία συναλλαγή και δύο γραμμές. Τα τρέχοντα StoreProduct είναι 12 και -1 και οι δύο γραμμές εμφανίζουν μία πώληση, αλλά το StockMovement χρονολόγιο δεν έχει καμία SALE κίνηση της 01/10. Πριν από τη συναλλαγή δεν αποθηκεύτηκε πλήρες stock baseline, άρα η ακριβής μεταβολή παραμένει NOT TESTED· η απουσία ledger είναι πραγματικό LAB FAIL. Δεν επαναλαμβάνεται πληρωμή. Η περιορισμένη διόρθωση γράφει μία idempotent StockMovement ανά πραγματική tracked-stock γραμμή μέσα στην ίδια checkout transaction, χωρίς αναδρομική κατασκευή της παλιάς κίνησης. Στοχευμένα tests 31/31, server 1693 PASS / 1 SKIP / 0 FAIL και production build PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task20-pos-gift-stock-ledger.md`.

**01/10 10:52 Greece — #1569 exact LIVE / AWAITING USER:** runtime `5e6bf57e7ae119066ec189e1bd8c4017f65e9422`, Render `dep-dav10tbncjis738o01h0` LIVE2026-10-01T07:52:00.015978Z; PR CI36832059077 and main CI36832327447 PASS (Node20/build/server/invariants/isolated HTTP E2E). Final local1690PASS/1SKIP. Search issue dates/from-to, Athens daily arrivals, grouped exports and 15minute server scheduler deployed, no actual first scheduled cycle or owner UI/export acceptance yet. Same owner ASSIGNED; Epsilon provider request pending. No additional runtime deploy from docs. `CHECKPOINTS/CHANGES/2026-10-01-mydata-date-range-daily-scheduler.md`.

**01/10 — ASSIGNED `codex/mydata-draft-pos-receipt-20260930`:** issue-date from/to + Search, independent Athens daily arrivals, grouped PDF/Excel, 15-minute production server receiving implemented; local1689PASS/1SKIP/buildPASS, AWAITING CI/EXACT DEPLOY/USER. Purchase draft already uses supplier issue date; removed receipt-date fallback from archive. Existing financial/POS/Gate3 PASS protected. Epsilon CAPTCHA failure and official API request emailed; Epsilon remains OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-mydata-date-range-daily-scheduler.md`. Same owner retained; no duplicate paid-invoice test.

## 01/10/2026 01:20 Greece - #1567 exact live / AWAITING USER

PR #1567 merged14ac644eb7f9f9539d4938cefdc845591c4fb287. PR CI36784064878 and main CI36784388453 PASS including Node20/server/build/invariants/isolated HTTP E2E. Render dep-dauokjp42hec73f9d37g exact14ac644e LIVE2026-09-30T22:19:38.040019Z. Physical-PDF count, inline wheel/hand viewer and printed rounding deployed, NOT USER/LAB PASS. No extra runtime deploy from this docs-only update.

BEFORE next same137177 preview, read-only2026-09-30T22:20:20.45438Z: companycmulmjjoa000oqlbfyi0h53ju/storecmulmjjoc000qqlbf2bn2ifj0, owner desktop BackOffice. Document72e4fd12-282d-450d-96f6-94dc2a153564 DRAFT/order871e8dd9-c82b-41da-b592-d6f8c8db49db,0 stored lines, header398.31, paymentTransactionIdnull,0 StoreTransaction,0 StockMovement, all-stock hash6fb0a432ecdef428ca5f1cb137189d40. No payment method/operator shift/terminal applies to this preview-only action. Same137177 issuer099912874, printed13rows/107invoiceunits, no inferred stock factor. Preview next only: readable pane and physical-page/economic evidence; human apply requires explicit review and its own before/after. No payment/approval/finalization or repeated upload. Epsilon Papadopoulou unsupported/viewer timeout remains OPEN. Same owner ASSIGNED codex/mydata-draft-pos-receipt-20260930; agreed Gate3 PASS protected.

## 01/10/2026 00:50-00:58 Greece - 137177 PDF pane and page-count FAIL / bounded correction

Same owner ASSIGNED codex/mydata-draft-pos-receipt-20260930. New owner image214958/file_00000000e42c8210abb620635a89c283 is DIFFERENT invoice137177 (not135848); image215259/file_0000000035388210abe00dc1adab1e92 clarifies zoom must stay inside existing left pane. Chrome native PDF thumbnail sidebar consumes half-width and shows20% zoom. Assistant now responds (previous HTTP400 absent in this observation), but reports1 source photograph for a2-page PDF; model evidence2 entries, second lacks identity/full-page evidence, so application blocked. 13 proposed rows, shown sum398.20 vs printed398.31 difference0.11; package factors unknown. No reading/apply/posting PASS.

Scoped read-only production: document72e4fd12-282d-450d-96f6-94dc2a153564 DRAFT, order871e8dd9-c82b-41da-b592-d6f8c8db49db, job278cb940-dadd-4f7f-91fc-877d5e2c3257, attachmenta5b98ffd-6ed9-4837-a10a-f846f196c300 PDF, paymentTransactionIdnull, gross398.31. Actual same attachment decoded locally: pdfjs count2; text13rows, quantity107, net/gross398.31. First1147/1148 printednet22.69 each vs rounded2.27*10=22.70;461 includes printednegative adjustment. No economic correction invented, no new payment/finalization/stock write.

Bounded changes: count physical PDF pages from actual bytes before model preview, maximum5pages; retain original source/job and require existing page/economic checks. Prompt and independent verification distinguish internal PDF pages/continuation header from separate photos. No forced pagesComplete or ignored totals. Existing image/sideways views, page evidence, role/tenant/license, model/schema and human apply gates preserved. Replace native PDF iframe only in assistant with lazy-loaded local pdfjs single-page canvas: previous/next, minus/plus, fit, rotate, drag in SAME left pane, no thumbnails/new window/fullscreen. Original attachment unchanged, worker bundled locally, no third-party file upload. Client teardown cancels rendering/destroys viewer.

Local tests6 focused PASS (including actual valid2-page PDF fixture, mixedphoto/PDF, invalid/over5refusal); full suite1661 PASS/1SKIP, build PASS before lazy-import refinement. Same real137177 count2 independently PASS as parser evidence only, not AI/LAB PASS. CI/exact deploy/user acceptance pending. Acceptance on SAME137177: readable inline zoom without thumbnails, two physical pages recognized and all13rows/quantities/economics reviewed; no repeat upload/payment/stock/finalization. Unknown package factors and0.11 economic disagreement require operator review; correction does not bypass them. Known135848 limited draft delivery PASS and Gate3 agreedcross-supplier PASS protected.


### Owner rounding steering and provider failure, 01/10 01:00-01:08

Owner rejects manual unit-price recalculation for hidden decimals. Same137177 actual source confirms printed quantities/prices/net cents, plus actual negative third percentage -.05 on461. Bounded per-row printed-net preservation uses explicit existing netAmount only when two-decimal unit price can explain discrepancy: abs(printedNet - quantity*price*discountFactor) <= quantity*0.005*factor +0.005. No general invoice-total tolerance, no inferred discount/price. Assistant shows rounding delta separately and submits printedNetAmount with normal HUMAN-selected line creation/update; server validates independently only on NEW POS_OCR_DRAFT and persists price/discount unchanged plus original rounding basis in existing ocrRawText/audit. No migration. Unrelated supplier/product/stock-unit edits preserve printed cents; economic edits invalidate the old basis. Large discrepancies and closed/manual purchases refuse override. Explicit negative printed adjustments accepted within existing -100..100 route contract. No automatic apply, posting, payment, stock or approval. Transcribed13-row fixture (NOT OCR replay) sums398.31/107 and retains printed prices/discounts; old methods unchanged without override. Helper/page-count tests7 PASS, full suite/build PASS; final CI and USER acceptance pending. Browser runtime absent locally: inline canvas visual/wheel/drag acceptance NOT TESTED, require owner same-draft image.

Image220426/file_00000000ad5482108aeb9d4365c584e4: Papadopoulou35158/35000 original action fails adapter guard. Scoped source issuer094031399/recipient802387132; URLs exact host epsilondigital-3rdpartd.epsilonnet.gr /fd/token:159 (Epsilon, not Impact). Known35158 endpoint responds302 to same-host /DocViewer/uuid, not PDF. Read-only viewer request times out15s; no content/identity verified, no redirect allowlist opened or invented PDF. Epsilon adapter remains OPEN/externally unverified; error does not prove wrong VAT. No state-changing provider retry. Other original acquisition PASS and Gate3 LAB PASS preserved.
## 01/10/2026 01:00 Greece - Super Admin promotion list scope fix / AWAITING CI-DEPLOY-USER

- [ ] ASSIGNED `fix/platform-promotion-list`: η δοκιμαστική ενέργεια αγορά 1 × LAB EXCEL TEST 1 / δώρο 1 × LAB EXCEL TEST 2 δημιουργήθηκε μόνο στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ και το API επέστρεψε `createdPromotions: 1`. Η λίστα του Platform Admin έδειξε λανθασμένα 0 επειδή χρησιμοποιούσε το tenant-scoped `/api/price-catalog/promotions/scoped` με το `companyId` του Platform Admin. Νέα platform-only read endpoints επιστρέφουν προσφορές και ανάλυση όλων των tenant εταιρειών, εμφανίζουν εταιρεία/κατάστημα και η λίστα ανανεώνεται μετά τη δημιουργία. Δεν αλλάζει POS pricing, υπάρχουσες προσφορές, πωλήσεις ή stock. Local full suite 1678 PASS / 1 SKIP, client build PASS. PR #1566 AWAITING CI/MERGE/DEPLOY και production readback της ίδιας LAB εγγραφής, χωρίς δεύτερη δημιουργία. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-platform-promotion-list-scope.md`.
## 01/10 00:36 Greece - PDF input correction exact live / AWAITING USER

PR #1564 merged e5e7c9cef7a7911ad406d7f3643a773b59dbf695. PR CI36779630475 and main CI36779959250 PASS including Node20 build/server/invariants/isolated HTTP E2E. Exact Render dep-dauo07u0tbcc73c11s60 LIVE2026-09-30T21:36:22.303437Z. PDF input prefix correction is deployed, not yet USER PASS. Limited draft delivery PASS and actual HTTP400 FAIL above remain the latest user evidence. Same owner ASSIGNED codex/mydata-draft-pos-receipt-20260930; next refresh/open same135848 assistant preview only, no draft recreation/payment/stock/finalization. No repeat Gate3 paid invoice. No additional runtime deployment requested by this documentation-only evidence update.

## 01/10/2026 00:24 Greece - draft delivery USER PASS; PDF assistant HTTP400 FAIL

Same owner ASSIGNED codex/mydata-draft-pos-receipt-20260930. Runtime ae8fa98b, owner images 212022 / 212128: one editable ΤΔΠΤΛ135848 order opens, original mydata-135848-400015448413446.pdf visible in existing assistant; draft has zero lines before review. Scoped after read2026-09-30T21:24:26Z: PurchaseOrder count1, document e9d75e39-c60c-42ef-8e65-27ff1283c939 DRAFT, order d59fc7a4-aac9-4b14-b01c-ca17dfa122a6, same job2b5f8d7d-9527-40d7-9bc6-14e6866905cf AWAITING_APPROVAL. Versus recorded before: +1 draft/order, StoreTransaction0 and StockMovement0 unchanged, stock hash6fb0a432ecdef428ca5f1cb137189d40 unchanged; paymentTransactionIdnull. LIMITED USER/LIVE PASS only for draft delivery and original display. No payment, stock posting or approval.

Assistant preview displays «Ο βοηθός δεν απάντησε (400)»: real FAIL for PDF review, no line-reading/apply PASS. Code inspection finds input_file.file_data stripped to bare base64; official Responses guide requires data:application/pdf;base64 prefix (https://developers.openai.com/api/docs/guides/file-inputs). Bounded correction restores prefix while preserving PDF bytes, image processing, model/schema, tenant/license/role gates and same draft/job. Provider error body not logged, so HTTP400 attribution remains implementation-backed diagnosis awaiting live confirmation. Six focused image/PDF/provider-error tests PASS; full local suite1659 PASS/1 SKIP and frontend build PASS; CI/exact deployment and same-draft preview USER acceptance required. Do not recreate draft, upload or pay invoice again. Physical POS receipt integration, later credit payment, legacy POS and final posting remain NOT TESTED/OPEN.

## 01/10 00:10 Greece - #1562 exact live, draft/receipt AWAITING USER

PR/main CI green, exact Render ae8fa98b / dep-dauniuou01pc738dq4rg live21:07:52Z. Same installation owner ASSIGNED codex/mydata-draft-pos-receipt-20260930. Before135848 review baseline:0 purchase docs/orders,0 transactions/open shifts/movements,6623 store products stock0.0000/hash6fb0a432ecdef428ca5f1cb137189d40. Original job/attachment unchanged and documentIdnull. No user action after deployment yet, no zero-delta or payment PASS claim. Next same135848 review only, no payment/finalization; physical POS acceptance separately measured in LAB. Checkpoint2026-09-30-mydata-provider-original.md.

## 30/09 23:46 Greece - myDATA draft + first physical POS receipt AWAITING USER

ASSIGNED codex/mydata-draft-pos-receipt-20260930 same installation page. Newest owner instruction: preserve normal POS photo/payment, first arrival connects existing myDATA purchase; later manual submissions stop before payment. Transaction retries reuse same receipt/payment only. Original job/order and confirmed lines preserved; approved purchase gets receipt/payment metadata without stock/reapproval. Local full suite1658 PASS/1 SKIP, build PASS; schema EXPLAIN read-only PASS. CI/exact deploy and measured LAB acceptance pending. Original persistence limited LIVE PASS on472c746f; draft handoff FAIL on that old revision. No new store payment or stock test executed. Existing LAB Gate3 PASS protected; no repeated13241.

# 30/09 23:33 — myDATA draft handoff: LIVE FAIL, fix AWAITING CI/DEPLOY/USER

ASSIGNED same installation page codex/mydata-original-links-20260930. Exact live472c746f original attachment + one AI job /3 rows observed for135848; purchaseDocumentId null, no Orders draft. Follow-up creates one editable shell using existing invoice assistant contract; repeats reuse same job/order and deleted drafts are not recreated. PDF/AI review only; no automatic product/payment/stock posting. POS arrival linkage is OPEN: existing duplicate guards may stop a later POS submission; do not claim automatic attachment/payment merge. Existing Gate3 PASS preserved; do not repeat13241. Checkpoint2026-09-30-mydata-provider-original.md.

## 30/09/2026 22:40–22:46 Greece — PDF readability USER PASS; automatic originals AWAITING USER

- [x] Images 194012/194043 confirm report and one-page print layout: issuer VAT, full MARK, amounts remain unbroken. Supersedes PDF layout AWAITING below; exact source #1556 d2f2cbaf, deployed descendant 6d6384ce. Full archive owner export cancelled by owner as unnecessary, not PASS.
- [ ] ASSIGNED `codex/mydata-original-links-20260930`, same installation page: automatic provider original from downloadingInvoiceUrl, validated PDF attached to same inbox and one AI review job. First verified adapter Impact. 23 targeted tests/build PASS and real provider download 211398 bytes / identity PASS. App persistence and AI review AWAITING USER. No mass historic ingestion, purchase posting, stock or payments. `CHECKPOINTS/CHANGES/2026-09-30-mydata-provider-original.md`.

## 30/09/2026 22:08 Greece - full-archive known search and single-record XLSX USER PASS; PDF layout AWAITING

- [x] Owner images confirm known 135848 search 1/5269 and XLSX opened with 60.60 / 14.54 / 75.14 and full MARK. PDF saved and opens as one page; do not request same artifacts again.
- [ ] ASSIGNED `codex/mydata-report-layout-20260930`, same installation page: fixed-width PDF report readability after identifier/VAT wrap FAIL. AWAITING CI-DEPLOY-READBACK. Full archive user export, replay/cursor, originals and final posting remain OPEN. `CHECKPOINTS/CHANGES/2026-09-30-mydata-export-user-evidence.md`.

## 30/09/2026 - myDATA full archive / Excel / PDF report - AWAITING CI-DEPLOY-USER

- [ ] ASSIGNED `codex/mydata-archive-export-20260930`, same installation page, owner authorized 21:19. Full tenant/store archive search and paging, all-filtered XLSX export, generated PDF report via browser Print/Save as PDF, separate original attachment action. 14/14 targeted tests and frontend build PASS; generated workbook re-read with 5,269 fixtures. Production read-only search query finds known 135848 once. No user export PASS, no original/QR acquisition or final posting. Initial receiving PASS #1553 preserved. `CHECKPOINTS/CHANGES/2026-09-30-mydata-archive-export.md`.

## 30/09/2026 21:14 Greece - myDATA initial receiving LIVE PASS / remaining scope OPEN

- [x] Initial production receiving closed after #1551/#1552, exact Render `5e5d12317d5677b77a742a898b033a55eab2acd7`. Before DB counts 0/0; owner screenshot shows 5,269 received records, DB 5,269 distinct MARK. Known 135848 / 75.14 joins RECEIVED inbox record. Prior internal error and zero-results AWAITING entries below are superseded for initial receiving.
- [ ] ASSIGNED same installation page `codex/mydata-receiving-evidence-20260930`: subsequent sync/cursor/replay and complete archive paging/search remain OPEN. UI LIMIT 300 does not represent total archive. Original/QR, line extraction, final posting, stock/payment before-after and cross-store adversarial tests NOT TESTED. No full installation/Gate closure. Checkpoint `CHECKPOINTS/CHANGES/2026-09-30-mydata-receiving-live-pass.md`, manual `docs/manual/invoices/PASS.md`, PDF `output/pdf/MyWorkStation_myDATA_Receiving_Status_2026-09-30.pdf`.

## 30/09/2026 20:53 Greece — myDATA receiving LIVE FAIL / supplier lookup / AWAITING CI-DEPLOY-USER

- [ ] ASSIGNED `codex/mydata-supplier-lookup-20260930`, same owner continuing #1551. Exact production `d2f768a4` now parses the AADE envelope, but owner screenshot shows internal error and 0 documents. Server 17:53:16Z: undefined `tx.supplier.findFirst` at route line 58. Supplier is a raw SQL table, absent from Prisma schema. Replace only lookup with parameterized company/VAT-scoped SQL; leave unmatched supplier nullable. 10/10 local tests, including execution of actual sync handler with raw-only transaction, matched/unmatched supplier and duplicate replay. Real-store import remains FAIL / AWAITING USER. No manual PASS closure. `CHECKPOINTS/CHANGES/2026-09-30-mydata-supplier-lookup.md`.

## 30/09/2026 — Εισερχόμενα myDATA · string envelope ROOT CAUSE / AWAITING CI / DEPLOY / USER

- [ ] ASSIGNED `codex/mydata-string-envelope-20260930`. Owner screenshot 20:24 reports 0; production `08f532d3`, DB inbound 0. Direct read-only RequestDocs returns the known invoice inside an escaped .NET `string` envelope, which the current parser does not unwrap. Credentials work; account hint is not the key suffix. Bounded envelope decoding preserves VAT filtering, cursor/environment, duplicate guards and draft-only receiving. No stock/payment/fiscal/schema writes. 9/9 targeted tests PASS; application receiving remains NOT PASS. `CHECKPOINTS/CHANGES/2026-09-30-mydata-string-envelope.md`.

## 29/09/2026 — Κεντρική ΑΑΔΕ · περιορισμένο production LAB PASS

- [x] Μετά τα PR #1540–#1542 / CI #3883 / Render `dbea7e0`, η εικόνα `image(20260929-202826).png` δείχνει επίσημη επωνυμία, δραστηριότητα και διεύθυνση από ΑΑΔΕ σε υπάρχουσα καρτέλα προμηθευτή της εταιρείας Διαδόχου. Readback παραγωγής από `Supplier` επιβεβαίωσε τα τρία αποθηκευμένα πεδία και χρόνο ενημέρωσης 29/09 23:26 Ελλάδας. Περιορισμένο PASS αναζήτησης και αποθήκευσης στη συγκεκριμένη εταιρεία/καρτέλα· απομόνωση άλλων εταιρειών, myDATA, τιμολόγια και άλλες ροές δεν δοκιμάστηκαν. `CHECKPOINTS/CHANGES/2026-09-29-central-aade-live-pass.md`.

## 29/09/2026 — Κεντρική ΑΑΔΕ WS-Security · AWAITING CI/DEPLOY/LAB

- [ ] Μετά το SOAP 1.2, η εικόνα `image(20260929-200753).png` έδειξε «Δεν ορίσθηκε ο χρήστης που καλεί την υπηρεσία». Το επίσημο XML της ΑΑΔΕ απαιτεί WS-Security UsernameToken αντί του υπάρχοντος AuthenticationHeader. Κοινή διόρθωση χωρίς αλλαγή κωδικών ή δεδομένων. Πραγματικό lookup AWAITING LAB. `CHECKPOINTS/CHANGES/2026-09-29-central-aade-wssecurity.md`.

## 29/09/2026 — Κεντρική ΑΑΔΕ SOAP 1.2 · AWAITING CI/DEPLOY/LAB

- [ ] Η εικόνα `image(20260929-195410).png` έδειξε HTTP 415. Το ζωντανό επίσημο WSDL δηλώνει SOAP 1.2, ενώ το κοινό route έστελνε SOAP 1.1. Διορθώθηκε κεντρικά envelope/content-type/action· η ανώνυμη επίσημη μέθοδος VersionInfo απάντησε HTTP 200 με SOAP 1.2. Πιστοποιημένη αναζήτηση ΑΦΜ ακόμη AWAITING LAB. `CHECKPOINTS/CHANGES/2026-09-29-central-aade-soap12.md`.

## 28/09/2026 — efood / Pelican ασφαλές one-shot LAB webhook · MERGED / CI PASS / AWAITING DEPLOY-LAB

- [x] PR #1514 συγχωνεύτηκε ως `55f2a53c939cee230bab67b23645fd60555430bc`. PR CI #3827 και main CI #3829 PASS· το επόμενο main `639944effe644d8709f5daefde18b33a428fa710` πέρασε επίσης CI #3830 και περιλαμβάνει την αλλαγή. Το αποκλειστικό `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` διαθέτει πλέον προσωρινό one-shot SANDBOX webhook για το efood Partner `Trigger Test Order`, με hash-only Authorization secret, 5λεπτο παράθυρο, row lock, αυτόματο κλείδωμα/λήξη, idempotent retry και κρυπτογραφημένο dry-run event. Παραγγελία, πώληση, stock, πληρωμή, RBS/EFTPOS, fiscal/myDATA και outbound external calls παραμένουν κλειδωμένα. Render exact revision και πραγματικό Partner trigger παραμένουν AWAITING· δεν δηλώνεται LAB PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-09-28-efood-lab-safe-webhook-window.md`.

## 28/09/2026 — Διαδόχου Παύλου / πολλαπλά ΑΦΜ · CI PASS / AWAITING LAB

- [ ] Νίκη Ραζάτου: χωριστή εταιρεία ανά ΑΦΜ, κοινή είσοδος ιδιοκτήτη, Super Admin ιεραρχία και ασφαλής αφαίρεση λανθασμένου καταστήματος ΚΑΤ. Κλάδος `codex/owner-multi-company-20260928`· κανένα παραγωγικό δεδομένο ή είδος δεν μεταβλήθηκε. `CHECKPOINTS/CHANGES/2026-09-28-diadochou-owner-multi-company.md`.

## 28/09/2026 — Κεντρικό αριθμημένο μητρώο / αναμονή CI

- [ ] Νέα σταθερή αρίθμηση G01–G08 και 01–36, προτεραιότητες, υπάρχουσες αναθέσεις και φωτογραφίες ιδιοκτήτη. `docs/roadmap/CENTRAL_NUMBERED_WORK_2026-09-28.md`, εκτυπώσιμο `output/pdf/MyWorkStation_Numbered_Work_2026-09-28.pdf`. PR #1504· CI και merge αναμένονται. Δεν έγινε νέα LAB κίνηση ούτε νέο λειτουργικό PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-09-28-central-numbered-work-register.md`.

## 28/09/2026 — TABLE_SERVICE ασφαλής επανάληψη γύρου · CI/DEPLOY PASS · AWAITING LAB

- [ ] Ο ίδιος αμετάβλητος mobile γύρος φέρει μοναδικό key και η επανάληψη της ίδιας προσπάθειας επιστρέφει το αρχικό αποτέλεσμα χωρίς δεύτερο γύρο/πόστο/Audit· σύγκρουση payload ή χειριστή απορρίπτεται. 11 tests και production build PASS· PR #1501 / CI #3782 / merge και exact Render `675ee74` PASS· database/φυσικό LAB AWAITING. Δεν στάλθηκε νέος γύρος. `CHECKPOINTS/CHANGES/2026-09-28-table-service-round-idempotency.md`. Συνολικό TABLE_SERVICE OPEN.

## 28/09/2026 19:19–19:20 Ελλάδα — TABLE_SERVICE εγκατεστημένο Android PWA · περιορισμένο USER PASS offline/reconnect οθόνης

- [x] Φωτογραφίες ιδιοκτήτη `image-1790612351196.jpg` 19:19 και `image-1790612423703.jpg` 19:20: στην Παραγγελιοληψία κινητού LAB POS 2 εμφανίστηκε η ένδειξη «Χωρίς σύνδεση» και έπειτα εξαφανίστηκε με επαναφορά δικτύου. Το ΤΡΑΠΕΖΙ LAB 1 εμφανίστηκε READY · 3,00 € και στις δύο λήψεις. Βάση PR #1482 / CI #3732 / exact Render `ce6c6ccc19fc77ebcd7faea0cd740c75c6c9418f`. USER PASS μόνο ορατής offline/reconnect ένδειξης και διατήρησης της οθόνης· ανάκτηση προϊόντων, ενεργοποίηση κουμπιού, πραγματικό POST/απουσία POST στη βάση και οικονομικά/stock NOT TESTED. Συνολικό TABLE_SERVICE OPEN. `CHECKPOINTS/CHANGES/2026-09-28-table-service-mobile-reconnect.md`.

## 28/09/2026 15:34 Ελλάδα — Super Admin AI Command Center ΦΑΣΗ 2 · Κέντρο Προβλημάτων

- [x] PR #1493 / CI #3763 και #3764 / deploy #1753 / exact production `083792d9fc943575b19ac52a55d059224d264689`: `image(4).png` δείχνει 3 ανοικτά σημεία (Ταμεία 0, Πληρωμές 0, Τράπεζα 3) και `image(5).png` επιβεβαιώνει μετάβαση στην κανονική οθόνη Τράπεζας με −193,00 € σε αναμονή και τις ανοικτές κινήσεις. Περιορισμένο USER visual PASS συγκέντρωσης/μετάβασης· καμία επιβεβαίωση, αποδεικτικό ή οικονομική/stock/fiscal μεταβολή. `CHECKPOINTS/CHANGES/2026-09-28-super-admin-ai-command-center-phase2-problems.md`.

## 28/09/2026 15:31 Ελλάδα — Gate 3 Βοηθός Τιμολογίου · PASS συμφωνημένης LAB ροής

- [x] Ο ιδιοκτήτης επιβεβαίωσε ότι τα ίδια βήματα και οι εικόνες έχουν ήδη δοθεί και δεν επαναλαμβάνονται. Το `image(20260928-123047).png` δείχνει στο υπάρχον ΜΑΝΤΖΙΛΑΣ 13241 22 είδη, 345,07 € καθαρό με ΕΦΚ, 410,15 € πληρωτέο και ορατό «Ανάγνωση από βοηθό · πρόχειρο για έλεγχο». Οι προηγούμενες εικόνες + έντυπο τεκμηριώνουν 22/22 φυσικές σειρές/κωδικούς/ποσότητες. Διαπρομηθευτικά τεκμήρια: ΣΙΓΜΑ 180557 (10), ΓΕΩΡΓΙΑΔΟΥ Β 1970 (6 και ορατή οριστική αγορά/stock), ΜΑΓΑΚΗΣ 52244 (δίφυλλο 30), ΜΑΝΤΖΙΛΑΣ 13234 (17) / 13241 (22, ΕΦΚ) και ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ 053688 (οριστική αγορά/stock). #1490 CI #3755 merge `fbba0eac`, #1491 CI #3757 merge `628470dd`, ακριβές Render `628470dd`. **PASS του Gate 3 για POS → βοηθό → ίδιο επεξεργάσιμο πρόχειρο → ανθρώπινο έλεγχο/εφαρμογή και ασφαλή ορατή τελική πορεία στα ξεχωριστά δοκιμασμένα δείγματα.** Δεν έγινε νέο POS upload/πληρωμή. Το παλιό κείμενο περιγραφής στη συγκεκριμένη εικόνα δεν είναι νέο οπτικό PASS του #1491. Η αρχική αυτόματη εξαγωγή, ιστορικό ατομικό FAIL ΑΛΦΑ, ανεξάρτητο DB count settlement/job και πλήρες μετρημένο πριν/μετά είναι εκτός επιβεβαιωμένου PASS και παραμένουν ρητά NOT TESTED/μελλοντική εργασία. Αναλυτικό `CHECKPOINTS/CHANGES/2026-09-28-gate3-acceptance-reconciliation.md` και `docs/manual/invoices/PASS.md`. Τα παλιότερα OPEN παρακάτω είναι ιστορικές χρονικές καταγραφές, όχι η σημερινή κατάσταση.

## 28/09/2026 — Gate 3 ένδειξη υπάρχοντος POS προχείρου · CI PASS / AWAITING LAB

- [ ] Το #1490 / CI #3755 συγχωνεύτηκε ως `fbba0eac95efc6c942ed78f53eac941c9ee7cc45`. Η δημιουργία νέου προχείρου γράφει «Ανάγνωση από βοηθό», όμως το ήδη αποθηκευμένο 13241 διατηρεί την παλιά περιγραφή. Στενή αλλαγή προβολής αντικαθιστά μόνο την παλιά φράση «αναμονή πλήρους ανάγνωσης» στην κεντρική λίστα και στο πεδίο περιγραφής της επεξεργασίας· δεν αλλάζει βάση, πληρωμή ή γραμμές. Μετά CI/merge/exact deploy, ανανέωση του **ίδιου** 13241 επιβεβαιώνει την ένδειξη χωρίς νέο POS upload. `CHECKPOINTS/CHANGES/2026-09-28-gate3-acceptance-reconciliation.md`.

## 28/09/2026 12:00 Ελλάδα — Gate 3 συγκεντρωτική συμφιλίωση / νέα ένδειξη AWAITING CI-LAB

- [ ] Τα διαφορετικά LAB δείγματα ΣΙΓΜΑ 180557, ΓΕΩΡΓΙΑΔΟΥ Β 1970, ΜΑΓΑΚΗΣ 52244, ΜΑΝΤΖΙΛΑΣ 13234/13241 και ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ 053688 συμφιλιώθηκαν στο `CHECKPOINTS/CHANGES/2026-09-28-gate3-acceptance-reconciliation.md` και στο κεντρικό `output/pdf/MyWorkStation_Central_Gate3_Status_2026-09-28.pdf`. Το 13241 είναι πλέον PASS 22/22 σειρών, αλλά το συνολικό Gate 3 OPEN. Το PR #1490 διορθώνει μόνο τη στάσιμη περιγραφή «αναμονή πλήρους ανάγνωσης» σε «Ανάγνωση από βοηθό» στα νέα POS πρόχειρα και στη θυρίδα· CI, exact deploy και πραγματικό LAB readback AWAITING. Παλιά FAIL παραμένουν ιστορικά, χωρίς επανυποβολή. Μοναδικότητα settlement/job στη βάση και πλήρες μετρημένο πριν/μετά NOT TESTED· δεν εικάζονται ως PASS.

## 28/09/2026 11:34 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · LAB PASS 22/22 σειρών στο ίδιο πρόχειρο

- [x] Το πρωτότυπο `ΜΑΝΤΖΙΛΑΣ(1).jpg` και οι εικόνες `081918`, `081942`, `081942-1`, `083429` επιτρέπουν πλέον αντιπαραβολή και της προηγουμένως κρυμμένης σειράς 15 (`60002`, κενό μπύρας, 1 ΤΜΧ / 6,03 €). **22/22 φυσικές σειρές** με ίδιους κωδικούς, περιγραφές και τυπωμένες ποσότητες, συμπεριλαμβανομένων των επαναλαμβανόμενων κενών· COCA COLA ZERO και ΛΟΥΞ αντιστράφηκαν μόνο σε σειρά εμφάνισης. Ίδιο επεξεργάσιμο πρόχειρο 13241, προμηθευτής ΑΦΜ 081565488, 345,07 € καθαρό με ΕΦΚ + 65,08 € ΦΠΑ = 410,15 € πληρωτέο, διαφορά 0,00 €. Περιορισμένο LAB PASS πλήρους πίνακα αυτού του παραστατικού. Τελική καταχώριση, ανεξάρτητη ταυτότητα settlement/job στη βάση και stock/καρτέλα προμηθευτή NOT TESTED στο 13241. Δεν ζητείται νέο POS ανέβασμα ή αντιστοίχιση για το LAB δείγμα. Συνολικό Gate 3 OPEN κατά τη διαπρομηθευτική συμφιλίωση. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 10:47 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · περιορισμένο LAB PASS εφαρμογής στο ίδιο πρόχειρο

- [x] Μετά από μία POS υποβολή LAB POS 2 και έλεγχο βοηθού, η `image(20260928-074638).png` δείχνει το **ίδιο επεξεργάσιμο πρόχειρο 13241** με σωστό προμηθευτή/ΑΦΜ 081565488, **22 είδη**, καθαρό με ΕΦΚ **345,07 €** και σύνολο με ΦΠΑ **410,15 €**, όσο το τυπωμένο παραστατικό. Η ορατή γραμμή 7, κωδικός `14`, ΑΛΦΑ 0,5LT ΚΟΥΤΙ έχει 1 ΚΒ → 24 τεμάχια αποθήκης, ΕΦΚ 6,86 € και πληρωτέο γραμμής 30,89 €. Περιορισμένο LAB PASS μεταφοράς των 22 σειρών στο ίδιο πρόχειρο και οικονομικού συνόλου. Η φωτογραφία δεν δείχνει όλες τις σειρές ούτε ανεξάρτητη ταύτιση 22/22 κωδικών/περιγραφών· το κείμενο πρόχειρου «αναμονή πλήρους ανάγνωσης» παραμένει παλιό status. Τελική καταχώριση, κίνηση stock, καρτέλα προμηθευτή, δεύτερη πληρωμή, βάρδια/άλλο POS NOT TESTED από το δείγμα. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 10:34 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · περιορισμένο LAB PASS ορατότητας γραμμών

- [x] Μετά το PR #1485 / CI #3740 / exact Render `47baf2d70bd268289ab006cf21050803b26701fe`, η νέα ανάγνωση του ίδιου πρόχειρου στο `image(20260928-073441).png` εμφανίζει 22 φυσικές γραμμές, 0 διορθώσεις στις 2 υπάρχουσες, 20 ελλείπουσες **και 20 με όλα τα πεδία και βεβαιότητα**, 0 ΠΡΟΣ ΕΛΕΓΧΟ, 0 διαγραφές. Καθαρό με ΕΦΚ 345,07 € + ΦΠΑ 65,08 € = τυπωμένο 410,15 €, διαφορά 0,00 €. Περιορισμένο LAB PASS του readback/ορατότητας μετά τη διόρθωση. Η φωτογραφία δείχνει μόνο τις πρώτες 10 γραμμές του πίνακα· ανεξάρτητη σύγκριση και των 22 φυσικών κωδικών/περιγραφών με το πρωτότυπο, εφαρμογή στο πρόχειρο και επιδράσεις τελικής καταχώρισης NOT TESTED. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · ορατότητα πέντε μη έγκυρων γραμμών AWAITING LAB

- [ ] Στο `image(20260928-070230).png` ο βοηθός δηλώνει 20 ελλείπουσες γραμμές αλλά μόνο 15 με όλα τα πεδία και βεβαιότητα, ενώ ο πίνακας εμφανίζει 0 ΠΡΟΣ ΕΛΕΓΧΟ. Η UI αλλαγή σημαίνει επιπλέον κάθε γραμμή που αποτυγχάνει τον υπάρχοντα αριθμητικό/υποχρεωτικό έλεγχο ως ΠΡΟΣ ΕΛΕΓΧΟ με συγκεκριμένο λόγο, χωρίς αλλαγή στη φόρμουλα, στο gate εφαρμογής ή στα δεδομένα. CI/exact deploy/οπτικό LAB readback των πέντε σειρών AWAITING. Εφαρμογή/οριστικοποίηση NOT TESTED. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 10:02 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · περιορισμένο LAB PASS σύγκρισης ΕΦΚ

- [x] Μετά το PR #1480 / CI #3728 / exact Render `e6706131842f05d187462d25c43ea34e711ce386`, η νέα ανάγνωση του **ίδιου** πρόχειρου στο `image(20260928-070230).png` εμφανίζει 22/22 φυσικές γραμμές, 77 τυπωμένες μονάδες (προηγούμενο readback), 0 διορθώσεις υπαρχουσών, 20 γραμμές ελλείπουσες από τις 2 υπάρχουσες, 15 πλήρεις/βέβαιες ελλείπουσες και 0 ΠΡΟΣ ΕΛΕΓΧΟ στον πίνακα. Καθαρό με ΕΦΚ 345,07 € + ΦΠΑ 65,08 € = τυπωμένο 410,15 €, διαφορά 0,00 €. Ο λανθασμένος φραγμός 280,93 € έναντι 345,07 € δεν εμφανίζεται και το κουμπί «Εφαρμογή επιλεγμένων στο πρόχειρο» είναι ενεργό. **Περιορισμένο LAB PASS του ελέγχου βάσης ΕΦΚ**, όχι πλήρες PASS κάθε προϊόντος. Καμία γραμμή δεν επιλέχθηκε/εφαρμόστηκε στο νέο στιγμιότυπο· εφαρμογή, τελικό πρόχειρο, stock και οριστικοποίηση NOT TESTED. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 00:54 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · λανθασμένη σύγκριση ΕΦΚ

- [ ] Η εικόνα `image(20260927-215408).png` αποδεικνύει 22 τυπωμένες σειρές/77 μονάδες και προεπισκόπηση 410,15 €, όμως ο server φράσσει την εφαρμογή: συγκρίνει 280,93 € καθαρό χωρίς ΕΦΚ με 345,07 € τυπωμένη φορολογητέα καθαρή αξία **με ΕΦΚ 64,14 €**. 280,93 + 64,14 = 345,07 €. Στενή διόρθωση του gate δέχεται ρητά είτε καθαρό χωρίς ΕΦΚ είτε φορολογητέο καθαρό με ΕΦΚ, μόνο με πλήρη μη αρνητικά ποσά ΕΦΚ ανά σειρά. Παραμένουν απαιτούμενα πλήθος/σελίδες/ποσότητα/μικτό και ανθρώπινος έλεγχος γραμμών· καμία αυτόματη εφαρμογή, πληρωμή ή stock. CI/deploy/νέα ανάγνωση στο ίδιο πρόχειρο AWAITING LAB, Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 — TABLE_SERVICE κινητό offline/reconnect UX · ιστορικό AWAITING LAB, οπτικό σκέλος κλείστηκε 19:20

- [x] Η φυσική Android οθόνη εμφάνισε και αφαίρεσε την offline ένδειξη 19:19–19:20 μετά PR #1482 / CI #3732 / exact deploy `ce6c6cc`· τα υπόλοιπα κριτήρια της αρχικής πρότασης παραμένουν NOT TESTED όπως δηλώνει η νεότερη κορυφαία εγγραφή. Δεν υλοποιείται offline ουρά ή server idempotency. Συνολικό TABLE_SERVICE OPEN. `CHECKPOINTS/CHANGES/2026-09-28-table-service-mobile-reconnect.md`.

## 28/09/2026 ~00:52 Ελλάδα — TABLE_SERVICE Android Store Mode PWA · περιορισμένο USER PASS

- [x] Ο ιδιοκτήτης επιβεβαίωσε ότι το Store Mode PWA κατέβηκε και εγκαταστάθηκε στο φυσικό Android και, μετά το κλείσιμο του Chrome, το νέο εικονίδιο άνοιξε απευθείας το LAB Store Mode με είσοδο PIN. PR #1474 / CI #3717 / exact Render `edf44d95a1d5e9765b9c11e7a2ad2b14f8a43529` ήταν η ήδη επαληθευμένη βάση πριν τη φυσική δοκιμή. PASS μόνο εγκατάστασης/εκκίνησης. Offline/reconnect, αποστολή γύρου από το εγκατεστημένο εικονίδιο και άλλο κατάστημα NOT TESTED. Συνολικό TABLE_SERVICE OPEN. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.

## 28/09/2026 ~00:35 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · περιορισμένο LAB PASS κανόνα

- [x] Στο ίδιο πρόχειρο της μίας POS υποβολής, η `image(20260927-213508).png` δείχνει επιτυχή αποθήκευση ρητού κανόνα για τη φυσική γραμμή 7, κωδικό `14`, ΑΛΦΑ 0,5LT ΚΟΥΤΙ: **1 ΚΒ = 24 ΤΜ** για τον προμηθευτή ΜΑΝΤΖΙΛΑΣ ΧΡΗΣΤΟΣ ΚΑΙ ΣΙΑ ΕΕ. Η τυπωμένη ποσότητα και η αξία δεν άλλαξαν. Περιορισμένο LAB PASS μόνο της αποθήκευσης κανόνα. Η ίδια οθόνη αναφέρει ότι η οικονομική γραμμή **δεν προστέθηκε** στο πρόχειρο λόγω μη επαληθευμένης ανάγνωσης ή ποσών. Η προεπισκόπηση δείχνει 22 γραμμές, καθαρό με ΕΦΚ 345,07 € + ΦΠΑ 65,08 € = 410,15 €, τυπωμένο 410,15 €, αλλά αρκετές σειρές παραμένουν ΠΡΟΣ ΕΛΕΓΧΟ· συμφωνία αθροίσματος δεν πιστοποιεί κάθε σειρά. Εφαρμογή γραμμών, πλήρες πρόχειρο, τελική καταχώριση και επιδράσεις πληρωμής/stock NOT TESTED. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 28/09/2026 — TABLE_SERVICE Store Mode PWA · ιστορικό AWAITING LAB, κλείστηκε ~00:52

- [x] Διόρθωση κοινής αρχικής διαδρομής `/` με manifest ανά `/store/<id>`· PR #1474 / CI #3717 / exact deploy `edf44d9` και παραπάνω φυσικό USER PASS. Offline αποστολή δεν επιτρέπεται· συνολικό TABLE_SERVICE OPEN.

## 28/09/2026 00:26 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · κανόνας ακόμη μπλοκαρισμένος

- [ ] Μετά το #1470, το `image(20260927-212551).png` δείχνει 22 τυπωμένες γραμμές, 2 υπάρχουσες και 20 ελλείπουσες στο πρόχειρο, πρώτη υπολογισμένη καθαρή 280,93 € έναντι 345,07 € τυπωμένης. Ο ιδιοκτήτης επέλεξε τη γραμμή 7 / κωδικό 14 / 1 ΚΒ = 24 ΤΜ. Στο `212612` η οικονομική προεπισκόπηση εμφανίζει 345,07 € + 65,08 € = 410,15 €, αλλά η αποθήκευση του κανόνα απορρίφθηκε επειδή η πλήρης ανάγνωση παραμένει μη επιβεβαιωμένη. PR νέο επιτρέπει μόνο κεντρικό ρητό κανόνα με γνωστό τυπωμένο σύνολο σε μονοσέλιδο, χωρίς νέα οικονομική γραμμή όσο το page gate είναι κλειστό. CI/LAB AWAITING· καμία εφαρμογή/οριστικοποίηση. Gate 3 OPEN.

## 28/09/2026 00:12 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · δεύτερη φραγή κανόνα

- [ ] Μετά το #1468, το dropdown επέλεξε συγκεκριμένα τη φυσική γραμμή 7 / κωδικό 14 / ΑΛΦΑ 0,5LT ΚΟΥΤΙ και 1 ΚΒ = 24 ΤΜ. Το `image(20260927-211155).png` δείχνει πλέον συνολικά 345,07 € καθαρό + 65,08 € ΦΠΑ = 410,15 € και ενεργό κουμπί εφαρμογής, αλλά η αποθήκευση κανόνα επέστρεψε «Η γραμμή δεν έχει όλα τα ποσά». Κανόνας NOT SAVED και γραμμές NOT APPLIED. PR νέο: αποθήκευση επαληθευμένου κωδικού/συντελεστή χωρίς να απαιτεί πλήρη οικονομικά· υπάρχουσα γραμμή λαμβάνει μόνο μετατροπή, νέα οικονομική γραμμή προστίθεται μόνο αν είναι έγκυρη. Δεν ισχυριζόμαστε συμφωνία κάθε γραμμής από το συνολικό άθροισμα. CI/LAB AWAITING. Gate 3 OPEN.

## 27/09/2026 23:54 Ελλάδα — Gate 3 ΜΑΝΤΖΙΛΑΣ 13241 · κανόνας συσκευασίας LAB FAIL

- [ ] Μία υποβολή LAB POS 2 → ίδιο πρόχειρο με προμηθευτή/ΑΦΜ 081565488, 0 γραμμές/0,00 € αρχικά. Ο βοηθός διάβασε 22 φυσικές γραμμές και σωστά τυπωμένα 345,07 € καθαρό + 65,08 € ΦΠΑ = 410,15 €. Από τις προτεινόμενες γραμμές υπολογίζει 280,93 € καθαρό (−64,14 €), άρα η εφαρμογή παραμένει μπλοκαρισμένη. Επιστροφή κενών 15,72 € και νέο υπόλοιπο 394,43 € δεν είναι πληρωτέο τιμολογίου. Στην προαιρετική εκμάθηση ο ιδιοκτήτης επέλεξε τη γραμμή 3, κωδικό 12798, 1 ΚΒ = 12 ΤΜ, αλλά εμφανίστηκε «Επίλεξε μία μοναδική γραμμή με τυπωμένο κωδικό» χωρίς αποθήκευση. PR #1466 δένει την επιλογή στη φυσική γραμμή και ξεχωρίζει μήνυμα ελλιπούς σελίδας/συνόλου. CI/LAB αποθήκευση στο ίδιο πρόχειρο AWAITING. Καμία εφαρμογή, οριστικοποίηση ή νέα POS πράξη. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.
## 28/09/2026 00:19 Ελλάδα — TABLE_SERVICE κεντρικό Audit · περιορισμένο production LAB PASS

- [x] PR #1471 / CI #3711 / exact Render `755c976`: κεντρικά Συμβάντα ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ δείχνουν Γύρο 3 στις 27/09 23:41, LAB POS 2, 1 είδος, +1,00 €, λογαριασμό 3,00 €, ποσό Audit 0,00 €, και ολοκλήρωση ΚΑΦΕ στις 23:47, ποσό 0,00 €. Χρησιμοποιήθηκαν τα υπάρχοντα συμβάντα χωρίς νέα παραγγελία, πώληση ή πληρωμή. Συνολικό TABLE_SERVICE OPEN.

## 27/09/2026 23:42 Ελλάδα — TABLE_SERVICE κινητό · φυσική αποστολή LAB PASS περιορισμένου σκέλους

- [x] Android/Chrome, προσωπικό PIN LAB POS 2 (κεντρικό Audit 23:37), ΤΡΑΠΕΖΙ LAB 1 READY 2,00 € → μία αποστολή Γύρου 3, 1× LAB ΚΑΦΕΣ ΔΟΚΙΜΗΣ με δωρεάν product-specific «ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ», SENT 3,00 €. BackOffice ΚΑΦΕ εμφάνισε τη σωστή επιλογή, πόστο ΕΤΟΙΜΗ και ενεργή ουρά 1→0. PR #1461 / CI #3694 / exact προηγούμενο Render `c64c80da`. Φωτογραφίες ιδιοκτήτη 23:38/23:41.
- [x] Πριν/μετά: MAIN 0,00 €/0, LAB-POS-02 0,00 €/2, stock LAB καφέ −2 με ίδια τελευταία πώληση· χωρίς Sale/Payment. Η κεντρική προβολή Audit έδειξε login PIN αλλά όχι ξεχωριστό event γύρου, παρότι η server ροή γράφει `TABLE_ORDER_ROUND_SENT` στο `StoreOperatorAudit`. Ορατότητα event OPEN. Αριθμητικό baseline ουράς ακριβώς πριν την αποστολή NOT RECORDED.
- [ ] Εγκατάσταση PWA, offline/reconnect, αρνητικό cross-store, επιλογές με χρέωση, πλήρες KDS, μεταφορά/ένωση/split και συνολικό TABLE_SERVICE OPEN. Το πλήρες manual εργαζομένου/ιδιοκτήτη/Super Admin μόνο στο συνολικό PASS. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.

## 27/09/2026 ~23:17 Ελλάδα — TABLE_SERVICE κινητό · product-specific οπτικό readback

- [x] #1461 / CI #3694 / exact Render `c64c80da`: καθαρή LAB συνεδρία `LAB POS 2`, οθόνη κινητής παραγγελίας, `ΤΡΑΠΕΖΙ LAB 1` READY 2,00 €. Αναζήτηση `LAB ΚΑΦΕΣ`, προσθήκη μη σταλμένης γραμμής 1,00 € φόρτωσε μόνο `LAB ΕΠΙΛΟΓΗ ΓΑΛΑΚΤΟΣ` και επιλογή `ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ` 0→1. Η γραμμή αφαιρέθηκε, αποστολή disabled, επιστροφή POS.
- [ ] Αυτό είναι οπτικό readback επιλογής, **όχι PASS αποστολής από φυσικό κινητό**. Γύρος/ουρά/Audit, PIN νέας συνεδρίας, βάρδιες/stock και cross-store NOT TESTED. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.

## 27/09/2026 23:12 Ελλάδα — Gate 3 ΜΑΓΑΚΗΣ 52244 · περιορισμένο LAB PASS δίφυλλου

- [x] Μία POS υποβολή, δύο αρίθμητα φύλλα, ένα πρόχειρο με σωστό προμηθευτή/ΑΦΜ 801908583. Μετά το #1449 / CI #3675 / exact Render `af0fcbfd`, ο βοηθός επέτρεψε ανθρώπινο έλεγχο 30 γραμμών/110 τμχ· ο ιδιοκτήτης συμπλήρωσε την αβέβαιη ονομασία της 8ης και εφάρμοσε και τις 30 στο ίδιο πρόχειρο. Στιγμιότυπα `195700`–`195752` και `200932`–`201016`: 30 είδη, καθαρό 153,74 € αντί 153,70 € (+0,04), πληρωτέο 173,70 € αντί 173,68 € (+0,02), εντός ±0,05 €. Το 173,43 € είναι υπόλοιπο λογαριασμού, όχι πληρωτέο. Ο ιδιοκτήτης εξαιρεί ρητά επανάληψη οριστικοποίησης/stock για αυτό το LAB δείγμα, επειδή η διαδρομή δοκιμάστηκε σε άλλα τιμολόγια. Δεν έγινε νέα POS υποβολή/πληρωμή ούτε τελική πράξη. Συνολικό Gate 3 OPEN για άλλα σενάρια. `CHECKPOINTS/CHANGES/2026-09-27-gate3-magakis-52244-unnumbered-pages.md`.

## 27/09/2026 ~23:08 Ελλάδα — TABLE_SERVICE κινητό · product-specific επιλογές σε υλοποίηση

- [ ] Μετά το οπτικό readback #1458, νέα περιορισμένη αλλαγή φορτώνει ομάδες modifiers ανά προϊόν, μόνο επιλογές χωρίς πρόσθετη χρέωση, με min/max και χωριστές γραμμές ίδιου είδους. Χρεώσιμες επιλογές/εισφορά μένουν στο POS επειδή το συνολικό table order δεν τις τιμολογεί. Branch `feat/table-service-mobile-modifiers-20260927`, CI/deploy/LAB AWAITING. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.

## 27/09/2026 — EAN-13 ετικέτα: απομόνωση καταστημάτων PASS / scope κλειστό

PR #1457 / CI #3685 / exact Render `3895e89a`: δεύτερο LAB `cmuk8gxui000ppabfykdxwb1y` 50 × 30 mm / δικός του εκτυπωτής μετά από αποθήκευση και νέα ανάγνωση· πρώτο LAB αμετάβλητο 60 × 40 mm. PR #1459 / CI #3690 / main `0fc6805c`: απομονωμένο HTTP E2E με χειριστή PIN, ίδιο κατάστημα 200, sibling ίδιας εταιρείας 403, ξένη εταιρεία 403, χωρίς διαρροή ρυθμίσεων. Production LAB token προς ξένο store API NOT TESTED. Το ΚΑΤ δεν άλλαξε. Η εκκρεμότητα EAN-13 ετικέτας αφαιρέθηκε· άλλα barcode scopes χωριστά. `CHECKPOINTS/CHANGES/2026-09-27-ean13-label-isolation-final.md`.


## 27/09/2026 — Ετικέτες: δεύτερο LAB readback PASS, HTTP E2E AWAITING CI

Στο exact Render `3895e89a`, δεύτερο LAB `cmuk8gxui000ppabfykdxwb1y` αποθηκεύει/ξαναδιαβάζει 50 × 30 mm και δικό του εκτυπωτή· αρχικό LAB μένει 60 × 40 mm. ΚΑΤ αμετάβλητο. Προστέθηκε απομονωμένο πραγματικό HTTP E2E για δικό του endpoint 200 και sibling/foreign 403 χωρίς διαρροή, αναμένει CI. Production API denial με πραγματικό LAB token NOT TESTED, συνολικό isolation OPEN. `CHECKPOINTS/CHANGES/2026-09-27-label-http-isolation-awaiting-ci.md`.


## 27/09/2026 ~22:43 Ελλάδα — TABLE_SERVICE κινητό · οπτικό readback, αποστολή OPEN

- [x] #1455 / CI #3682 / exact Render `0cc2f6d0`: στην καθαρή LAB συνεδρία χειριστή `LAB POS 2` η οθόνη άνοιξε. Εμφανίστηκαν `ΚΕΝΤΡΙΚΗ ΣΑΛΑ LAB`, `ΤΡΑΠΕΖΙ LAB 1` READY 2,00 €, νέος γύρος στον ίδιο λογαριασμό, και αναζήτηση `LAB ΚΑΦΕΣ` → SKU `LAB-CAFE-20260927` 1,00 €.
- [ ] Δεν προστέθηκε είδος ή στάλθηκε γύρος· κινητή συσκευή, PIN/κάρτα νέας συνεδρίας, ουρά/Audit/βάρδιες/stock και αρνητικό άλλο κατάστημα NOT TESTED. Δεν είναι mobile LAB PASS. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.

## 27/09/2026 — Δεύτερο LAB κατάστημα για απομόνωση ετικέτας: AWAITING CI/DEPLOY/LIVE

Προστέθηκε στη Super Admin καρτέλα εταιρείας η δημιουργία νέου καταστήματος με χωριστό κατάλογο/στοκ/χειριστές και αρχικές βάρδιες. Τοπικό frontend build και server syntax PASS. Δεν δημιουργήθηκε ακόμη το δεύτερο LAB κατάστημα: αναμένεται CI/deploy και πραγματικό readback, κατόπιν API denial χειριστή LAB προς το δεύτερο LAB και ΚΑΤ. Συνολικό isolation OPEN. `CHECKPOINTS/CHANGES/2026-09-27-lab-second-store-setup-awaiting-live.md`.

## 27/09/2026 ~22:35 Ελλάδα — TABLE_SERVICE κινητό · visual LAB FAIL / στενή διόρθωση

- [ ] #1451 / CI #3678 / exact Render `acdb57c5`: κουμπί LAB εμφανίστηκε, αλλά η οθόνη έδειξε ψευδές ανενεργό module λόγω διπλού ελέγχου POS catalog. Καμία παραγγελία. Αφαιρέθηκε μόνο ο πρόσθετος έλεγχος· νέο CI/deploy/visual readback AWAITING. Αποστολή, stock και βάρδιες NOT TESTED. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.

## 27/09/2026 22:29 Ελλάδα — Ετικέτα EAN-13: απομόνωση σε code test, live OPEN

Στο Platform Admin διαβάστηκαν χωρίς αποθήκευση οι ρυθμίσεις LAB 60 × 40 mm / «LAB δοκιμαστικός εκτυπωτής» και ΚΑΤ 60 × 38 mm / κενός εκτυπωτής. Η διαδρομή Store Mode ΚΑΤ από το LAB POS 2 εμφάνισε είσοδο PIN ΚΑΤ· η LAB συνεδρία επανήλθε. `server/test/pos-label-tenant-isolation.test.js` 3/3 τοπικά PASS για ίδια/δεύτερη LAB/ΚΑΤ πρόσβαση και company/store scoping. Αυτό **δεν είναι live API denial**. Το LAB έχει μόνο ένα κατάστημα και η οθόνη Super Admin δεν δημιουργεί δεύτερο στην ίδια εταιρεία. Live API αίτημα και δεύτερο LAB κατάστημα NOT TESTED, συνολικό scope OPEN. PR #1450 / CI αναμένεται. Καμία αλλαγή στο ΚΑΤ.


## 27/09/2026 22:13 Ελλάδα — TABLE_SERVICE κάτοψη · περιορισμένο production LAB PASS

- [x] PR #1445 / CI #3667 / exact Render `85dc8d5e`: BackOffice Super Admin, ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, `ΚΕΝΤΡΙΚΗ ΣΑΛΑ LAB`. Ένα σύρσιμο του υπάρχοντος `ΤΡΑΠΕΖΙ LAB 1` από οπτική θέση 18%/20% σε αποθηκευμένη 41%/24%. Μετά από ανανέωση από τη βάση η θέση έμεινε 41%/24%.
- [x] Κεντρικό Audit 22:13: «Ενημέρωση τραπεζιού», ίδιο τραπέζι/σάλα/4 άτομα/σχήμα, χειριστής Χρήστος Μάνης, 0,00 €. Ανοικτός λογαριασμός ΕΤΟΙΜΗ 2,00 € χωρίς πώληση, ουρές 0. `MAIN` 0,00 €/0, control `LAB-POS-02` 0,00 €/2 και stock LAB καφέ -2 (τελευταία πώληση 19:42:24 Ελλάδα) αμετάβλητα.
- [ ] Το συνολικό TABLE_SERVICE παραμένει OPEN για mobile σερβιτόρο, μεταφορά/ένωση/split, πλήρες KDS/ειδοποιήσεις και λοιπές ανεξάρτητες επεκτάσεις. Η κάτοψη κλείνει PASS, δεν επαναλαμβάνεται μόνο για τεκμηρίωση. `CHECKPOINTS/CHANGES/2026-09-27-table-service-layout-takeover.md`.


## 27/09/2026 21:53 Ελλάδα — TABLE_SERVICE μεταφορά σε νέα σελίδα · κάτοψη CI PASS / AWAITING LAB

- [x] Ο ιδιοκτήτης δήλωσε ότι η προηγούμενη σελίδα κόλλησε και έδωσε ρητή έγκριση να αναληφθεί εδώ η συνέχεια. Νέα υπεύθυνη σελίδα/branch: `agent/table-service-layout-takeover-20260927`. Η προηγούμενη ανάθεση `agent/table-service-restaurant-20260927` παραδίδεται με το παρόν συγχωνεύσιμο checkpoint.
- [x] Διατηρείται το production LAB PASS δομημένων αλλεργιογόνων (#1439), χωριστά από σημείωση, ουρά ΚΑΦΕ 1→0, τραπέζι ΕΤΟΙΜΗ 2,00 €, χωρίς πώληση/stock/μεταβολή βαρδιών.
- [x] Ιστορικό scope που έκλεισε στο νεότερο LAB PASS: μετακίνηση τραπεζιών στην οπτική κάτοψη ανά σάλα και αποθήκευση `positionX/positionY` με Audit. Δεν έγινε production πώληση.
- [ ] Τα υπόλοιπα TABLE_SERVICE scopes (mobile σερβιτόρος, μεταφορές/split, KDS, ειδοποιήσεις, αναφορές) παραμένουν OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-27-table-service-layout-takeover.md`.


## 27/09/2026 21:47 Ελλάδα — Ετικέτα EAN-13: checksum UI LAB PASS, tenant isolation OPEN

Στο LAB POS 2, το δοκιμαστικό LAB EXCEL TEST 2 / SKU `LAB-EXCEL-20260909-02` απέκτησε το άκυρο 13ψήφιο `4006381333932` χωρίς τιμή. Μετά από πλήρη ανανέωση, εμφανίζεται στο προϊόν αλλά **δεν υπάρχει κουμπί ετικέτας γι' αυτό**· το έγκυρο `2900000000025` συνεχίζει να προσφέρεται. Κανένα νέο εκτυπώσιμο tab, καλάθι 0,00 €, stock 0 πριν/μετά, τοπική ουρά 0. **Περιορισμένο LAB PASS checksum UI.** Δεν έγινε πώληση/εκτύπωση· κινήσεις stock, βάρδια και Audit χωρίς πλήρες baseline NOT TESTED. Απομόνωση δεύτερου δοκιμαστικού καταστήματος OPEN, συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.


## 27/09/2026 — Ετικέτα EAN-13: μη EAN μήκος LAB PASS, checksum UI OPEN

Στο LAB POS 2, Barcode → SPRITE 500ML / SKU 992 / `54491069` (8 ψηφία, stock 0) εμφάνισε «Δεν υπάρχει έγκυρο EAN-13» χωρίς κουμπί ετικέτας ή νέο εκτυπώσιμο tab. Δεν έγινε αποθήκευση, εκτύπωση ή πώληση. **LAB PASS μόνο για αποκλεισμό μη EAN μήκους.** Τοπικά 3/3 EAN tests PASS για λάθος checksum `4006381333932` χωρίς εγγραφή εκτυπώσιμου εγγράφου, όχι UI LAB PASS. Άκυρο 13ψήφιο checksum στο UI και απομόνωση δεύτερου δοκιμαστικού καταστήματος NOT TESTED. Το #1440 Audit LAB PASS και το USER PASS φυσικής εκτύπωσης→σάρωσης διατηρούνται· συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 — Ετικέτα EAN-13: LAB PASS Audit προεπισκόπησης, υπόλοιπα OPEN

PR #1435 / CI #3644 / exact Render `05af8875175b50be8f659e04bb5d97db99e00b2a`: μία προεπισκόπηση LAB POS 2 από Barcode για ΝΕΡΟ 500ML / SKU 2269 / EAN `5201219000118` διαβάστηκε στα κεντρικά Συμβάντα ως «Άνοιγμα προεπισκόπησης ετικέτας», Καρτέλα Barcode, LAB POS 2, 0,00 €, χωρίς επιβεβαίωση φυσικής εκτύπωσης. **Περιορισμένο LAB PASS Audit**. UI αρνητικό EAN και απομόνωση δεύτερου δοκιμαστικού καταστήματος NOT TESTED· συνολικό scope OPEN. USER PASS χαρτί→σάρωση διατηρείται. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 20:50 Ελλάδα — Gate 3 ΓΕΩΡΓΙΑΔΟΥ Β 1970 — περιορισμένο LAB/USER PASS

- [x] Μία υποβολή LAB POS 2 με πίστωση → ίδιο πρόχειρο 6/20/27,44 €/31,01 €, βοηθός 6/6 και 0 προτάσεις, οριστική καρτέλα 6 συνδεδεμένων ειδών και ΑΦΜ 174696914. Ο ιδιοκτήτης επιβεβαίωσε τον αμφισβητημένο κωδικό τρίτης γραμμής ως σωστό. Το αρχικό στιγμιότυπο ΑΦΜ 174669014 αντικαταστάθηκε σε νεότερο readback από τον τυπωμένο 174696914. Νεότερο readback: μία ορατή λογιστική PURCHASE 31,01 € και stock έξι ειδών 8/6/1/1/2/2, τελευταία αγορά 20:50:07. Ονομαστικά ιστορικά και των έξι ειδών: από μία ορατή PURCHASE Β 1970 στις 20:50:07, ποσότητες +8/+6/+1/+1/+2/+2, τωρινό stock 8/6/1/1/2/2, διαφορά/πιθανά διπλά 0. Περιορισμένο LAB PASS ορατών κινήσεων· χωρίς baseline POS/stock, μετρημένη μεταβολή, settlement/job μοναδικότητα και βάρδιες NOT TESTED. Δεν ξαναυποβάλλεται/πληρώνεται το Β 1970. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-27-gate3-georgiadou-b1970-scoped-lab-pass.md`.

## 27/09/2026 20:40 Ελλάδα — TABLE_SERVICE δομημένα αλλεργιογόνα · ASSIGNED

- [ ] `feat/table-service-structured-allergens-20260927`: ξεχωριστές επιλογές αλλεργιογόνων στο POS, δομημένη μετάδοση/αποθήκευση ανά γραμμή και εμφανής ένδειξη στην ουρά παραγωγής.
- [x] Προστατευμένο baseline: modifiers + ελεύθερη σημείωση PASS, MAIN 6,00 €/2, LAB-POS-02 0,00 €/2, stock καφέ -2, τοπική ουρά 0.
- [ ] Υλοποιήθηκαν 14 δομημένες επιλογές, `allergensJson`, μεταφορά στο batch, κόκκινη ένδειξη BackOffice/εκτύπωσης και regression coverage. **AWAITING CI / DEPLOY / LAB**· καμία πληρωμή δεν εγκρίνεται.

## 27/09/2026 — Ετικέτα EAN-13: Audit preview fix AWAITING CI/DEPLOY/LAB

Συνέχεια ίδιας ανάθεσης από `feat/barcode-ean13-label-print-20260927` στο `feat/ean13-label-audit-20260927`. USER PASS φυσικής εκτύπωσης→σάρωσης και LAB PASS προεπισκόπησης προστατεύονται. Τοπικά 3/3 EAN tests PASS, μαζί με άκυρο checksum χωρίς εκτυπώσιμο έγγραφο. Οι δύο διαδρομές πλέον εκπέμπουν `LABEL_PREVIEW_OPENED`, με κεντρική ελληνική προβολή ως προεπισκόπηση 0 €, όχι ως φυσική εκτύπωση. CI/deploy/LAB readback AWAITING. UI αρνητικό EAN και cross-store LAB isolation NOT TESTED· συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 20:36 Ελλάδα — TABLE_SERVICE PASS διοικητικά πλήρες

- [x] Manual, checkpoint, ενεργή λίστα, pending roadmap και κεντρικό PDF συμφωνούν για το production LAB PASS modifiers και ελεύθερης σημείωσης.
- [ ] Νεότερο ενεργό scope: δομημένα αλλεργιογόνα, `ASSIGNED agent/table-service-restaurant-20260927`, NOT TESTED. Δεν έγινε αλλαγή εφαρμογής ή production κίνηση σε αυτό το διοικητικό κλείσιμο.

## 27/09/2026 20:15 Ελλάδα — TABLE_SERVICE modifiers / σημειώσεις · LAB PASS

- [x] PR #1428: production POS φόρτωσε τη product-specific ομάδα `LAB ΕΠΙΛΟΓΗ ΓΑΛΑΚΤΟΣ` και εφαρμόστηκε `ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ` στο `LAB ΚΑΦΕΣ ΔΟΚΙΜΗΣ`.
- [x] PR #1430 / main `ea8fae914f4eba1d6ac9f0cc30cf4fb006514d9c`: PR CI, main CI και Render deploy PASS. Η υπάρχουσα ουρά εμφάνισε μαζί modifier και σημείωση `LAB ΑΛΛΕΡΓΙΑ: ΓΑΛΑ · ΠΟΛΥ ΖΕΣΤΟ`.
- [x] Το δελτίο `ΚΑΦΕ`, Γύρος 1, ολοκληρώθηκε μία φορά: εκκρεμείς ουρές 0 και τραπέζι `ΕΤΟΙΜΗ`.
- [x] Οικονομικά αμετάβλητα (`MAIN` 6,00 €/2, `LAB-POS-02` 0,00 €/2), τοπική ουρά 0, stock καφέ -2. Δεν έγινε πώληση ή πληρωμή.
- [ ] Δομημένα αλλεργιογόνα παραμένουν OPEN· το παρόν PASS καλύπτει modifier και ελεύθερη σημείωση είδους.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.
## 27/09/2026 — Ετικέτα EAN-13: USER PASS φυσικής εκτύπωσης→σάρωσης

Μετά το PR #1420 / deployed `4cc01eec` και τα περιορισμένα visual LAB PASS, ο ιδιοκτήτης επιβεβαίωσε «εκτυπωσα και την σκαναρα ειναι οκ». **USER PASS για πραγματικό χαρτί→scanner**· ακριβές είδος/EAN, ώρα, φυσική συσκευή και POS readback δεν δόθηκαν, άρα δεν εικάζονται. Το σκέλος δεν επαναλαμβάνεται μόνο για τεκμηρίωση. Μη έγκυρο EAN, Audit και tenant isolation NOT TESTED· συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 — Ετικέτα καλαθιού: περιορισμένο LAB PASS προεπισκόπησης

PR #1420 / main `4cc01eec` / CI #3609 / Render deploy #1692 PASS. Στο ανανεωμένο LAB POS 2, 1 × ΝΕΡΟ 1,5LT / SKU 2270 → Ενέργειες προϊόντος → Εκτύπωση ετικέτας έδειξε επωνυμία «ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ», γραμμές/ψηφία EAN-13 `5201005080034`, 1,00 € και 60 × 40 mm / προτεινόμενο εκτυπωτή. Το είδος αφαιρέθηκε και το καλάθι επέστρεψε 0,00 € χωρίς πώληση. **LAB PASS μόνο προεπισκόπησης καλαθιού**, κλείνει το νεότερο visual FAIL της φωτογραφίας. Εκτύπωση σε χαρτί→σάρωση, αρνητικό EAN, Audit και tenant isolation NOT TESTED· συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 — Νεότερο LAB FAIL: ετικέτα από γραμμή καλαθιού

Εικόνα ιδιοκτήτη `image(20260927-135340).png`: ΝΕΡΟ 1,5LT / SKU 2270 / 1,00 € στη διαδρομή **μενού είδους καλαθιού → Ετικέτα** εμφανίζει μόνο προϊόν/SKU/τιμή, χωρίς επωνυμία ή barcode. Η προγενέστερη περιορισμένη επιτυχία ισχύει μόνο για τη χωριστή διαδρομή **Barcode → EAN-13**. Διορθώνεται ο παλιός renderer του `StorePosPanel`, κοινή προεπισκόπηση με store settings και έγκυρο EAN-13, χωρίς αυτόματη εκτύπωση· **AWAITING CI/DEPLOY/LAB** για το κουμπί του καλαθιού. Συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 — Ετικέτα EAN-13: περιορισμένο LAB PASS / φυσική δοκιμή OPEN

PR #1415 / main `8e5b3ce2` / CI #3596 / exact Render deploy PASS. Platform Super Admin στο MYWORKSTATION LAB αποθήκευσε 60 × 40 mm και «LAB δοκιμαστικός εκτυπωτής», έκλεισε και ξανάνοιξε τη φόρμα με ίδιες τιμές: **LAB PASS ρυθμίσεων στο ίδιο κατάστημα**. Στο ανανεωμένο LAB POS 2, ΝΕΡΟ 500ML / SKU 2269 / EAN-13 `5201219000118` / 0,50 €: ορατά μικρή επωνυμία «ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ», γραμμές και ψηφία barcode, τιμή και υπόδειξη 60 × 40 mm/εκτυπωτή: **LAB PASS προεπισκόπησης**. Πριν από την προεπισκόπηση stock −65· καμία συναλλαγή ή εκτύπωση. Φυσική εκτύπωση→σάρωση, αρνητικός EAN, audit και απομόνωση άλλου καταστήματος **NOT TESTED**· συνολικό scope OPEN. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 16:05 Ελλάδα — POS ετικέτα Super Admin LAB FAIL / fix AWAITING CI-LAB

Exact Render `c1a871e0` μέσω deploy run #1685, πραγματικό Platform Admin → MYWORKSTATION LAB → Καταστήματα → Ρυθμίσεις ετικέτας: το κουμπί εμφανίστηκε, αλλά στο άνοιγμα η σελίδα έγινε λευκή. Browser console `Cannot read properties of undefined (reading widthMm)`· το parent περνούσε `settings`, ενώ το component ανέμενε `initialSettings`. Περιορισμένη διόρθωση ονόματος prop και ασφαλές default ώστε να μη συντριβεί η οθόνη. Αποθήκευση ρυθμίσεων, προεπισκόπηση, εκτύπωση και σάρωση NOT TESTED. `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 — POS ετικέτα EAN-13: επωνυμία και Super Admin ρυθμίσεις · AWAITING CI/DEPLOY/LAB

Ανάληψη επέκτασης του ήδη ανατεθειμένου `feat/barcode-ean13-label-print-20260927` από `feat/store-ean13-label-settings-20260927`. Οι 4 εικόνες ιδιοκτήτη δείχνουν LAB POS 2 / ΝΕΡΟ 500ML / SKU 2269 / EAN-13 `5201219000118` / 0,50 €: η προεπισκόπηση εμφάνισε προϊόν, SKU και τιμή, αλλά απουσίαζαν οπτικά επωνυμία και γραμμές barcode. Προστίθεται μικρή επωνυμία, ορατό EAN-13, και server-side ανά κατάστημα παραμετροποίηση 30–100 × 25–80 mm και προτεινόμενου εκτυπωτή μόνο από Platform Super Admin. Browser εκτυπωτή επιλέγει ο χρήστης. Η εικόνα είναι παρατήρηση παλιάς έκδοσης, όχι LAB PASS της νέας εκτύπωσης. Checkpoint `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 — POS εκτύπωση EAN-13 ετικέτας · ΑΝΑΤΕΘΗΚΕ / AWAITING CI-LAB

Ανεξάρτητη υποεργασία `feat/barcode-ean13-label-print-20260927`: ετικέτα από ήδη καταχωρισμένο έγκυρο EAN-13 στο σωστό προϊόν, χωρίς μεταβολή τιμής/stock ή κλήση fiscal. Ελέγχονται checksum και 95 μονάδες scanner. Το CI/deploy και πραγματική LAB εκτύπωση→σάρωση παραμένουν NOT TESTED. Η γενική online αναζήτηση, μεταφορά barcode και άλλοι τύποι ετικέτας μένουν OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-27-pos-ean13-label-print.md`.

## 27/09/2026 14:16 Ελλάδα — Gate 3 053688 περιορισμένο LAB PASS, ολικό Gate OPEN

Μετά το #1396 / CI #3556 / exact Render `2a88b553`, το Αρχείο ειδών δείχνει σωστό κόστος 1,05 €/τμχ για την πίτσα και 31,63 € αξία stock. Οριστικό 053688: ΑΦΜ 800760691, 5 είδη, 164,59 € καθαρό / 185,99 € μικτό, απόκλιση 0,00 €, μία αγορά 185,99 € στην καρτέλα προμηθευτή. Readback πέντε ειδών stock 30/80/40/40/30: τέσσερις PURCHASE μία φορά, πίτσα PURCHASE +5 και τεχνική μετατροπή +25, διαφορές 0/πιθανά διπλά 0. Εικόνες `105908`, `110730`, `111306`, `111536`, `111609` της 27/09 και προγενέστερες `103917`, `103953`, `104033`, `104140`. **PASS μόνο αυτών των ορατών αποτελεσμάτων.** Τρέχουσα βάρδια 0,00 € (`110951`), αλλά ιστορικό/πριν-μετά POS1/POS2 και απουσία ταμιακής χρέωσης στην ώρα της πράξης NOT TESTED. Παλιά FAIL άλλων τιμολογίων και αντοχή βοηθού OPEN· Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-27-gate3-inventory-archive-pack-cost.md`.

## 27/09/2026 13:43 Ελλάδα — Gate 3 053688 Αρχείο ειδών LAB FAIL / PR #1396 CI-LAB AWAITING

Στο οριστικό 053688 (POS 2, πίστωση 185,99 €) ο ιδιοκτήτης επιβεβαίωσε 5 γραμμές και SKU 16-0300: 5 ΚΒ × 6 = 30 ΤΜ, μία αγορά 185,99 € στον προμηθευτή. Το Αρχείο ειδών εμφανίζει λανθασμένα 6,33 € ανά ΤΜ, κόστος stock 189,78 € και αρνητικά ποσοστά (`image(20260927-104306).png`). Το αποθηκευμένο κόστος διόρθωσης είναι 31,63 / 30 = 1,054333 €/ΤΜ. PR #1396 αλλάζει μόνο την ανάγνωση τελευταίας/μέσης τιμής από την υφιστάμενη κίνηση μετατροπής. 16/16 τοπικοί έλεγχοι PASS· CI/deploy/readback AWAITING. Δεν έγινε νέα πληρωμή ή κίνηση για τη διόρθωση. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-27-gate3-inventory-archive-pack-cost.md`.

## 27/09/2026 — Κεντρικές αναθέσεις efood / Εστίασης και κανόνας PASS

- **efood/Pelican — ΑΝΑΤΕΘΗΚΕ ΑΛΛΟΥ · OPEN:** υπεύθυνη η εξειδικευμένη σελίδα efood/Pelican. Phase A και φόρμα LAB έχουν επιμέρους PASS, όχι τελικό end-to-end/sandbox/production PASS. Δεν συγχέεται με το κλειδωμένο Gate 6 Online/Delivery. Checkpoints `2026-09-13-efood-pelican-phase-a-foundation.md`, `2026-09-23-efood-lab-schema-bootstrap.md`.
- **Εστίαση / TABLE_SERVICE — ΑΝΑΤΕΘΗΚΕ ΑΛΛΟΥ · OPEN:** `agent/table-service-restaurant-20260927` έχει τραπέζια, σερβιτόρους, ασύρματη παραγγελιοληψία, ξεχωριστά πόστα παραγωγής και λογαριασμό. Contract/local tests δεν αποτελούν συνολικό LAB PASS. Checkpoint `2026-09-27-table-service-restaurant-takeover.md`.
- **Για κάθε σελίδα από εδώ και πέρα:** πριν αρχίσει ελέγχει το μητρώο στο `docs/roadmap/PENDING_WORK.md` και καταγράφει αποκλειστική ανάθεση. Σε πραγματικό επιμέρους PASS ενημερώνει αμέσως το κοινό checkpoint και αφαιρεί μόνο το ολοκληρωμένο σκέλος. Σε τελικό PASS η υπεύθυνη σελίδα ενημερώνει στο ίδιο PR ενεργή λίστα, pending roadmap, PASS manual και κεντρικό PDF, διαγράφει την ολοκληρωμένη εκκρεμότητα και κλειδώνει το scope ώστε να μην το ξαναπάρει άλλη σελίδα. Χωρίς PASS η ανάθεση μένει στον ιδιοκτήτη της μέχρι συγχωνευμένο handoff και ρητή νέα ανάληψη.

## 27/09/2026 11:45 Ελλάδα — Gate 3 053688 λάθος επιλογή προμηθευτή POS / LAB FAIL, fix AWAITING CI-DEPLOY-LAB

**Gate 6 — ΤΡΑΠΕΖΙΑ POS HEADER PASS (27/09/2026):** PR #1397, CI #3557 και Render revision `5867e7f8` PASS. Πραγματικό LAB visual readback επιβεβαίωσε το «ΤΡΑΠΕΖΙΑ» επάνω, δίπλα στις «ΠΑΡΑΓΓΕΛΙΕΣ», και πλήρη απουσία του από την κάτω μπάρα. Η συγκεκριμένη διόρθωση κλειδώθηκε PASS· το συνολικό TABLE_SERVICE παραμένει OPEN μέχρι το πλήρες end-to-end LAB PASS. Τεκμήριο `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.

**TABLE_SERVICE Φάση A2 — ΤΕΛΙΚΟ LAB PASS (27/09/2026 19:42 Ελλάδα):** Στο ίδιο `ΤΡΑΠΕΖΙ LAB 1` στάλθηκαν Γ1 καφές 1,00 € και Γ2 τοστ 2,00 € πριν από πληρωμή. Παρέμεινε ένας λογαριασμός 3,00 €, με ακριβώς μία νέα ουρά `ΚΑΦΕ` για Γ1 και μία `ΚΟΥΖΙΝΑ` για Γ2. Και τα δύο πόστα έγιναν ΕΤΟΙΜΑ, ο λογαριασμός πληρώθηκε μία φορά μετρητά ως πώληση `460d9090-5b11-463b-84c9-954fa4a794a3`. `MAIN` 3→6 € / 1→2 συναλλαγές, `LAB-POS-02` αμετάβλητη, stock καφέ και τοστ -1→-2, ουρές και τοπική ουρά 0. Η υποφάση πολλών γύρων κλειδώνει PASS· modifiers/σημειώσεις/αλλεργίες παραμένουν OPEN. Τεκμήριο `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.

**TABLE_SERVICE Φάση A1 BackOffice — VISUAL LAB PASS / STATE CHANGE NOT TESTED (27/09/2026):** PR #1402, CI #3568 και Render exact `3c516853` PASS. Στην πραγματική συνεδρία Super Admin εμφανίστηκαν η κοινή διαχείριση σαλών/τραπεζιών και όλα τα πεδία για το ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Παραμένουν 0 σάλες / 0 τραπέζια, επειδή δεν έγινε αποθήκευση. Δημιουργία, Audit και εμφάνιση στο POS NOT TESTED· συνολικό TABLE_SERVICE OPEN. Τεκμήριο `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.


**Gate 3 — καρτέλα προμηθευτή RETEST (27/09/2026 12:42 Ελλάδα):** `image(20260927-094146).png`: το κουμπί ΑΑΔΕ επέστρεψε μόνο VIES και σωστά δεν αποθήκευσε αυτόματα, αλλά το χειροκίνητο «Καταχώρηση» δεν ανταποκρίθηκε. Ρητή σύνδεση click με αποθήκευση και ορατό readback ΑΦΜ σε νέο PR/CI AWAITING. Υφιστάμενο 053688, 5 γραμμές/185,99 €, χωρίς νέα POS πράξη. Gate 3 OPEN.

**Gate 3 — διόρθωση καρτέλας προμηθευτή AWAITING LAB (27/09/2026 12:29 Ελλάδα):** Το έντυπο ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ 053688 έχει ΑΦΜ 800760691, η υπάρχουσα καρτέλα 80070669. Ο ιδιοκτήτης εισήγαγε το σωστό ΑΦΜ αλλά η φόρμα δεν αποθήκευσε (`image(20260927-092700).png`), χωρίς ορατό σφάλμα. Προστέθηκε μόνιμο μήνυμα προόδου/σφάλματος, readback και κουμπί ΑΑΔΕ για συμπλήρωση/αποθήκευση στην ίδια καρτέλα μόνο με επίσημη απάντηση ΑΑΔΕ· CI/deploy/LAB AWAITING. Διόρθωση ΑΦΜ, κανόνας 30, τελική καταχώριση και αποτελέσματα stock/πληρωμής NOT TESTED. Gate 3 OPEN.

**Gate 3 — #1387 CI PASS / AWAITING LAB (27/09/2026 12:08 Ελλάδα):** Στο υπάρχον 053688 η ανοιχτή λίστα προμηθευτών εμφανίζει μόνο ονόματα (`image(20260927-090811).png`), επομένως δεν μπορεί να επιλεγεί αξιόπιστα η καρτέλα από το τυπωμένο ΑΦΜ 800760691. Το #1387 εμφανίζει ΑΦΜ ή ρητή απουσία του στην επιλογή. Τοπικό build PASS· CI/merge/deploy και επιλογή σωστής καρτέλας, κανόνας 30 και readback στο ίδιο πρόχειρο AWAITING LAB. 5 γραμμές / 185,99 € πριν· οικονομικές και αποθηκευτικές επιδράσεις NOT TESTED. Gate 3 OPEN.
Μετά το #1385 / CI #3527 / Render `2aa41fb`, η απόπειρα κανόνα για 16-0300 επέστρεψε «Το ΑΦΜ διαφέρει από την καρτέλα προμηθευτή» (`image(20260927-084549).png`). Ο ιδιοκτήτης εξηγεί ότι το POS επέλεξε λανθασμένο προμηθευτή. Καμία αποθήκευση κανόνα ή αλλαγή γραμμής· το ίδιο πρόχειρο 5 σειρές / 185,99 €. Κώδικας `agent/gate3-correct-pos-supplier-20260927`: τα ΑΦΜ φαίνονται στο dropdown, αλλαγή στο ίδιο `NEW` POS πρόχειρο συγχρονίζει το συνδεδεμένο έγγραφο μόνο χωρίς ήδη συνδεδεμένη πληρωμή, με Audit· ο βοηθός ακολουθεί τον τρέχοντα προμηθευτή. Υπάρχουσα πληρωμή μπλοκάρει αλλαγή μέχρι ασφαλή έλεγχο, χωρίς δεύτερη πληρωμή. CI/deploy/LAB AWAITING, Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 27/09/2026 11:25 Ελλάδα — Gate 3 053688 κανόνας συσκευασίας / LAB FAIL, fix AWAITING CI-DEPLOY-LAB

Το πρόχειρο ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ 053688 και η ανάγνωση βοηθού συμφωνούν με τις 5 τυπωμένες σειρές και 185,99 €. Η αποθήκευση προαιρετικού κανόνα απέτυχε πριν τη μετάλλαξη: κενό κρυφό πεδίο UI· η καρτέλα προμηθευτή δεν επαληθεύτηκε. Η στενή αλλαγή ζητά ρητή επαλήθευση ΑΦΜ από το πρωτότυπο και δεσμεύει συναλλακτικά την καρτέλα και τον κανόνα στο ίδιο ενεργό πρόχειρο/εταιρεία, με έλεγχο checksum και σύγκρουσης. Τοπικά syntax/build PASS, CI/deploy/LAB AWAITING. Μη δοκιμάσεις συντελεστή 24 στον κωδικό 16-0300 χωρίς πραγματική επιβεβαίωση συσκευασίας. Δεν έγινε νέα πληρωμή, stock ή οριστικοποίηση· οι πριν/μετά επιδράσεις NOT TESTED. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 27/09/2026 10:59 Ελλάδα — Gate 3 26505 / περιστροφή εικόνας και επιλογές συσκευασίας — CI #3518 PASS / exact Render `a16623a` / LAB AWAITING

Στο LAB POS 2 το νέο τιμολόγιο 26505 (Ευγγελία Αναστασοπούλου) παραλήφθηκε μία φορά· το ίδιο επεξεργάσιμο πρόχειρο άνοιξε με 0 είδη / 0,00 € και ένδειξη ελέγχου στο πρόχειρο. Η πρώτη OCR ανάγνωση γραμμών έχει μετατεθεί σε αναβάθμιση, ενώ ο βοηθός είναι το τρέχον κριτήριο. Ο ιδιοκτήτης έδειξε οριζόντια στραμμένη φωτογραφία ΟΛΥΜΠΟΣ.jpg στο παράθυρο βοηθού και ζήτησε rotate και επιλογές 1/6/12/24 στην προαιρετική εκμάθηση τεμαχίων ανά κιβώτιο. Η αλλαγή `agent/gate3-photo-rotate-packaging-ui-20260927` αφορά μόνο UI: περιστροφή 90° ανά φωτογραφία για προβολή, προεπιλογές και ελεύθερο ακέραιο αριθμό. Το πρωτότυπο, το AI upload, το ίδιο πρόχειρο και οι κανόνες αποθήκευσης δεν μεταβάλλονται. PR #1380 merged, exact Render `/api/health` revision `a16623a43130586990c5f6b21cbe3e92c78e27df`. Οπτική δοκιμή των κουμπιών και ανάγνωση γραμμών του 26505, εφαρμογή, οικονομικά, stock και πληρωμή παραμένουν NOT TESTED. Gate 3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 27/09/2026 10:46 Ελλάδα — ΜΑΝΤΖΙΛΑΣ 13234 / περιορισμένο LAB readback εφαρμογής

Ο ιδιοκτήτης επέλεξε τις ελεγμένες γραμμές και η εικόνα `image(20260927-074633).png` δείχνει το ίδιο πρόχειρο 13234 με 17 είδη, καθαρό 326,87 € και μικτό 369,38 €, έναντι εντύπου 369,36 € (+0,02 € εντός ανοχής). Αυτό τεκμηριώνει περιορισμένα ότι οι 11 ελλείπουσες σειρές πέρασαν στο επεξεργάσιμο πρόχειρο μετά από ανθρώπινο έλεγχο. Δεν καταγράφηκε πριν/μετά βάρδιας, αποθήκης ή άλλου POS· οι επιδράσεις τους NOT TESTED. Καμία απόδειξη οριστικοποίησης. Gate 3 OPEN.

## 27/09/2026 — Gate 3 ΜΑΝΤΖΙΛΑΣ 13234 / ρητοί κανόνες στον βοηθό — CI PASS / AWAITING LAB

Το #1373 / CI #3507 / exact Render `78fa74e` έδωσε 17 γραμμές, 11 ελλείπουσες, +0,02 € και 3 «ΠΡΟΣ ΕΛΕΓΧΟ»: 046/045 μόνο για μη τυπωμένο συντελεστή συσκευασίας και 00211 για δυσδιάκριτη περιγραφή. Η εικόνα `image(20260927-071614).png` επιβεβαιώνει και τρίτο αποθηκευμένο κανόνα 043 1 ΚΒ=6 ΤΜ στο ίδιο πρόχειρο 6 γραμμών / 211,14 €. Η εικόνα `image(20260927-071728).png` δείχνει 0 αβέβαιες **μετά τις χειροκίνητες διορθώσεις/κανόνες και επανάγνωση του βοηθού**· ο ιδιοκτήτης επιβεβαίωσε σωστό readback, αλλά 11 γραμμές ακόμη λείπουν από το αποθηκευμένο πρόχειρο. Το `agent/gate3-known-rules-20260927` περνά στον βοηθό μόνο επιβεβαιωμένους κανόνες ίδιου ΑΦΜ/κωδικού· CI #3509 PASS, PR #1374 merged `470d740`, exact Render ίδιο· νέα LAB ανάγνωση AWAITING λόγω 2FA στην ανεξάρτητη καρτέλα. Δεν εφαρμόστηκαν οι 11 γραμμές ή νέα πληρωμή/stock/οριστικοποίηση. Πρώτο αυτόματο πρόχειρο FAIL και Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 19:58 Ελλάδα — Gate 3 ΜΑΝΤΖΗΛΑΣ, αβέβαιες γραμμές ορατές

Στο ίδιο LAB πρόχειρο 13234, 6 γραμμές / 211,14 € έναντι τυπωμένων 17 / 369,36 €. Δύο αναγνώσεις βοηθού έδωσαν 17 γραμμές / προεπισκόπηση 369,38 € (+0,02 €), αλλά 11 λείπουν. Η δεύτερη απάντηση ονομάζει τρεις αβέβαιες περιγραφές 13191/390/1890, ενώ ο μετρητής δείχνει 10 με πλήρη βεβαιότητα από τις 11 ελλείπουσες: αντίφαση που απαιτεί σήμανση ανά σειρά. Οι κανόνες 046 1 ΚΒ=24 ΤΜ και 045 1 ΚΒ=12 ΤΜ αποθηκεύτηκαν και το ίδιο πρόχειρο έμεινε 6 γραμμές / 211,14 €, χωρίς νέα POS πληρωμή. Στενή αλλαγή εμφανίζει «ΠΡΟΣ ΕΛΕΓΧΟ» και αιτία ανά γραμμή, και υποχρεώνει τον βοηθό να συμφωνεί τη δομημένη βεβαιότητα με την εξήγησή του. CI/deploy/νέα LAB ανάγνωση AWAITING. Καμία εφαρμογή ελλειπουσών, οριστικοποίηση ή stock· Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 18:04–18:16 Ελλάδα — Gate 3 ΜΑΝΤΖΗΛΑΣ 13234 / LAB FAIL, UI Mini AWAITING CI-LAB

Νέα υποβολή LAB POS 2: πρώτο αυτόματο πρόχειρο 0 είδη / 0,00 €, άσχετη ένδειξη 87,35 αντί 89,35 € ενώ το έντυπο 17 γραμμές / 116 τεμ. / 326,87 € καθαρό / 42,49 € ΦΠΑ / 369,36 € πληρωτέο. Διαδραστικός βοηθός 17 γραμμές και 369,38 € (+0,02 εντός ανοχής), αλλά λανθασμένος μετρητής «2 ελλείπουσες». Κανόνας `09000` 1 ΚΒ = 24 ΤΜ αποθηκεύτηκε στο ίδιο πρόχειρο· UI έδειξε πλέον 4 γραμμές / 186,47 €, χωρίς πλήρη readback όλων των σειρών. Αλλαγή διάταξης κανόνα κατά το Mini τοπικό build PASS, CI/deploy/LAB AWAITING. Χωρίς οριστικοποίηση/stock PASS· Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 17:52 Ελλάδα — Gate 3 ΣΙΓΜΑ 180557 / βοηθός χωρίς διορθώσεις

Στο ίδιο πρόχειρο, ο διαδραστικός έλεγχος φωτογραφιών επέστρεψε 0 διορθώσεις, 0 ελλείπουσες και 0 προς διαγραφή, συμφωνία 10/10 σειρών, 35 τεμ., 41,22 € καθαρό / 46,58 € πληρωτέο. Περιορισμένο LAB PASS ανάγνωσης βοηθού. Η προεπισκόπηση υπολογίζει 46,59 € (+0,01 € εντός ανοχής), ενώ το πρώτο αυτόματο πρόχειρο είναι ακριβές· δεν εφαρμόστηκε αλλαγή. ΑΛΦΑ/ΦΟΡΤΙΣ/NATURALS FAIL και σύνδεση ειδών/stock/τελική πράξη OPEN/NOT TESTED. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Workforce Payroll in-app οδηγός LAB PASS / περίοδος CLOSED

## 26/09/2026 17:48 Ελλάδα — Gate 3 ΣΙΓΜΑ/ΛΕΒΕΝΤΟΠΟΥΛΟΣ 180557 / περιορισμένο LAB PASS

Μία νέα POS υποβολή LAB POS 2 με πίστωση, πρώτο αυτόματο πρόχειρο 10 τυπωμένες γραμμές / 35 τεμ. / 41,22 € καθαρό / 5,36 € ΦΠΑ / 46,58 € πληρωτέο, διαφορά 0,00 €. Και οι 10 ορατές σειρές με κωδικούς, ποσότητες, τιμές και εκπτώσεις αντιπαραβλήθηκαν με το έντυπο. PASS μόνο αυτόματης ανάγνωσης αυτού του παραστατικού· αποθήκη/αντιστοίχιση/πληρωμή/οριστικοποίηση NOT TESTED. Παλαιότερα ΑΛΦΑ/ΦΟΡΤΙΣ FAIL ισχύουν, Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`, `docs/manual/invoices/PASS.md`.

## 26/09/2026 17:38 Ελλάδα — Gate 3 ΑΛΦΑ ΔΙΑΝΟΜΕΣ 110Μ/5532 / LAB FAIL, ΦΟΡΤΙΣ εφαρμογή

ΑΛΦΑ: δύο σελίδες, 14 φυσικές σειρές / 96 τεμ. / 89,35 € καθαρό / 100,99 € πληρωτέο· πρώτο αυτόματο πρόχειρο 0 είδη, `POS_BACKGROUND_ASSISTANT_READ` 87,35 αντί 89,35. Διαδραστικός βοηθός επιστρέφει 14 γραμμές αλλά 58 τεμ. / 67,32 € / 76,07 €, η φραγή εφαρμογής λειτουργεί. Καμία εφαρμογή ή οριστικοποίηση, πληρωμή/stock NOT TESTED. ΦΟΡΤΙΣ στο ίδιο πρόχειρο 0→7 γραμμές / 89 τεμ. / 128,89 € (+0,01 εντός ανοχής), χωρίς PASS αυτόματης δημιουργίας· σωστός κωδικός `C010036`, παλιά υπόνοια `C010086` ανακαλείται. Μετρητής UI 6 ελλείπουσες ενώ εφαρμόστηκαν 7: FAIL. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

PR #1359 CI #3466 PASS, Render exact `327c06e8`: ο `Αναλυτικός οδηγός μισθοδοσίας` εμφανίστηκε και άνοιξε στο Platform Admin → LAB → Μισθοδοσία, με πέντε βήματα, όρια και troubleshooting. Δίπλα του η υπάρχουσα περίοδος Σεπτεμβρίου παρέμεινε CLOSED, 313,00 € μικτά/πληρωμένα, 0,00 € υπόλοιπο. Το αρνητικό μηδέν διορθώθηκε οπτικά. **LAB PASS εγχειριδίου και εικονικής διαδρομής περιόδου**· ανεξάρτητη συμφωνία ταμειακής βάρδιας και τραπεζικό αποδεικτικό OPEN/NOT TESTED. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

## 26/09/2026 — Workforce Payroll LAB περίοδος CLOSED / εγχειρίδιο AWAITING CI-LAB

PR #1356 CI #3458 PASS, Render exact `bdaf98cb`: το ίδιο εικονικό DRAFT επανυπολογίστηκε 19,67 → 313,00 € διατηρώντας πληρωμές 19,67 €. `LAB-POS-02` δέχθηκε 20,00 € και 100,00 € μετρητά (LAB POS 2 υπόλοιπο 120 → 100 → 0 €). Ο Χειριστής 1 εξοφλήθηκε εσωτερικά με 173,33 € τραπεζική εγγραφή, ορατή σε αναμονή χωρίς αποδεικτικό. Περίοδος Σεπτεμβρίου CLOSED, μικτά/πληρωμένα 313,00 €, υπόλοιπο 0,00 €. **LAB PASS της διαδρομής UI**, όχι ανεξάρτητης συμφωνίας cash shift ή επιβεβαίωσης τραπεζικού αποδεικτικού (NOT TESTED/OPEN). Αναλυτικός οδηγός μέσα στο Payroll AWAITING CI/DEPLOY/LAB. Κοινό checkpoint `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

## 26/09/2026 — Workforce Payroll LAB 313,00 € / επανυπολογισμός AWAITING CI-LAB

Ο ιδιοκτήτης επιβεβαίωσε ότι όλα τα στοιχεία LAB είναι εικονικά. Οι εννέα εκκρεμείς παρουσίες ελέγχθηκαν: 20ω48λ → προσομοιωμένο 8ω00λ, 25/9 OPEN → προσομοιωμένο 1ω00λ, οι υπόλοιπες με χωριστή αιτιολογημένη έγκριση. Η προεπισκόπηση Σεπτεμβρίου είναι 313,00 € ενώ το πληρωμένο DRAFT 19,67 €. Ο φραγμός απέρριψε το κλείδωμα ως παρωχημένο. Recalculation fix AWAITING CI/DEPLOY/LAB· 293,33 € υπόλοιπο μετά τη συμφωνία αναμένεται, όχι ακόμη παρατηρημένο. Cash και τελικό lock OPEN. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

**26/09/2026 17:00 Ελλάδα — Gate 3 ΦΟΡΤΙΣ:** retry διαδραστικού βοηθού στο ίδιο πρόχειρο 01A0158341 ανέγνωσε 7 σειρές / 89 τεμ. / 114,06 € καθαρό / τυπωμένο 128,88 €, preview 128,89 € (+0,01 € εντός ±0,05 €). Το πρώτο αυτόματο πρόχειρο παραμένει 0 σειρές: 7 πράσινες γραμμές λείπουν, παρά το ασαφές «0 προτάσεις» (μόνο διορθώσεις υφισταμένων). Πιθανή διαφορά 6ου κωδικού SNICKERS C010036 έναντι C010086, χρειάζεται έλεγχος εντύπου πριν εφαρμογή. Bounded διευκρίνιση μετρητών UI AWAITING CI/deploy/LAB· καμία νέα πληρωμή/stock/οριστικοποίηση. Gate 3 OPEN.

## 26/09/2026 — Gate 3 πλήρες παράθυρο βοηθού, deployed / οπτικό LAB AWAITING

PR #1349, CI #3444 PASS, merged `c30d8d27c0340793fa283f233219a7438f7b6ce5`. Render `/api/health` επέστρεψε `ok=true` και ακριβώς αυτή τη revision. Ο ιδιοκτήτης κλήθηκε να ανανεώσει και να ελέγξει την πλήρη οθόνη στο ίδιο NATURALS ΤΔΑ1-8529· οπτικό USER/LAB αποτέλεσμα **AWAITING**. Το NATURALS παραμένει LAB FAIL αυτόματης ανάγνωσης 0 γραμμών και ελλιπούς φωτογραφίας 1/2. Δεν γίνεται νέα υποβολή/πληρωμή, εφαρμογή ή οριστικοποίηση.

**26/09/2026 16:38 Ελλάδα — Gate 3 POS, νεότερα LAB FAIL:** ΦΟΡΤΙΣ 01A0158341 πρώτο πρόχειρο 0 σειρές, σφάλμα έκπτωσης σειράς 1· διαδραστικός βοηθός 502 χωρίς προτάσεις (`image(20260926-133614).png`). Στο άλλο POS στιγμιότυπο `image(20260926-133737).png` ΑΦΜ 997886929 δεν επέλεξε υπάρχοντα προμηθευτή, VIES αρνητικό· ύπαρξη ΑΦΜ στη βάση NOT TESTED. Περιορισμένη τοπική αντιστοίχιση μοναδικού ΑΦΜ από FAST headers AWAITING CI/deploy/LAB. Πληρωμή, stock, άλλο POS NOT TESTED· Gate 3 OPEN. Αναλυτικά `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

**26/09/2026 16:45 Ελλάδα — Gate 3 ΔΕΛΤΑ:** νέο POS 38147, πρώτο επεξεργάσιμο πρόχειρο 18 είδη, 192,60 € καθαρό / 217,62 € πληρωτέο, διαφορά 0,00 € έναντι φωτογραφίας· γραμμές 15–18 και όλες οι επιδράσεις πληρωμής/stock NOT TESTED. Δεν οριστικοποιήθηκε. Τα προηγούμενα ΦΟΡΤΙΣ/NATURALS αυτόματα FAIL μένουν ανοιχτά, Gate 3 OPEN. Fix ΑΦΜ PR #1353 CI #3452 PASS, merged και Render `ae2c500d6bfed595a0f0846006fdf8ac6d45a3e4`, AWAITING LAB. Αναλυτικά κοινό Gate 3 checkpoint.

**26/09/2026 16:53 Ελλάδα — Gate 3 ΔΕΛΤΑ 38147:** στο ίδιο πρόχειρο η πρώτη interactive απόπειρα γενικό 500, η επόμενη 18 γραμμές / 115 τεμάχια / 0 προτάσεις. Preview 217,64 € έναντι τυπωμένου 217,62 € (+0,02 €), ρητά αποδεκτό από ιδιοκτήτη εντός κανόνα ±0,05 €. Αποθηκευμένο πρώτο πρόχειρο ακριβώς 217,62 €. Καμία εφαρμογή, νέα υποβολή ή σκόπιμη νέα πληρωμή. Αιτία 500, οικονομικό before/after και stock NOT TESTED· Gate 3 OPEN για λοιπά FAIL. Διερευνητική αλλαγή στρογγυλοποίησης δεν ανέβηκε.

## 26/09/2026 16:19 (Ελλάδα) — NATURALS διαδραστική ανάγνωση και πλήρης οθόνη βοηθού

- [x] PR #1348 CI #3440 PASS, merged `9769e39913c81fc5b1792766cca976c9c8157b5a`. Render `/api/health` στις 16:23 Ελλάδα: `ok=true`, **ίδια ακριβώς revision**. Το νέο μήνυμα 429 είναι διαθέσιμο· δεν παρατηρήθηκε νέο 429 μετά το deploy, άρα ταξινόμηση provider code **AWAITING LAB**.

- [x] `image(20260926-131914).png`: ο διαδραστικός βοηθός απάντησε πλέον στο ίδιο πρόχειρο ΤΔΑ1-8529. Προτείνει 19 ορατές γραμμές, ποσότητα 96, καθαρό 96,91 € και μικτό 109,51 € αντί τυπωμένων 130,29 € και 147,23 €. Αναφέρει 1 από 2 φυσικές σελίδες και μπλοκάρει την εφαρμογή. **LAB FAIL πλήρους ανάγνωσης**, περιορισμένο ορατό αποτέλεσμα μόνο ασφαλούς φραγής· καμία γραμμή δεν εφαρμόστηκε. Το προηγούμενο 429 ήταν παροδικό στην παρατήρηση, χωρίς επιβεβαίωση provider code.
- [ ] Ο ιδιοκτήτης ζήτησε ο βοηθός να καταλαμβάνει πλήρως το παράθυρο. Branch `agent/gate3-assistant-fullscreen-20260926`: αφαιρούνται τα περιθώρια και το ανώτατο ύψος/πλάτος, 35% φωτογραφία και υπόλοιπο επεξεργάσιμος πίνακας. Μόνο UI, χωρίς αλλαγή ανάγνωσης/εφαρμογής. Local build PASS, CI/merge/exact deploy και USER/LAB οπτική αποδοχή AWAITING. Gate 3 OPEN.

## 26/09/2026 16:10 (Ελλάδα) — NATURALS ΤΔΑ1-8529, νέο πραγματικό LAB FAIL / 429 προεπισκόπησης

- [x] Προηγούμενο ΥΦΑΝΤΗΣ A1-92236: `image(20260926-130136).png` δείχνει μετά την εφαρμογή **8 είδη / 28 τεμάχια / 42,32 € καθαρό / 47,82 € μικτό** στο ίδιο επεξεργάσιμο πρόχειρο, με δεύτερο κωδικό 703717. Αυτό είναι ορατό readback γραμμών· χωρίς baseline/after ταμείου, πληρωμής, stock και ελέγχου άλλου POS οι οικονομικές επιδράσεις NOT TESTED. Το πρώτο αυτόματο πρόχειρο παραμένει LAB FAIL 0 γραμμών.

- [x] MYWORKSTATION LAB / LAB POS 2 / χειριστής LAB POS 2: μία υποβολή NATURALS Ι.Κ.Ε. ΤΔΑ1-8529, φωτογραφία `naturals.jpg`. Το φύλλο φέρει «Σελίδα 1 από 2» και δείχνει 18 φυσικές σειρές, 96 τεμάχια, έκπτωση 10,24 €, καθαρή 130,29 €, ΦΠΑ 16,94 €, πληρωτέο 147,23 €. Δεύτερη φυσική σελίδα δεν είναι διαθέσιμη. Δεν τεκμηριώνεται πλήρες παραστατικό.
- [x] Το POS ειδοποίησε ότι επιβεβαιώθηκαν μόνο 8/18 γραμμές. Πρώτο αυτόματο πρόχειρο στο BackOffice: **0 είδη / 0,00 €**, `POS_BACKGROUND_COMPLETE`, `POS_BACKGROUND_ASSISTANT_READ`, χωρίς αυτόματες γραμμές. **LAB FAIL** πρώτου προχείρου· το 8/18 δεν σημαίνει 8 αποθηκευμένες γραμμές.
- [x] Η διαδραστική προεπισκόπηση του ίδιου πρόχειρου επέστρεψε `Ο βοηθός δεν απάντησε (429)`, χωρίς προτάσεις. Ο ακριβής provider code και τυχόν Retry-After δεν καταγράφηκαν, οπότε δεν γνωρίζουμε αν πρόκειται για προσωρινό ρυθμό ή εξαντλημένο όριο. **LAB FAIL preview**. Μία πληρωμή/POS submission· δεν επαναλαμβάνεται. Πριν/μετά βάρδιας, stock και δεύτερου terminal NOT TESTED.
- [ ] Περιορισμένη αλλαγή `agent/gate3-assistant-429-20260926`: ξεχωριστή αντιμετώπιση προσωρινού 429 και `insufficient_quota`, χωρίς αυτόματο retry ή νέο job. Τοπικά τεστ PASS· CI, merge, exact deploy και νέα πραγματική δοκιμή **AWAITING**. Δεν λύνει το 8/18 ή την ελλιπή δεύτερη σελίδα. Gate 3 OPEN.

## 26/09/2026 15:56 (Ελλάδα) — ΥΦΑΝΤΗΣ, διόρθωση εσφαλμένης ανάγνωσης screenshot

Ο ιδιοκτήτης επισήμανε ότι ο βοηθός **είχε διαβάσει σωστά** τον κωδικό σειράς 2. Με μεγέθυνση των `ifantis.jpg` και `image(20260926-125217).png` επιβεβαιώθηκε 703717 και στα δύο. Η προηγούμενη δήλωση LAB FAIL κωδικού ήταν **λάθος του ελέγχου από τον Codex**, ανακαλείται· ο χειριστής **δεν αλλάζει** τη σωστή γραμμή. Η διαδραστική προεπισκόπηση στη revision `3e0a5dac` έδειξε 8 φυσικές σειρές / 28 τεμάχια / καθαρό 42,32 € / ΦΠΑ 5,50 € / πληρωτέο 47,82 €, με αναγνωρισμένες εκπτώσεις και διαφορά 0,00 €. Αυτό είναι παρατηρημένο αποτέλεσμα προεπισκόπησης, χωρίς ακόμη εφαρμογή στο πρόχειρο. Το **πρώτο αυτόματο πρόχειρο της ίδιας POS υποβολής παραμένει LAB FAIL: 0 γραμμές**. Εφαρμογή γραμμών, απόθεμα, οικονομική κίνηση και οριστικοποίηση NOT TESTED.

## 26/09/2026 15:51 (Ελλάδα) — ΥΦΑΝΤΗΣ έκπτωση ανά γραμμή, CI/deploy

PR #1342 merged `3e0a5daca41b31dedc4cce3fdbaf4ba4fe14d728`, πλήρες CI #3428 PASS, Render `/api/health` ok=true / ίδια ακριβώς revision. Η αλλαγή καλύπτει αυτόματη και διαδραστική ανάγνωση «ΑΞΙΑ ΕΚΠΤΩΣΗΣ» ολόκληρης φυσικής γραμμής, με σύγκριση καθαρής αξίας. **AWAITING LAB** για νέα προεπισκόπηση ΥΦΑΝΤΗΣ στο ίδιο πρόχειρο και για πρώτο αυτόματο πρόχειρο *άλλης νέας* POS υποβολής. Το προηγούμενο A1-92236 παραμένει LAB FAIL πρώτου πρόχειρου. Καμία νέα πληρωμή/stock/οριστικοποίηση.

## 26/09/2026 15:45 (Ελλάδα) — ΥΦΑΝΤΗΣ διαδραστικός βοηθός, LAB FAIL εκπτώσεων

`image(20260926-124321).png`: ο βοηθός διάβασε 8 φυσικές γραμμές και ποσότητα 28, αλλά έδωσε 0 σε όλες τις εκπτώσεις. Υπολογισμένο καθαρό 70,55 €, ΦΠΑ 9,17 €, πληρωτέο 79,72 € αντί τυπωμένου 42,32 € + 5,50 € = 47,82 €· διαφορά 31,90 €. Η στήλη «ΑΞΙΑ ΕΚΠΤΩΣΗΣ» είναι ευκρινής και αθροίζει 28,23 €. **LAB FAIL preview**, καμία εφαρμογή στο πρόχειρο. Το PR #1342 επεκτείνεται στην ίδια διάκριση lineDiscountAmount στη διαδραστική διαδρομή· CI PASS / AWAITING LAB και νέα ανάγνωση του ίδιου πρόχειρου για preview μόνο. Το πρώτο αυτόματο πρόχειρο παραμένει αμετάκλητο LAB FAIL (0 γραμμές) για αυτή την POS υποβολή.

## 26/09/2026 15:39 (Ελλάδα) — ΥΦΑΝΤΗΣ A1-92236, νέα υποβολή POS, LAB FAIL

MYWORKSTATION LAB / LAB POS 2, μία νέα υποβολή τιμολογίου ΥΦΑΝΤΗΣ A1-92236 από φωτογραφία `ifantis.jpg`, χειριστής LAB POS 2. Έντυπο: 8 φυσικές γραμμές, 28 τεμάχια, αρχική αξία 70,55 €, έκπτωση 28,23 €, καθαρό 42,32 €, ΦΠΑ 13% 5,50 €, πληρωτέο 47,82 €. Εικόνες `image(20260926-123749).png`, `123839`, `123901`, `123916`: POS παραλήφθηκε μία φορά, background complete, πρώτο αυτόματο πρόχειρο **0 είδη / 0,00 €**, μήνυμα `POS_BACKGROUND_ASSISTANT_READ: Η αριθμητική της γραμμής 1 δεν συμφωνεί με το έντυπο`. **LAB FAIL** του πρώτου αυτόματου πρόχειρου, Gate 3 OPEN. Πρώτη τυπωμένη σειρά: 3 × 1,59 = 4,77 €, έκπτωση ολόκληρης γραμμής 1,91 €, καθαρό 2,86 €, ΦΠΑ 13%, μικτό 3,23 €. Η διάκριση έκπτωσης ανά μονάδα από έκπτωση ολόκληρης σειράς είναι αιτιολογημένη υπόθεση· το ακριβές JSON της αυτόματης ανάγνωσης δεν είναι διαθέσιμο. Bounded διόρθωση εισάγει ξεχωριστό lineDiscountAmount και επαληθεύει την καθαρή αξία πριν τη μετατροπή σε ισοδύναμο ποσοστό πρόχειρου. **CI PASS / AWAITING LAB νέας POS υποβολής**. Δεν επαναλαμβάνουμε αυτό το τιμολόγιο, δεν κάνουμε άλλη πληρωμή/stock/οριστικοποίηση. Before/after βάρδιας και αποθήκης δεν καταγράφηκαν: οικονομική επίδραση NOT TESTED. Η ανάγνωση στον διαδραστικό βοηθό είναι ξεχωριστή διάγνωση, όχι PASS του πρώτου πρόχειρου.

## 26/09/2026 15:18 (Ελλάδα) — ΝΤΑΒΟΥ πρώτο αυτόματο πρόχειρο, μικτό ανά γραμμή

Οι νέες εικόνες `image(20260926-121530).png`/`121546` δείχνουν 19 γραμμές, 87 ποσότητα, 77,08 € καθαρό, 10,02 € ΦΠΑ και 87,10 € πληρωτέο στην προεπισκόπηση, αλλά το πρόχειρο έχει μόνο τη μία χειροκίνητα εφαρμοσμένη MERENDA. **LAB FAIL** πρώτου αυτόματου πρόχειρου· νέο POS μετά την αλλαγή **NOT TESTED**. Το αρχικό POS ΝΤΑΒΟΥ κατέγραψε αποτυχία συμφωνίας μικτών γραμμών/τυπωμένου συνόλου. Bounded αλλαγή υπολογίζει μικτό από καθαρό+ΕΦΚ+ΦΠΑ με στρογγυλοποίηση λεπτού, απορρίπτει αντίφαση >0,05 € ανά γραμμή και κρατά έλεγχο τυπωμένου συνόλου, ποσοτήτων, καθαρού, πληρότητας σελίδων και έως δύο αβέβαιων. Δεν επανεκτελεί το ίδιο POS, δεν αλλάζει πληρωμή/stock/οριστικοποίηση. **CI PASS / AWAITING LAB**.

## 26/09/2026 15:03 (Ελλάδα) — Gate 3 ψευδής έκπτωση MERENDA

Νέα ανάγνωση `image(20260926-120334).png` εμφάνισε ψευδή πρόταση αλλαγής στο 11,50442%: είναι η ισοδύναμη μετατροπή τυπωμένου 0,26 €/τεμ. και ακολουθεί δεύτερη έκπτωση 18%. Το επιβεβαίωσε ο ιδιοκτήτης. Στενός οικονομικός έλεγχος υπό CI φιλτράρει μόνο ισοδύναμες προτάσεις, όχι πραγματικές διαφορές. Gate 3 OPEN.

## 26/09/2026 15:01 (Ελλάδα) — Gate 3 μερική εφαρμογή

Μετά τη μία MERENDA ο βοηθός έκλεισε/ανανέωσε την parent οθόνη και απαιτούσε νέα AI ανάγνωση. `image(20260926-120114).png`. PR υπό CI κρατά την ίδια προεπισκόπηση ανοιχτή, σημειώνει το νέο matchingLineId και ανανεώνει το BackOffice όταν κλείσει ο βοηθός. **AWAITING LAB**, Gate 3 OPEN.

## 26/09/2026 15:00 (Ελλάδα) — Gate 3 MERENDA περιορισμένο PASS

`image(20260926-120007).png`: στο **ίδιο** πρόχειρο ΝΤΑΒΟΥ 23.991 μπήκε 1 είδος MERENDA 230GX24, ποσότητα 2, καθαρό 3,28 €, μικτό 3,71 €. Περιορισμένο **LAB PASS μόνο εφαρμογής μίας επιλεγμένης γραμμής**. Οι υπόλοιπες 18, αυτόματο πρώτο πρόχειρο, stock/τελική πράξη NOT TESTED. Μην προστεθεί δεύτερη MERENDA. Gate 3 OPEN.

## 26/09/2026 14:57 (Ελλάδα) — Gate 3 εφαρμογή πρότασης

Επιλέχθηκε MERENDA, πατήθηκε εφαρμογή, δεν εμφανίστηκε αποτέλεσμα στην ορατή περιοχή (`image(20260926-115748).png`). Το status βρίσκεται ψηλά, επομένως **δεν έχει τεκμηριωθεί αν η γραμμή προστέθηκε ή όχι**. Πριν από νέα εφαρμογή χρειάζεται readback του ίδιου πρόχειρου για αποφυγή διπλής γραμμής. UI αλλαγή: επιλογή στον πίνακα, κουμπί και μήνυμα δίπλα του. Gate 3 OPEN.

## 26/09/2026 14:54 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ προτάσεις

Οι νέες εικόνες δείχνουν 18 προτάσεις προσθήκης, πρώτη διαγραμμένη γραμμή εκτός ασφαλών προτάσεων· κανένα checkbox επιλεγμένο και καμία εφαρμογή στο πρόχειρο. `image(20260926-115421).png`, `image(20260926-115439).png`. **AWAITING LAB** για 19 γραμμές στο ίδιο πρόχειρο, Gate 3 OPEN.

## 26/09/2026 14:52 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ 23.991

Μετά το #1338 οι φωτογραφίες `image(20260926-115153).png`/`image(20260926-115209).png` δείχνουν 19 γραμμές/87 ποσότητα/77,08 € καθαρό/10,02 € ΦΠΑ/87,10 € πληρωτέο, χωρίς 0,00 € φραγή. **Περιορισμένο LAB PASS preview συνόλου μόνο**, εφαρμογή γραμμών και κανόνα στο πρόχειρο NOT TESTED. Κενό Τεμ./πακ. ενώ φαίνεται τεμ. στον πίνακα: κανονικοποίηση γνωστών μονάδων ΤΜ→PIECE, stock1 για τεμάχια υπό CI/LAB. Gate 3 OPEN.

## 26/09/2026 14:39 (Ελλάδα) — Gate 3 νέα φραγή / κανόνας τρέχοντος πρόχειρου

Στο ΝΤΑΒΟΥ 23.991 νέα ανάγνωση ξαναέδειξε «Πληρωτέο γραμμών 0,00 €», ενώ ο πίνακας δίνει 87,10 €. `image(20260926-113811).png`, `image(20260926-113829).png`. **LAB FAIL εφαρμογής**. Ο ιδιοκτήτης ζητά κανόνα όπως στο Mini που να ενημερώνει και το ίδιο υπάρχον πρόχειρο, διαθέσιμο OWNER/ADMIN/MANAGER ελεγκτές. Bounded PR υπό CI/LAB: μόνο εφόσον ολόκληρο έντυπο δεν έχει στήλη ΕΦΚ συμπληρώνει κενό ΕΦΚ=0 και μικτό, σώζει κανόνα σε ενεργό προμηθευτή/πρόχειρο ίδιας εταιρείας και ενημερώνει μία γραμμή στο ίδιο πρόχειρο. Gate 3 OPEN, καμία νέα πληρωμή/stock/οριστικοποίηση.

## 26/09/2026 14:36 (Ελλάδα) — Gate 3 δικαιώματα κανόνων συσκευασίας

Ο ιδιοκτήτης ζήτησε αποθήκευση κανόνων από OWNER/ADMIN/MANAGER ελεγκτές. Το PR για το σημείο αυτό απαιτεί AI_READER, επαλήθευση ενεργού προμηθευτή στην εταιρεία, αποκλείει STORE_OPERATOR. CI/LAB εκκρεμούν, Gate 3 OPEN.

## 26/09/2026 14:25 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ ανανεωμένη προεπισκόπηση

Η ανανέωση έδειξε 19 γραμμές / 87 τεμάχια / 77,08 € καθαρό / 10,02 € ΦΠΑ / 87,10 € πληρωτέο, χωρίς παλιό σφάλμα 0,00 € (`image(20260926-112010).png`). **Περιορισμένο LAB PASS μόνο της προεπισκόπησης συνόλου**. Το πρόχειρο δεν απέκτησε γραμμές: «Δεν βρέθηκαν ασφαλείς αλλαγές» και το κουμπί εφαρμογής δεν πρόσθεσε τίποτα (`image(20260926-112355).png`). Gate 3 OPEN, εφαρμογή/κανόνες/αναλυτικά σύνολα AWAITING LAB. PR #1337 περιέχει μόνο σύρσιμο φωτογραφίας, CI pending. Καμία νέα πληρωμή, stock ή οριστικοποίηση.

## 26/09/2026 14:06 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ μετά #1333 — LAB FAIL, μικτό ακόμη 0,00 €

Οι εικόνες `image(20260926-110519).png` και `image(20260926-110610).png` από το ίδιο πρόχειρο δείχνουν και πάλι πορτοκαλί «Πληρωτέο γραμμών 0,00 € αντί τυπωμένου 87,10 €», ενώ ο πίνακας έχει 19 γραμμές, 77,08 € καθαρό, 10,02 € ΦΠΑ, 87,10 € σύνολο. Exact deployed revision ελέγχου `/api/health`: `f2ee13dc20b7923b6202cb06885f5b5c44dc3677` (docs-only #1334 πάνω στο #1333). **LAB FAIL**, Gate 3 OPEN. Δεν εφαρμόστηκε γραμμή, δεν έγινε νέα πληρωμή/οριστικοποίηση/stock. Το προηγούμενο fallback απαιτούσε και δομημένο `printedNetTotal`, μολονότι ο υφιστάμενος έλεγχος το θεωρεί προαιρετικό. Επόμενη bounded αλλαγή υπολογίζει ελλείπον μικτό μόνο από πλήρη πεδία της ίδιας γραμμής εφόσον υπάρχει τυπωμένο πληρωτέο, χωρίς να αντικαθιστά αντιφατικό μη κενό μικτό. CI #3385 PASS, PR #1335 merged `86b5c5a85d5e78df8cdd22fb41b9156b46db3b88`, exact Render `/api/health` `ok=true` / ίδιο revision 26/09/2026 14:12 Ελλάδας. **AWAITING LAB** στο ίδιο πρόχειρο για άρση του 0,00 € με όλα τα τυπωμένα πεδία και ανθρώπινο έλεγχο.

## 26/09/2026 13:55 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ #1331 — LAB FAIL κενού μικτού γραμμών

Με exact Render `5b6e8154b8e8665cd05a132b1f1a5945e2380ccc` στο ίδιο πρόχειρο 23.991, οι εικόνες `image(20260926-105457).png` και `image(20260926-105519).png` δείχνουν σαφή αιτία: «Πληρωτέο γραμμών 0,00 € αντί τυπωμένου 87,10 €». Ο πίνακας υπολογίζει 19 σειρές, καθαρό 77,08 €, ΦΠΑ 10,02 €, 87,10 € και 0,00 € διαφορά, αλλά τα `grossAmount` του μοντέλου είναι κενά. **LAB FAIL** εφαρμογής/αυτόματου πρόχειρου, Gate 3 OPEN. Καμία εφαρμογή/πληρωμή/stock/οριστικοποίηση. Bounded διόρθωση συμπληρώνει μόνο ελλείπον μικτό από αναγνωσμένα καθαρό+ΕΦΚ+ΦΠΑ όταν υπάρχει τυπωμένο καθαρό και πληρωτέο, διατηρεί αντιφατικό μη κενό μικτό και απαιτεί όλους τους υπάρχοντες ελέγχους. CI #3381 PASS, PR #1333 merged `9b07bb038fc517e8aa0b334da99e687721ab7265`, exact Render `/api/health` `ok=true` / ίδιο revision 26/09/2026 14:02 Ελλάδας. **AWAITING LAB** στο ίδιο πρόχειρο για 19 γραμμές, 77,08 + 10,02 = 87,10 € και άρση της λανθασμένης φραγής.

## 26/09/2026 13:44 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ #1329 — οικονομικά συμφωνούν, LAB FAIL φραγής

Στο ίδιο πρόχειρο 23.991 μετά το exact deploy `323b27560dbf9b2aee0e4f4f8ea04041f5cbe445`, οι εικόνες `image(20260926-104353).png` και `image(20260926-104417).png` δείχνουν 19 γραμμές, επανυπολογισμένο καθαρό 77,08 €, ΦΠΑ 10,02 €, πληρωτέο 87,10 €, διαφορά 0,00 €: περιορισμένη παρατήρηση οικονομικής αναπαράστασης. Το API όμως απαντά ότι δεν επιβεβαιώθηκαν σελίδες/άθροισμα και αποκρύπτει την εφαρμογή, παρά την ορατή «Σελ. 1/1». **LAB FAIL** λειτουργικής εφαρμογής, Gate 3 OPEN. Κανένα είδος δεν προστέθηκε, νέα πληρωμή/οριστικοποίηση/stock NOT TESTED. Η διαγνωστική διάκριση ελέγχων σελίδων, μικτού, ποσότητας και καθαρού πέρασε CI #3377, συγχωνεύτηκε με PR #1331 / `5b6e8154b8e8665cd05a132b1f1a5945e2380ccc` και επιβεβαιώθηκε στο Render `/api/health` με ίδιο revision στις 26/09/2026 13:51 Ελλάδας. **AWAITING LAB** στο ίδιο πρόχειρο για την ακριβή αιτία της φραγής.

## 26/09/2026 13:13 (Ελλάδα) — Gate 3 ΝΤΑΒΟΥ 23.991 — LAB FAIL οικονομικών

Μετά το #1327 / deployed `3906600d0d3d83cc55dc932562ac581ff7d068c1`, οι εικόνες `image(20260926-101254).png`, `image(20260926-101327).png`, `image(20260926-101344).png` στο ίδιο υπάρχον πρόχειρο δείχνουν 19 αναγνωσμένες φυσικές γραμμές και τυπωμένα 87 / 77,08 € / 10,02 € / 87,10 €. Ο επεξεργάσιμος πίνακας υπολογίζει 76,92 € καθαρό, 10,00 € ΦΠΑ, 86,92 € πληρωτέο: διαφορά 0,18 €. **LAB FAIL** οικονομικών, Gate 3 OPEN. Το POS πρόχειρο είχε 0 γραμμές και η προεπισκόπηση πρόσφερε 18 προσθήκες χωρίς εφαρμογή. PR #1329 προσθέτει φραγή συνολικής οικονομικής ασυμφωνίας και περιορισμένη αναπαράσταση στρογγυλοποιημένης σταθερής έκπτωσης ανά γραμμή· τοπικά 15/15 tests και build PASS, πλήρες CI #3373 PASS, merge `323b27560dbf9b2aee0e4f4f8ea04041f5cbe445`, exact Render `/api/health` `ok=true` / ίδιο revision στις 26/09/2026 13:37 Ελλάδας. **AWAITING LAB** επανάνοιγμα του ίδιου πρόχειρου, όχι νέο POS/πληρωμή. Νέα POS υποβολή, δεύτερη πληρωμή, τελική καταχώριση, stock και αντίκτυπος βάρδιας NOT TESTED.

## 26/09/2026 — Gate 3 Mini εικόνα πίνακα PR #1327 — CI/DEPLOY PASS, LAB AWAITING

Πλήρες CI #3364 PASS, merge `3906600d0d3d83cc55dc932562ac581ff7d068c1`, ακριβές Render `/api/health` `ok=true` με ίδιο revision. Η νέα ανάγνωση των φωτογραφιών του υπάρχοντος ΝΤΑΒΟΥ 23.991 **AWAITING LAB**. Το προηγούμενο αποτέλεσμα 20 κενών σειρών παραμένει LAB FAIL και δεν αναιρείται από CI. Καμία POS επανυποβολή/νέα πληρωμή/οριστικοποίηση. Gate 3 OPEN.

## 26/09/2026 12:56 — Gate 3 ΝΤΑΒΟΥ μετά #1325 — LAB FAIL 20 κενές σειρές / Mini pipeline AWAITING

Exact Render `cdfad903933301133f8451eae96f5b59831741d5`: ίδιο πρόχειρο ΝΤΑΒΟΥ 23.991, μία νέα προεπισκόπηση επιστρέφει 20 κενές σειρές παρότι διαβάζει 87/77,08/10,02/87,10 € από τα συνολικά. **LAB FAIL** έναντι 19 φυσικών γραμμών. Εφαρμογή μπλοκαρίστηκε· καμία POS επανυποβολή/πληρωμή/οριστικοποίηση. Read-only πηγή Mini αποκαλύπτει πλήρη εικόνα + μεγεθυμένο πίνακα και `gpt-5.6-sol`; μεταφορά αυτής της εισόδου στον server AWAITING CI/DEPLOY/LAB. Οικονομικά/stock NOT TESTED, Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 12:50 — Gate 3 PR #1325 CI/DEPLOY PASS · ΝΤΑΒΟΥ LAB AWAITING

CI #3360 PASS, merge `cdfad903933301133f8451eae96f5b59831741d5`, Render `/api/health` exact ίδιο revision. Η ανάγνωση 19 γραμμών και αριθμητικών πεδίων στο υπάρχον πρόχειρο 23.991 παραμένει **AWAITING LAB**· καμία επανυποβολή POS/νέα πληρωμή ή οριστικοποίηση. Gate 3 OPEN.

## 26/09/2026 12:39 — Gate 3 ΝΤΑΒΟΥ 23.991 — LAB FAIL ανάγνωσης πεδίων / AWAITING CI, DEPLOY, LAB

Πρωτότυπο 19 γραμμές / ποσότητα 87 / καθαρή 77,08 € / ΦΠΑ 10,02 € / πληρωτέο 87,10 €. Ο ενσωματωμένος βοηθός επέστρεψε 18 ονομασίες μόνο, χωρίς αριθμητικά πεδία· το ξεχωριστό Mini παρουσίασε 19 πλήρεις γραμμές, αλλά δεν αποτελεί PASS του κύριου. Η πρώτη χειρόγραφα διαγραμμένη σειρά συμμετέχει στα τυπωμένα σύνολα. Νέα στενή αλλαγή ελέγχει τυπωμένη ποσότητα/καθαρή/ΦΠΑ και σταθερή έκπτωση καλαθιού, μαζί με πληρότητα σελίδων/μικτό. Στοχευμένο τοπικό τεστ PASS, πλήρες CI/deploy/LAB AWAITING. Καμία δεύτερη υποβολή, πληρωμή, εφαρμογή ή οριστικοποίηση· οικονομικά/stock NOT TESTED. Gate 3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 12:25 — Gate 3 ΝΤΑΒΟΥ 23.991 — LAB FAIL πλήρους ανάγνωσης / POS status περιορισμένο PASS

Στην exact deployed revision `ba95ceb4252da8345b19996ec3d75c935cec4e03`, νέα μία υποβολή `MYWORKSTATION LAB POS 2` δημιούργησε πρόχειρο ΝΤΑΒΟΥ Α.Ε. 23.991 αλλά ολοκλήρωσε με 0 είδη / `POS_BACKGROUND_ASSISTANT_READ`: άθροισμα φυσικών γραμμών ασύμφωνο με το τυπωμένο πληρωτέο. **LAB FAIL** συμπλήρωσης. Το POS τερμάτισε σωστά την ένδειξη σε «χρειάζεται έλεγχο»: περιορισμένο LAB PASS status. Εκκρεμεί πρωτότυπο και προεπισκόπηση βοηθού για αιτιώδη σύγκριση· ποσά/stock/δεύτερο POS NOT TESTED χωρίς πριν/μετά. Καμία δεύτερη υποβολή, εφαρμογή ή οριστικοποίηση. Gate 3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Gate 3 ΠΗΓΑΣΟΣ/ΚΑΜΑΡΑΣ LAB FAIL, PR #1322 DEPLOYED / AWAITING LAB

Το PR #1321 πέρασε CI #3349 και exact deploy `c4803f0841e38a6783f2d96cba50814ef4dd9f86`. Πραγματική υποβολή ΠΗΓΑΣΟΣ 510/18435 από LAB POS 2 δημιούργησε το ίδιο πρόχειρο αλλά κατέληξε σε 0 γραμμές / `POS_BACKGROUND_ASSISTANT_READ`: LAB FAIL συμπλήρωσης. Το ΚΑΜΑΡΑΣ 006266, 7 τυπωμένες γραμμές / 31,65 €, ήταν POS_PROCESSING στις 12:01, αλλά στις 12:02 κατέληξε επίσης `AWAITING_APPROVAL / POS_BACKGROUND_COMPLETE`, 0 γραμμές και γενικό `POS_BACKGROUND_ASSISTANT_READ`: LAB FAIL αυτόματης συμπλήρωσης. Στον βοηθό εμφανίστηκαν 6/7 γραμμές και η μετασχηματισμένη `καμαρας-clean.jpg`, ενώ η ένδειξη POS έμενε εσφαλμένα σε επεξεργασία. Το Mini διάβασε το πρωτότυπο σε ~25 δευτερόλεπτα με 7 γραμμές / 31,65 € / διαφορά 0,00 €· αυτό δεν αποτελεί PASS ενσωμάτωσης. Το PR #1322 επιτρέπει μόνο πλήρες φύλλο αρίθμητο ή «Σελίδα: 1» χωρίς γνωστό πλήθος, διατηρεί την αρχική φωτογραφία για τη Θυρίδα/βοηθό και τερματίζει σωστά το badge «χρειάζεται έλεγχο». 2/2 και ασυμφωνίες παραμένουν μπλοκαρισμένα. Server suite 1.548 PASS / 1 SKIP, client build PASS και πλήρες CI #3354 PASS· merged και exact Render revision `ba95ceb4252da8345b19996ec3d75c935cec4e03`· νέο LAB AWAITING. Οικονομικά, stock και άλλο POS NOT TESTED χωρίς πριν/μετά· καμία δεύτερη υποβολή ή οριστικοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Gate 3 αυτόματη ανάγνωση βοηθού μετά το POS — LOCAL PASS / AWAITING CI, DEPLOY, LAB

Νεότερη ρητή ροή ιδιοκτήτη: POS FAST ανάγνωση κεφαλίδας και μία πληρωμή/πίστωση → ανθεκτική αποθήκευση έως 5 φωτογραφιών στη Θυρίδα και ένα υπάρχον πρόχειρο Παραγγελιών & Αγορών → αυτόματη ανάγνωση φυσικών γραμμών από τον βοηθό στο ίδιο background job → ελεγκτής επεξεργάζεται το σημερινό συνδεδεμένο πρόχειρο → υπάρχουσα οριστικοποίηση/αποθήκη/υπόλοιπα/συμβάντα. Τοπική υλοποίηση σε `agent/gate3-assistant-editable-table-20260926` με φραγή ελλιπών σελίδων, αριθμητικής γραμμής και >2 αβέβαιων σειρών· κανένα παραγωγικό ή πραγματικό LAB PASS. Build και 4 στοχευμένοι έλεγχοι PASS· πλήρες CI/deploy/LAB εκκρεμούν. Δείγμα Ριζώ ΤΔΑ 6097 παραμένει LAB FAIL, οικονομικά/stock NOT TESTED. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Gate 3 ενσωματωμένος επεξεργάσιμος πίνακας — CI PASS / AWAITING LAB

Με βάση το Mini MyWorkStation, ο βοηθός προβάλλει φωτογραφία δίπλα σε πλήρη επεξεργάσιμο πίνακα με τοπικό επανυπολογισμό και επιλογή γραμμών πριν από αποθήκευση στο πρόχειρο. Το αρχικό POS πρόχειρο παραμένει ορατό για σύγκριση, η συζήτηση συνεχίζεται όσο το παράθυρο είναι ανοιχτό. Διατηρείται η φραγή του LAB FAIL ΤΔΑ 6097 για ελλιπείς φωτογραφίες. Τοπικός build PASS· CI/deploy/LAB εκκρεμούν· Gate 3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Gate 3 Ριζώ ΤΔΑ 6097 βοηθός ελλιπών σελίδων — LAB FAIL / AWAITING CI

Πραγματικό `MYWORKSTATION LAB POS 2`: έντυπο 2/2, 111,32 €, αλλά στον βοηθό μόνο μία φωτογραφία και πρόχειρο 12 γραμμές / 53,82 €. Πρότεινε τις ίδιες τρεις μη αντιστοιχισμένες γραμμές για ΦΠΑ/έκπτωση και διαγραφή. Δεν εφαρμόστηκε τίποτα· βάρδια, stock, πληρωμή NOT TESTED χωρίς πριν/μετά. Στενή προστασία μπλοκάρει προτάσεις αν δεν επιβεβαιώνονται όλες οι φυσικές σελίδες και το άθροισμα με το έντυπο. AWAITING CI/DEPLOY/LAB, Gate 3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Gate 3 βοηθός πλήρους προεπισκόπησης — CI PASS / AWAITING LAB

Μετά το LAB FAIL ΑΡΒΑΝΙΤΗ #012766 (15 τυπωμένες γραμμές, 192,58 €, αρχικό πρόχειρο 359,66 €, άστοχες προτάσεις), ο ενσωματωμένος βοηθός αποκτά όλες τις φυσικές γραμμές, ιστορικό συνομιλίας, καθαρή/εκπτώσεις/ΕΦΚ/ΦΠΑ/πληρωτέο, προτεινόμενη προσθήκη και διαγραφή μόνο με ανθρώπινη επιλογή. ΧΑΤΖΗΒΑΣΙΛΟΓΛΟΥ #112263: περιορισμένο USER PASS περιγραφικής διόρθωσης, διαφορά 0,01 € αποδεκτή· το Gate 3 παραμένει OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`. PR #1318 / CI #3343 PASS / Render exact `425c5ebd` PASS. Νέο LAB POS **εκκρεμεί**.

## 26/09/2026 01:30 (Ελλάδα) — Render #1316 DEPLOY PASS / Gate 3 LAB AWAITING

Το πράσινο Render deploy του PR #1316 επιβεβαιώθηκε στο δημόσιο `/api/health`: `ok=true`, ακριβές revision `6345a6d268977117ca1b86f66a22c4d02a145fb3`. Το startup blocker `WorkforcePayrollLine` δεν εμποδίζει πλέον την εκκίνηση. Ο ιδιοκτήτης θα υποβάλει ένα νέο τιμολόγιο από το POS· πρώτο αυτόματο πρόχειρο, φωτογραφίες, γραμμές, ΕΦΚ/ΦΠΑ, πληρωμή και stock παραμένουν NOT TESTED. Gate 3 OPEN.

## 26/09/2026 — Render startup Workforce payroll / LAB FAIL, AWAITING CI + DEPLOY

Στο τελευταίο deploy του merge `158806f`, το Render απέτυχε στην εκκίνηση: Prisma P2010/42P01, `relation "WorkforcePayrollLine" does not exist` στο `ensure-workforce-v2-schema.js`. Το δημόσιο `/api/health` εξακολουθούσε να αναφέρει `b9ddca396af0caae744820e4268bddbcfce718bb`. PR #1316 προσθέτει μόνο ελλείποντες πίνακες Payroll πριν από τα ήδη υπάρχοντα ALTER/INDEX. Τοπικό `node --check` PASS· CI, ακριβές Render revision και πραγματικό POS invoice LAB NOT TESTED. Δεν υπάρχει Gate 3 PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-render-workforce-startup-failure.md`.

## 26/09/2026 — Gate 3: ρυθμισμένο μοντέλο βοηθού / AWAITING CI-LAB

Μετά το merged PR #1314 (CI #3333 PASS) ο βοηθός πρέπει να χρησιμοποιεί τη ρύθμιση `OPENAI_INVOICE_MODEL=gpt-5` που υπάρχει ήδη στο Render, με δυνατότητα ειδικής παράκαμψης `OPENAI_INVOICE_ASSISTANT_MODEL`. Μικρή αλλαγή στο branch `agent/gate3-invoice-assistant-configured-model-20260926`· νέο CI, πραγματικό deploy και LAB εκκρεμούν. Καμία δήλωση LAB PASS.

## 26/09/2026 — Gate 3: βοηθός επάνω στο POS draft / AWAITING CI-LAB

Το branch `agent/gate3-pos-invoice-assistant-review-20260926` συνεχίζει το PR #1313 (ΕΦΚ, CI #3327 PASS). Σχεδιάστηκε επιθεώρηση έως 5 φωτογραφιών, εντολές στα ελληνικά, χρωματισμένες προτάσεις ανά πεδίο και ρητή αποδοχή σε ήδη υπάρχουσες γραμμές. Εφαρμογή μέσω της υπάρχουσας διόρθωσης με audit/learning, χωρίς δεύτερη πληρωμή, stock ή οριστικοποίηση. Η οθόνη είναι σε υλοποίηση· **CI PASS / AWAITING LAB**, κανένα πραγματικό PASS.

## 26/09/2026 — Gate 3: ΕΦΚ POS draft / CI PASS, LAB AWAITING

Ο ιδιοκτήτης ενέκρινε την ανάληψη του Gate 3 από αυτή τη σελίδα. Backup branch `backup/pre-invoice-assistant-20260926` στο `b9ddca396af0caae744820e4268bddbcfce718bb`. Draft PR #1313, branch `agent/gate3-integrate-invoice-assistant-20260926`: διατηρεί ΕΦΚ στην εισαγωγή, υπολογίζει ΦΠΑ στη φορολογητέα αξία καθαρής γραμμής + ΕΦΚ και δεν εκτελεί την παλιά αυτόματη συμφωνία που αγνοούσε τον ΕΦΚ. CI #3327 PASS· πραγματικό LAB POS εκκρεμεί.

## 25/09/2026 — Workforce μισθοδοσία / AWAITING LAB

Το checkpoint `CHECKPOINTS/CHANGES/2026-09-25-workforce-payroll-hardening.md` περιγράφει τη ροή πληρωμών, ledger, κλείσιμο περιόδου και UI. Οι στοχευμένοι έλεγχοι ήταν 16/16 PASS· εκκρεμούν runtime/LAB αποδοχή και end-to-end έλεγχοι με βάση. Η καταγραφή αυτή διατηρεί την πρόοδο της νεότερης αλλαγής μισθοδοσίας μετά την επαναφορά της τελευταίας αναγνώσιμης έκδοσης της ενεργής λίστας.

## 25/09/2026 — Gate 3: πραγματικό POS αγνόησε ακριβείς κανόνες / LOCAL PASS, AWAITING CI-LAB

COFFEE UNION νέα POS `ΤΔΑ0010517`: `FR1500` 24 pcs αντί 2.400, διορθώθηκε/εκπαιδεύτηκε. `ΤΔΑ0010084`: 3/3 γραμμές, 822,33 €, σωστά 27.000 g / 2.000 g / `FR1710` 500 pcs. Νέο `ΤΔΑ0009902`: `DEL005` 4% αντί 25%, `FR1500` 48 αντί 4.800 pcs και 1.062,26 € αντί 1.059,02 €, ενώ το POS έγραψε ψευδώς ΟΚ λόγω ορίου 5 € αντί 0,05 €. Διορθώθηκε χειροκίνητα σε 1.059,01 € / 0,01 €, χωρίς οριστικοποίηση/stock. Στενή αλλαγή: verified ακριβής SuperAdmin correction υπερισχύει OCR μονάδας, exact-code έκπτωση εφαρμόζεται μόνο αν βελτιώνει το τρέχον total, status από τις τελικά αποθηκευμένες γραμμές. Διαφορά πάνω από 0,05 € **δεν μπλοκάρει το POS**: περνά πρόχειρο με προειδοποίηση· full reread κρατά όριο 5 €. 1.497 server tests PASS / 0 FAIL / 1 SKIP και frontend build PASS. Πλήρης CI/deploy και άλλο νέο POS τιμολόγιο εκκρεμούν· κανένα παλιό δεν επανυποβάλλεται. Gate3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-pos-exact-learning-rules.md`.

## 25/09/2026 — Gate 5 αναγνώσιμα αποδεικτικά πληρωμών — AWAITING CI/DEPLOY/LAB

Τοπικά αναπαράχθηκε η ψευδής αυτόματη συμφωνία από προσυμπληρωμένο ποσό χωρίς ανάγνωση αρχείου. Η στενή αλλαγή διαβάζει μόνο ρητά πεδία από PDF πληρωμής/κατάθεσης, απορρίπτει ρητές διαφορές και αφήνει φωτογραφία, ασαφές ή μη αναγνώσιμο αρχείο για ανθρώπινο έλεγχο. `npm test -w server`: 1.488 PASS, 0 FAIL, 1 SKIP· frontend build PASS. CI, exact deploy και ενιαία τελική LAB σειρά εκκρεμούν. Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate5-readable-payment-proof-awaiting-lab.md`.

Deployed `99dbb84` LAB επανέλεγχος: λάθος και σωστό PDF δεν καταχώρισαν πληρωμή, ΔΑ0011467 παρέμεινε 1.380,24 €, με γενικό σφάλμα. Διορθώνεται το απροστάτευτο import του PDF reader ώστε αποτυχία ανάγνωσης να πηγαίνει σε ανθρώπινο έλεγχο. RETEST μετά CI/deploy, Gate 5 OPEN.

## 25/09/2026 — Gate 4 ίδιος χειριστής σε δύο POS — CI PASS / AWAITING LAB

Η υφιστάμενη φραγή εισόδου κάλυπτε μόνο ανοιχτή βάρδια στο άλλο POS. Στο branch `agent/gate4-operator-dual-session-20260925`, ανεξάρτητο υποσκέλος της συνολικής ανάθεσης Gate 4, η είσοδος PIN/κάρτας ελέγχει και ενεργή συνεδρία άλλου terminal με σειριοποίηση στον ίδιο χειριστή. Εξακολουθούν να επιτρέπονται δύο διαφορετικοί χειριστές στα δύο POS. Τοπικό node check και στοχευμένοι έλεγχοι PASS· πράσινο CI, ακριβές deploy και πραγματικό LAB δύο φυσικών POS εκκρεμούν. Κανένα νέο LAB PASS, καμία οικονομική πράξη. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-operator-dual-session.md`.

## 25/09/2026 — Gate 5 ορατότητα αποδεικτικού και ακριβής κατάσταση — CI PASS / AWAITING LAB

Μετά το G5-P11 η μη ελεγμένη εκκρεμότητα χαρακτηρίζεται λανθασμένα «ΑΠΟΚΛΙΣΗ» επειδή `matched=false`, ενώ η προβολή αποδεικτικού στο review χρησιμοποιεί endpoint δεμένο με το companyId του session και αποτυγχάνει σε πληρωμή άλλης εταιρείας για Super Admin. Το Super Admin analytics δείχνει μόνο όνομα αρχείου. Στενή αλλαγή: ξεχωριστή ανάγνωση αποδεικτικού μόνο για ιδιοκτήτη της ίδιας εταιρείας ή Super Admin και μόνο για PENDING_REVIEW/DISCREPANCY· σύνδεση και στις δύο οθόνες, σαφής «ΑΠΑΙΤΕΙΤΑΙ ΕΛΕΓΧΟΣ ΑΠΟΔΕΙΚΤΙΚΟΥ» αντί απόκλισης, μετρητής αποκλίσεων μόνο για πραγματικό DISCREPANCY. Δεν αλλάζουν καταχωρίσεις/εγκρίσεις/υπόλοιπα. Τοπικό build, node check και στοχευμένο τεστ PASS· CI, exact deploy, read-only LAB οπτική δοκιμή εκκρεμούν. Προηγούμενα P02–P10 διατηρούνται, πραγματικό content OCR, API/race, συνολικό Gate 5 OPEN.

## 25/09/2026 — Gate 5 αποδεικτικό πληρωμής: ψευδής αυτόματη συμφωνία — AWAITING LAB

Στατική αναπαραγωγή: το `automaticCheck.matched` γινόταν true με μόνο συνημμένο αρχείο και ίσο άθροισμα κατανομών, χωρίς ανάγνωση ποσού/μεθόδου από το αρχείο. Το ιστορικό P08 PDF BANK_TRANSFER είχε υποβληθεί ως CASH_SHIFT. Στενή αλλαγή: ρητή προειδοποίηση ελέγχου περιεχομένου όταν υπάρχει αρχείο, ώστε να μην αποδίδεται αυτόματη συμφωνία. Η οικονομική ροή μένει ίδια. PR #1257, CI #3182 PASS, ακριβές Render `52b70a162e6f82e2aa69104564845920f64cde6e`· απαιτείται read-only LAB οπτική επιβεβαίωση σε νέα εκκρεμή πληρωμή· χωρίς νέα οικονομική πράξη μόνο για αυτή τη δοκιμή. Πραγματική ανάγνωση αποδεικτικού, API/race και τελική συμφωνία OPEN. `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## 25/09/2026 — Gate 3: κωδικός, εκπτώσεις και γραμμάρια σωστά στο Learning / POS OPEN

PR #1267, CI #3205/main PASS, exact Render c2a908d. Με υποχρεωτική πρώτα «Εύρεση επωνυμίας» επιβεβαιώθηκε COFFEE UNION ATTICA Ε Ε/803142360. Ο ασφαλής κανόνας L. S21005→ES21005 για την ακριβή περιγραφή έδωσε πλήρη recheck ES21005/DEL005/ES01000,1/1000/12000,25/25/34,08%, KG→GR και344,53€. 0 πρόχειρα/8 εκπαιδευμένα. Barcodes OPEN. Learning diagnostic agreement, όχι νέο POS PASS. Το υπάρχον ΤΔΑ0012183 δεν διαγράφεται/επανυποβάλλεται· απαιτείται νέο POS τιμολόγιο. Gate3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-explicit-code-correction.md`.

## 25/09/2026 — Gate 3: έκπτωση25% και γραμμάρια διατηρούνται στον διαγνωστικό επανέλεγχο / Gate OPEN

PR #1262, πλήρες CI #3194 και main CI36131882253 PASS, exact Render de067ce. Ολοκληρωμένη επανανάγνωση της ίδιας Coffee0012183: DEL00525% αντί24,96%,1 ΚΙΛΟ→1000 ΓΡ, ES01000 34,08%,12 ΚΙΛΟ→12000 ΓΡ,3/344,53€,0 πρόχειρα/8 εκπαιδευμένα. Κωδικός L. S21005 αντί ES21005 και αντιστοιχίσεις παραμένουν OPEN. Διαγνωστική συμφωνία μόνο· όχι νέο POS/LAB PASS. Όλοι οι προμηθευτές για νέα POS αποδοχή NOT TESTED, Gate3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-current-discount-rounding.md`.

## 25/09/2026 — Gate 3: ρητή αποθήκευση και επανέλεγχος μονάδων — διαγνωστική συμφωνία, Gate OPEN

PR #1258, CI #3188 PASS, exact Render 1615690. Αναγνώστηκε πραγματικό κεντρικό ΠΑΚΕΤΟ→ΤΜΧ για DEL005/ES01000, αποθηκεύτηκαν μόνο οι δύο ελεγμένοι κανόνες με server acknowledgement και έγινε ολοκληρωμένος επανέλεγχος: 1 ΚΙΛΟ→1000 ΓΡ, 12 ΚΙΛΟ→12000 ΓΡ, 3/344,53 €, 0 πρόχειρα/8 εκπαιδευμένα. Κωδικός L. S21005 και έκπτωση DEL005 24,96% παραμένουν λάθος, barcodes/αντιστοίχιση OPEN. Δεν αποτελεί νέο POS LAB PASS. Κανένα ιστορικό FAIL δεν κλείνει· όλοι οι προμηθευτές για νέο POS NOT TESTED. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-explicit-conversion-priority.md`.

## 25/09/2026 — Gate 3: live recheck μετά #1255 FAIL · ρητή αποθήκευση κανόνα LOCAL 18 PASS / AWAITING CI-LAB

CI #3177/#3178 και exact Render b05fe33 επιβεβαιώθηκαν. Παλιός και φρέσκος client, καθώς και μία ελεγμένη διόρθωση DEL005 από τον υπάρχοντα editor, επέστρεψαν PACKAGE/ΤΜΧ στον ολοκληρωμένο recheck. Δεν υπάρχει LAB PASS. Η γενική αποθήκευση κρατά παλιές SUPER_ADMIN_LINE_CORRECTION πάνω από νέα UI mappings. Στο ίδιο scope διορθώνεται η ρητή αποθήκευση επιλεγμένων κανόνων και η ανάγνωση κεντρικού προφίλ. Χωρίς POS/οριστικοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-explicit-conversion-priority.md`.

## 25/09/2026 — Gate 3: ρητή μετατροπή έναντι παλιού product knowledge — LOCAL 14 PASS / AWAITING CI-LAB

Ίδιος owner, branch `agent/gate3-explicit-conversion-priority-20260925`. Το υπάρχον Coffee profile δηλώνει stockConversion.factor χωρίς unitsPerPackage, με αποτέλεσμα να μην ορίζεται confirmedPackMapping πριν από το product knowledge. Αναπαραγωγή FAIL PACKAGE αντί ΚΙΛΟ στο υπάρχον profile μέσω πραγματικών συναρτήσεων· μετά τη στενή διόρθωση προτεραιότητας 14 tests PASS. Όχι νέο OCR ή αλλαγή κοινών κανόνων. Τελευταίο πραγματικό αποτέλεσμα #1251 FAIL, όλα τα νέα POS NOT TESTED. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-explicit-conversion-priority.md`.

## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

- Φυσικό LAB POS2 απέρριψε COFFEE UNION/ΤΔΑ0012183 **344,54 €** έναντι διαθέσιμων **344,53 €** με σαφές μήνυμα. Μετά το τιμολόγιο 344,53 €, owner queue 0, LAB εικονική τράπεζα −43,62 €/αναμονή 0, POS1 1 κίνηση/0 έξοδα, POS2 16 κινήσεις/0,20 € έξοδα και ΚΑΤ 22,36 € ίδια. PASS μόνο client-side UI και απομόνωση· API/race, απόκλιση αποδεικτικού, τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## Gate 5 — G5-P09 UI ποσού και πληκτρολογίου, περιορισμένο LAB PASS 25/09/2026

- PR #1250 CI #3165 πράσινο, exact Render `a3a1a040`: στο BackOffice LAB viewport 1363×936 το παράθυρο x84–1264 περιέχει πλήρως το ποσό x985–1215 και το κουμπί πληκτρολογίου x1177–1211. Οπτικός έλεγχος σε δύο ανοικτά τιμολόγια COFFEE UNION, χωρίς νέα πληρωμή. Desktop UI PASS· μικρότερη οθόνη/φυσικό POS και χρήση πλήρους πληκτρολογίου NOT TESTED. G5-P09 οικονομικό περιορισμένο PASS, συνολικό Gate 5 OPEN.

## 25/09/2026 — Gate 3: επανέλεγχος Coffee Union, μονάδες ακόμη FAIL

Μετά τα #1247/#1248 (CI #3159/#3161 PASS, exact health 6754b0b), το υπάρχον μη αποθηκευμένο Learning preview επανελέγχθηκε: 3 / 344,53 €, αλλά ο editor δείχνει PACKAGE → ΤΜΧ αντί ΚΙΛΟ → ΓΡ για DEL005/ES01000. Ο πρώτος κωδικός και η έκπτωση DEL005 επίσης παραμένουν λάθος. Καμία διαγραφή/νέα POS υποβολή/αποθήκευση/εκμάθηση/εφαρμογή διόρθωσης. Cache/παλαιός ανοικτός client δεν έχουν απομονωθεί. Gate 3 OPEN, πραγματική διαδρομή μονάδων FAIL ως παρατηρημένο αποτέλεσμα, νέο POS όλων των προμηθευτών NOT TESTED. Αναλυτικό πριν/μετά και διαπρομηθευτικός πίνακας: `CHECKPOINTS/CHANGES/2026-09-25-gate3-stock-unit-readback.md`.

## Gate 5 — G5-P09 ολική εικονική τραπεζική πληρωμή ιδιοκτήτη, περιορισμένο LAB PASS · UI AWAITING LAB 25/09/2026

- [x] Render `55dbbf3`, FRESH/ΒΒ 6529 46,92→0 €, LAB εικονική τράπεζα επιβεβαιωμένη 3,30→−43,62 €, αναμονή/ουρά 0, POS1 1 κίνηση/0 έξοδα, POS2 16 κινήσεις/0,20 € έξοδα και ΚΑΤ 22,36 € αμετάβλητα. Audit αυτόματη επιβεβαίωση 13:19 χωρίς δεύτερη έγκριση. Αρνητικό LAB bank balance ως περιορισμός· κανένα πραγματικό έμβασμα. Στενή φόρμα/πληκτρολόγιο εκτός παραθύρου: bounded UI fix, frontend build PASS, CI/deploy και οπτικό LAB **AWAITING LAB**. Διπλή/υπερπληρωμή, mismatch, τελική συμφωνία OPEN. `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## 2026-09-25 — Gate 3 μονάδα στην επαναφόρτωση — LOCAL 53 + CI #3161 PASS / διαγνωστικός επανέλεγχος FAIL

Ίδιος owner, συνέχεια #1247. Η μετατροπή του Learning reader έγραφε PCS παρά ρητό ΓΡ. Διατήρηση δηλωμένης μονάδας και προτεραιότητα επιβεβαιωμένου supplier mapping έναντι παλιού product knowledge. Δεν αλλάζουν οικονομικά ή OCR. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-stock-unit-readback.md`. Gate 3 OPEN.

## 2026-09-25 — Gate 3 εκμάθηση γραμμαρίων — LOCAL 50 + CI #3159 PASS / AWAITING LAB

Ίδιος owner, branch `agent/gate3-preserve-stock-learning-20260925`. Το learning serializer αποθήκευε πάντα PCS και έχανε ρητό stockConversion. Περιορισμένη διόρθωση διατήρησης μονάδας/συντελεστή· όχι αλλαγή OCR. Ανεξάρτητη Coffee Union ανάγνωση: 3 / 344,53 €, αλλά κωδικός/έκπτωση/ετικέτες παραμένουν λανθασμένα· όχι POS PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-preserve-learned-stock-units.md`.

## 2026-09-25 — Gate 3 νέα ανάθεση / πραγματικά διαγνωστικά / OPEN

Ανάθεση `agent/gate3-evidence-recovery-20260925`, μετά την παράδοση #1239. Read-only LAB Coffee Union και ΜΟΥΧΑΛΗΣ επιβεβαιώνουν λάθη αρχικής ποσότητας και πρόσθετες σειρές μετά την ανάκτηση. Τοπική αναπαραγωγή συγχώνευσης διαφορετικών OCR κωδικών· 42 υπάρχοντα tests PASS δεν αποδεικνύουν σωστή ανάγνωση. Η μετατροπή κιλών σε γραμμάρια είναι υποχρεωτική: 1→1.000 g, 12→12.000 g, ίδια καθαρή αξία. Καμία νέα POS υποβολή/πληρωμή/απόθεμα. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-evidence-recovery-takeover.md`.
## 2026-09-25 — Gate 4 φυσικό POS1 / Νοσηλευτές / SKU 2273 — USER PASS καλαθιού

- [x] Ο ιδιοκτήτης ανέφερε στις ~12:59 ότι 1 × ΝΕΡΟ ΠΙΠΙΛΑ 750ML, βασική 0,80 €, με «Νοσηλευτής / Νοσοκόμος» και τον ήδη αποθηκευμένο κανόνα 20% εμφανίζει **0,70 €** στο φυσικό LAB POS 1. Δεν μπορούσε να στείλει εικόνα, άρα PASS της ρητής μαρτυρίας μόνο. POS1 0→0 κινήσεις / 0,00→0,00 €, POS2 16→16 / 7,50→7,50 €· χωρίς πώληση. Μετά την ενέργεια health `94ae6479`, η ακριβής revision τη στιγμή της ενέργειας άγνωστη. Stock/Audit/checkout NOT TESTED. Το ίδιο καλάθι δεν επαναλαμβάνεται για φωτογραφία· Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/pos/PASS.md`.

## Gate 5 — G5-P08 κεντρικό Audit ακύρωσης, περιορισμένο LAB PASS 25/09/2026

- PR #1243 CI #3147 πράσινο, Render `94ae647`: παλιά ακύρωση FRESH 46,92 € ορατή μία φορά στα Συμβάντα 12:36 Αθήνας, LAB. Εικονική τράπεζα LAB 3,30 € επιβεβαιωμένο/0 € αναμονή, ΚΑΤ 22,36 € ίδιο. Το όνομα χειριστή εμφανίζεται ως τεχνικό ID, όριο αναγνωσιμότητας. Καμία νέα οικονομική πράξη. Ολική εξόφληση και τελική συμφωνία OPEN.

## Gate 5 — G5-P08 ορατό Audit ακύρωσης, AWAITING LAB 25/09/2026

- Νέα ανάγνωση LAB τράπεζας 3,30 € λογιστικό/επιβεβαιωμένο, 0 € αναμονή· ΚΑΤ 22,36 € ίδιο. Το συμβάν `SUPPLIER_SETTLEMENT_CANCELLED` καταγράφεται από API αλλά το κεντρικό Audit δεν το εμφάνιζε επειδή έλειπε από το φίλτρο τύπων. Προστίθεται προβολή/ετικέτα· CI/deploy και LAB ανάγνωση του υπάρχοντος συμβάντος εκκρεμούν. Δεν γίνεται νέα πληρωμή. Το περιορισμένο PASS ακύρωσης παραμένει, συνολικό Gate 5 OPEN.

## Gate 5 — G5-P08 περιορισμένο LAB PASS ακύρωσης, 25/09/2026

PR #1241 CI #3143 πράσινο, ακριβές Render `90ec8b7`. Μετά τη μία ακύρωση FRESH/ΒΒ 6529 46,92 €: ουρά/κεντρικές δεσμεύσεις 0 €, ανοιχτή οφειλή 46,92 €, POS2 ενεργές κινήσεις 17→16, έξοδα 47,12→0,20 €, πωλήσεις 7,50 € ίδιες. POS1 έκλεισε σε παράλληλο Gate4· τράπεζα/audit ακύρωσης NOT TESTED. Μόνο η ακύρωση έχει περιορισμένο PASS. Η αρχική λάθος μέθοδος μένει ιστορικό FAIL· ολική εξόφληση/αρνητικοί έλεγχοι/τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## 2026-09-25 — Gate 4 LAB/Νοσηλευτές: ένας νέος κανόνας 20% — περιορισμένο LAB PASS

- [x] Στις 12:27:17, Owner στο LAB/Master Catalog αποθήκευσε μία φορά 20% στο ενεργό ΝΕΡΟ ΠΙΠΙΛΑ 750ML `2273~5201627260500`: πριν 0 κανόνες/0 Audit, μετά 1 κανόνας ID `3090fc47-ba76-44fc-8b3f-ffd9c279a016` / Audit `f63d7b2e-5a0e-4733-8267-53826d855385`. Ιατροί 3×10% με ίδια IDs/Audit μετά. Exact Render `db38b4de`. POS2 17 κινήσεις/7,50 € αμετάβλητο, POS1 έκλεισε χωριστά από ιδιοκτήτη· καμία πώληση ή stock PASS. Πλήρες Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/pos/PASS.md`.

## 2026-09-25 — Gate 3 αποδέσμευση και παράδοση σε νέα σελίδα — OPEN

- [ ] Με εντολή ιδιοκτήτη, η προηγούμενη σελίδα **σταματά** εργασία Gate 3 και αποδεσμεύει την ανάθεση. Το Gate 3 είναι **ΕΛΕΥΘΕΡΟ ΓΙΑ ΑΝΑΛΗΨΗ** στη `docs/roadmap/PENDING_WORK.md`. Τελευταίο merged PR #1238 / commit `0d2f08d5d3e00935a68553ee515b691ef5f5e5eb` (κοινός κανόνας, CI PASS), τελευταία αλλαγή κώδικα #1235 / `abae3447fc945a46f791dd9c3641bdd1e7e0026b` χωρίς νέα LAB επαλήθευση. Τελευταίο πραγματικό LAB ΜΟΥΧΑΛΗΣ 090387 **FAIL**: 7 φυσικές γραμμές / 158,60 € → πρόχειρο 9 / 246,69 €. Καμία νέα υποβολή ή έγκριση. Εκκρεμότητες και οδηγίες: `CHECKPOINTS/CHANGES/2026-09-25-gate3-handoff-release.md`.

## 2026-09-25 — Κοινός κανόνας όλων των σελίδων για Gate 3 — OPEN

- [ ] Ισχύει το `AGENTS.md` § «Κοινός κανόνας Gate 3»: απογραφή και σύγκριση φυσικών γραμμών/ποσοτήτων/αξιών/εκπτώσεων/ΦΠΑ για πολλούς προμηθευτές, παλαιά PASS και FAIL, με πρώτο αυτόματο πρόχειρο από μία νέα POS υποβολή. Κάθε αλλαγή καταγράφει ανά τιμολόγιο PASS/FAIL/NOT TESTED πριν/μετά· unit test και συμφωνία συνόλου δεν είναι συνολικό LAB PASS. Η καταγεγραμμένη αποτυχία ΜΟΥΧΑΛΗΣ 090387 (7/158,60 € → 9/246,69 €) παραμένει FAIL. Καμία παράλληλη αλλαγή ή κλείσιμο Gate 3 από άλλη σελίδα. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-shared-acceptance-rule.md`.

## 2026-09-25 — Gate 3 προστασία ποσότητας όταν OCR μικτό=καθαρό — CI PASS / AWAITING LAB

- [ ] ΜΟΥΧΑΛΗΣ 090387: 7/158,60 € έντυπο, 9/246,69 € παλιό LAB πρόχειρο. Στο `finalizeV244ProductLines` ο αριθμός `1,8%` της περιγραφής δεν πρέπει να αντικαθιστά δομημένη ποσότητα όταν η μοναδική ασυνέπεια είναι μικτό=καθαρό με ΦΠΑ>0 και ισοσκελισμένα ποσότητα×τιμή−εκπτώσεις=καθαρό. Νέα προστασία στον κώδικα, 45 στοχευμένα tests PASS, CI/LAB PENDING. Δεν διορθώνει τις δύο επιπλέον γραμμές ούτε το ιστορικό πρόχειρο. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-25-gate3-structured-gross-guard-awaiting-lab.md`.
## 2026-09-25 — Gate 4 μη επιλεγμένο SKU 2273 — USER PASS καλαθιού

- [x] Φυσικό LAB POS 2, 11:46–11:47: 1 × ΝΕΡΟ ΠΙΠΙΛΑ 750ML / 2273, «Κανονική τιμή» 0,80 € → «Ιατρός» 0,80 € με 3 ενεργούς άλλους κανόνες. Stock −3→−3, POS2 16 κινήσεις / 7,50 € και POS1 1 / 1,00 € ίδια μετά, χωρίς πληρωμή. Exact Render `0a292fff`; εικόνες `image(20260925-084626).png`, `image(20260925-084729).png`. PASS μόνο τιμής καλαθιού ενός μη επιλεγμένου SKU· checkout, όλα τα άλλα μη επιλεγμένα και παλιό before/after NOT TESTED. Συνολικό Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/pos/PASS.md`.

## Gate 5 — G5-P07 έξοδο χειριστή POS2, περιορισμένο LAB PASS 25/09/2026

- Μία εικονική δαπάνη 0,10 € από ενεργή βάρδια POS2 με αρχικό PDF στις 11:03: 15→16 κινήσεις, έξοδα 0,10→0,20 € ήδη σε αναμονή, μία ουρά 0,10 €. Μία έγκριση ιδιοκτήτη 11:11: ουρά 0, ενεργή `#pay_5327…`, δύο διακριτά audit γεγονότα υποβολής/έγκρισης. Πωλήσεις POS2 7,50 €, LAB τράπεζα 3,30 €, POS1 και ΚΑΤ 22,36 € αμετάβλητα. Συνολικό Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## 2026-09-25 — Gate 3 ΜΟΥΧΑΛΗΣ 090387 — νέο LAB FAIL, πραγματικό POS

- [ ] Στο deployed `66fa833`, μία νέα POS υποβολή `090387`: έντυπο **7 σειρές / 60 τμχ / 127,90 € + ΦΠΑ 30,70 € = 158,60 €**· πρόχειρο **9 σειρές / 246,69 € (+88,09 €)**, ποσότητα `1,8%` από περιγραφή και %ΦΠΑ ως ποσό. Job `4d9f9af6-7539-412f-af14-0ee872af7052` POS_FAILED, προηγούμενο πρόχειρο διατηρήθηκε, χωρίς οριστικοποίηση/πληρωμή/stock. Provider 7 σειρές αλλά λανθασμένη έκτη ποσότητα και ΦΠΑ, table/Azure πρόσθεσαν δύο παρόμοιες σειρές. **Gate 3 OPEN.** Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-cross-supplier-evidence-inventory.md`.

## 2026-09-25 — Gate 4 ενεργοί κανόνες Ιατροί LAB — περιορισμένο LAB PASS

- [x] PR #1231, CI #3117, exact Render `baf5d0b7`: owner scoped ανάγνωση έδειξε ΝΕΡΟ 500ML, ΝΕΡΟ 1,5LT και EVIAN 500ML, **10% έκαστο**, ακριβώς 3 ενεργούς κανόνες, με IDs που συμφωνούν με τις εγγραφές Audit 09:15:15/09:52:30/10:00:45 και το πλήθος στην ήδη καταγεγραμμένη οθόνη φυσικού POS. Χωρίς save/πώληση/βάρδια. PASS μόνο τωρινής κατάστασης· αρχικό before/after και διαχρονική προστασία μη επιλεγμένων NOT TESTED. Συνολικό Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/pos/PASS.md`.

## 2026-09-25 — Gate 4 Audit μαζικής έκπτωσης — LAB PASS ανάγνωσης

- [x] Το PR #1229, CI #3113 και ακριβές Render `2c1e4b3f` εκθέτουν μόνο για ανάγνωση το υπάρχον Audit. Στο LAB/Ιατροί βρέθηκε η εγγραφή 10:00:45, 10%, δύο product IDs `4f126988…`, `79dd9494…`, Audit `e5073b16…`, και δύο παλαιότερες μονές εγγραφές 09:52:30/09:15:15. **LAB PASS μόνο ανάκτησης του ιστορικού συμβάντος** χωρίς νέα αποθήκευση/πώληση. Αρχικό πλήρες before/after κανόνα και μη επιλεγμένα είδη NOT TESTED· Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/pos/PASS.md`.

## 2026-09-25 — Gate 4 έκπτωση Ιατρού, LAB POS 2 — LAB PASS μίας πώλησης

- [x] Στις 10:49:31 φυσικό LAB POS 2 / Ιατρός: 1 × ΝΕΡΟ 1,5LT 0,90 € + 1 × EVIAN ΝΕΡΟ 500ML 1,40 € = **2,30 € ΜΕΤΡΗΤΑ**, NON_FISCAL. POS02 **14→15 κινήσεις**, μετρητά **4,70→7,00 €**, σύνολο **5,20→7,50 €**· POS01 **1 κίνηση / 1,00 €** αμετάβλητο. Stock 2270 **−6→−7**, EVIAN **0→−1**, τελευταία πώληση και στα δύο 10:49:31. Audit `3908c17a-ef8a-4e0b-a4bd-5db3a03ce82e` / Sale `7a7a29b8-c1ab-466c-a7b8-48e8cfb3f5cf` και «Ολοκλήρωση πώλησης — Ιατρός» συμφωνούν. **LAB PASS μόνο της συγκεκριμένης ροής.** Τα ατομικό/μαζικό USER PASS και το καλάθι PASS παραμένουν ολοκληρωμένα· δεν επαναλαμβάνονται. Αρχικό before/after κανόνα και μη επιλεγμένα είδη NOT TESTED, πλήρες Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/pos/PASS.md`.

## 2026-09-25 — Gate 5 G5-P06 έξοδο ιδιοκτήτη — περιορισμένο LAB PASS

- [x] PR #1222, CI #3095 πράσινο, merge/deployed `352f636a`. Μία BackOffice δαπάνη ιδιοκτήτη **0,10 €** `G5-P06 VIRTUAL LAB`, ενεργή εγγραφή `#pay_3ffd…` 10:37, εξωτερική πληρωμή: LAB τράπεζα λογιστικό/επιβεβαιωμένο **3,40→3,30 €**, αναμονή και ουρά ιδιοκτήτη **0**, LAB POS 2 **14 κινήσεις/0,10 € έξοδα** ίδια, POS 1 **1/0** ίδιο, ΚΑΤ **22,36 €** ίδιο. Μόνο δαπάνη ιδιοκτήτη χωρίς δεύτερη έγκριση PASS· δαπάνη POS και τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## 2026-09-25 — Gate 3 διαπρομηθευτική απογραφή τεκμηρίων — OCR REPLAY NOT TESTED

- [ ] Συγκεντρώθηκαν 12 διακριτά καταγεγραμμένα παραστατικά διαφορετικών προμηθευτών και τα αντίστοιχα PASS/FAIL· 4 φωτογραφίες εκτός θυρίδας ταυτοποιήθηκαν οπτικά· τα υπόλοιπα πρωτότυπα βρίσκονται στη θυρίδα κατά επιβεβαίωση ιδιοκτήτη και εκκρεμεί read-only καταμέτρηση (ΤΑΛΩΣ μόνο 1/2). Η φωτογραφία ΟΛΥΜΠΟΣ ΤΔΑ02424 **δεν** είναι το αποτυχημένο ΤΔΑ02590. Δεν εκτελέστηκε OCR replay ή νέα POS υποβολή, δεν άλλαξε κώδικας. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-25-gate3-cross-supplier-evidence-inventory.md`.


## 2026-09-25 — Gate 5 G5-P05 κατάθεση με αρχικό PDF — περιορισμένο LAB PASS

- [x] LAB POS 2 κατάθεση 0,10 € με PDF ήδη στην υποβολή, 13→14 κινήσεις· τράπεζα λογιστικό 3,30→3,40 €, `PENDING_REVIEW` με αναμονή 0,10 €, μία έγκριση 10:04 με audit διαφορά 0, επιβεβαιωμένα 3,30→3,40 €, αναμονή 0. POS 1/ΚΑΤ ίδια. Γενικό «Ανανέωση» δεν αναφόρτωνε την ουρά ιδιοκτήτη: διόρθωση σε CI, LAB retest εκκρεμεί. Απόκλιση και τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md` · manual `docs/manual/payments/PASS.md`.

## 2026-09-25 — Gate 4 έκπτωση Ιατρού, φυσικό LAB POS 2 — USER PASS καλαθιού

- [x] Εικόνα 10:28: LAB POS 2 / Ιατρός / 1 × ΝΕΡΟ 1,5LT 1,00→0,90 € και 1 × EVIAN 500ML 1,50→1,40 € με 10% ανά γραμμή. Σύνολο 2,30 €, σύμφωνα με τον προϋπάρχοντα κανόνα στρογγυλοποίησης προς τα πάνω στο επόμενο 0,10 €. Δεν έγινε πληρωμή· βάρδιες POS01/POS02, stock, checkout και Audit NOT TESTED. Τα προηγούμενα USER PASS αποθήκευσης 09:15 και 10:01 ισχύουν, δεν επαναλαμβάνονται. Το εμφανιζόμενο stock −6 για το ΝΕΡΟ 1,5LT προηγείται της μη ολοκληρωμένης συναλλαγής. Συνολικό Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md` · manual `docs/manual/pos/PASS.md`.

## 2026-09-25 — Gate 5 G5-P04 κατάθεση με μεταγενέστερο αποδεικτικό — περιορισμένο LAB PASS

- [x] Μία κατάθεση LAB POS 2 0,10 € στις 09:13, entry `2483961c-ca93-4a98-9bbd-929f16a208b6`, αποδεικτικό 0,10 € στις 09:25 και αυτόματη αντιστοίχιση με διαφορά 0. LAB τράπεζα επιβεβαιωμένα 3,20→3,30 €, αναμονή 0,10→0,00 €, POS 2 κινήσεις 12→13 με πωλήσεις/έξοδα ίδια, POS 1/ΚΑΤ ίδια. Μόνο η συγκεκριμένη ροή PASS· κατάθεση με αρχικό PDF, απόκλιση και τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md` · manual `docs/manual/payments/PASS.md`.

## 2026-09-25 — Gate 3 Coffee Union ΤΔΑ0012183 — LAB FAIL / διερεύνηση παλινδρόμησης

- [ ] Μία νέα υποβολή LAB POS δημιούργησε πρόχειρο 4 γραμμών / 479,87 € αντί των 3 φυσικών γραμμών / 344,53 €: DEL005 1 ΚΙΛΟ → 12 ΚΙΛΑ και διπλή πρώτη σειρά. Διαφορά +135,34 €. Το παλιό προστατευμένο PASS Coffee Union ΔΑ0011467 αφορά **άλλο** παραστατικό. Ακριβές deployed SHA και προέλευση γραμμών του νέου job δεν έχουν εξακριβωθεί· καμία νέα διόρθωση ή δεύτερη υποβολή. **Gate 3 OPEN, LAB FAIL.** `CHECKPOINTS/CHANGES/2026-09-25-gate3-coffee-union-tda0012183-lab-fail.md`.

## 2026-09-25 — Gate 4 Master έκπτωση: ατομική αποθήκευση USER PASS / μαζική επιλογή AWAITING CI + LAB

- [x] Εικόνα 09:15: πράσινο αποτέλεσμα «Αποθηκεύτηκε έκπτωση 10% … σε 1 προϊόν» για ενεργό ΝΕΡΟ 500ML 2269-5201219000118, LAB / Ιατροί. PASS μόνο για απάντηση αποθήκευσης· rule before/after, Audit και POS εφαρμογή NOT TESTED. Δεν επαναλαμβάνεται η ίδια αποθήκευση για τεκμηρίωση.
- [ ] Νέα απαίτηση: ίδια φόρμα «Ένα προϊόν / Μαζικά», checkbox ενεργών προϊόντων, μετρητής/επιβεβαίωση. Κώδικας σε `agent/gate4-master-bulk-audience-20260925`, μαζική χρήση AWAITING CI/MERGE/DEPLOY/LAB. Συνολικό Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`.

## 2026-09-25 — Gate 4 μαζική έκπτωση Master δύο προϊόντων — USER PASS απάντησης / Gate 4 OPEN

- [x] Στις 10:01 LAB / Ιατροί / 10%, επιλεγμένα ΝΕΡΟ 1,5LT `2270-5201005080034` και EVIAN 500ML `00495-3068320055008`: πράσινη απάντηση «Αποθηκεύτηκε έκπτωση 10% σε 2 επιλεγμένα προϊόντα.» PR #1215, CI #3078, exact deploy `558cc179`. PASS μόνο για επιλογή και απάντηση αποθήκευσης. Καμία επανάληψη της ίδιας ενέργειας.
- [ ] Audit πριν/μετά, επίδραση σε μη επιλεγμένα προϊόντα και εφαρμογή στο POS/βάρδιες/stock NOT TESTED· Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`, manual `docs/manual/products-master-catalog/PASS.md`.

## 2026-09-25 — Gate 5 G5-P03 πληρωμή χειριστή από ενεργή βάρδια — LAB PASS περιορισμένου scope

- [x] LAB POS 2 / FRESH DELICACIES / ΒΒ 6529: 0,10 € μετρητά και PDF, μία αναμονή ιδιοκτήτη, μία έγκριση, οφειλή 47,02→46,92 €, έξοδο σωστής βάρδιας 0,00→0,10 €, εικονική τράπεζα 3,20 € και LAB POS 1 αμετάβλητα, audit 08:46 με ορθό παραστατικό. Ξεχωριστή πώληση 0,90 € εξηγεί τις πωλήσεις μετρητών POS 2 3,80→4,70 €· 10→12 κινήσεις συνολικά. Το προηγούμενο OPEN για πληρωμή χειριστή στο G5-P02 έχει κλείσει μόνο για αυτό το σενάριο. **Συνολικό Gate 5 OPEN.** Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md` · manual `docs/manual/payments/PASS.md` · roadmap/PDF ενημερωμένα.
## 2026-09-25 — Gate 3 ευρύς πίνακας πρόχειρου ΡΗΓΑΣ — USER/LAB PASS διάταξης

- [x] Στις 09:11 ώρα Ελλάδας ο ιδιοκτήτης επιβεβαίωσε «είναι οκ» μετά την οπτική δοκιμή του ίδιου πρόχειρου ΡΗΓΑΣ ΤΔΑ0086532 με τη διάταξη PR #1210 (merge `e9de20e98675f2fc36c56bff8a024bf0e70669b8`, CI #3069 PASS). **PASS μόνο για αναγνωσιμότητα των στηλών και μέγεθος παραθύρου στο δικό του desktop.** Δεν επανυποβλήθηκε τιμολόγιο, δεν έγινε οριστικοποίηση ή πληρωμή. Η ακριβής Render revision/στιγμιότυπο deploy δεν προκύπτει από το μήνυμα, άρα δεν επιβεβαιώνεται χωριστά. Οι προηγούμενες διατάξεις PR #1207 και #1208 είναι LAB FAIL χρηστικότητας και δεν επαναφέρονται. Προϊόντα, μετατροπή `ΠΑΚ`→`τμχ` και διαπρομηθευτική ανάγνωση Gate 3 μένουν OPEN. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate3-readable-wide-review-awaiting-lab.md` · manual: `docs/manual/invoices/PASS.md`.

## 2026-09-25 — Gate 3 πλήρης οθόνη για έλεγχο πίνακα ΡΗΓΑΣ — AWAITING LAB

- [ ] Ο ιδιοκτήτης δοκίμασε στο LAB το PR #1207 και δήλωσε **FAIL χρηστικότητας**: οι κάρτες κρύβουν τη σύγκριση των ίδιων πεδίων μεταξύ γραμμών (εικόνα 25/09 05:39). Επαναφέρουμε τις 21 στήλες ως ευθυγραμμισμένο πίνακα, ανοίγουμε το παράθυρο στο πλήρες πλάτος/ύψος και κρατάμε μόνο μία οριζόντια κύλιση μέσα στον πίνακα αν η οθόνη είναι στενή. Αριθμητική ανάγνωση ΡΗΓΑΣ 3 γραμμών / 39,83 € δεν αλλάζει. Μετά CI/merge/deploy απαιτείται οπτικός έλεγχος στο ίδιο πρόχειρο, χωρίς νέο POS upload ή οριστικοποίηση. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate3-fullscreen-review-table-awaiting-lab.md`.

## 2026-09-25 — Gate 3 πρόχειρο χωρίς οριζόντια κύλιση — AWAITING LAB

- [ ] Ο ιδιοκτήτης έδειξε δύο οριζόντιες μπάρες στο πρόχειρο ΡΗΓΑΣ. Περιορισμένη αλλαγή μόνο της προβολής ήδη ανοιγμένης παραγγελίας: κάθε είδος σε κάρτα με ετικέτες και αναδίπλωση πεδίων ανά πλάτος, χωρίς οριζόντιο overflow του πίνακα/παραθύρου. Οικονομικά, OCR, υπόλοιπο και αποθήκη αμετάβλητα. Τοπικό frontend build PASS· μετά CI/merge/exact deploy ελέγχεται το **ίδιο** πρόχειρο με άνοιγμα/ανανέωση (μόνο διαγνωστικό, όχι νέα POS αποδοχή). Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate3-purchase-draft-no-horizontal-scroll-awaiting-lab.md`.

## 2026-09-25 — Gate 3 ΡΗΓΑΣ ΤΔΑ0086532 — περιορισμένο LAB PASS ανάγνωσης / Gate 3 OPEN

- [x] Νέα μία υποβολή από LAB POS 2: ΡΗΓΑΣ ΔΙΑΝΟΜΕΣ ΑΕ ΤΔΑ0086532. Το αυτόματο BackOffice πρόχειρο συμφωνεί με το έντυπο: 3 φυσικές γραμμές (1935/1936/2261), 2+2+3, αρχικές 4,239/4,239/5,052 €, ΦΠΑ 24%, καθαρό 32,12 €, τελικό 39,83 €, διαφορά 0,00 €. Δεν επέλεξε το «νέο υπόλοιπο» 479,97 €. **PASS μόνο για ανάγνωση αυτού του νέου τιμολογίου**. Δεν επαναλαμβάνεται η υποβολή του.
- [ ] Σύνδεση με προϊόντα, μονάδα `ΠΑΚ`→`τμχ`, ταυτότητες job/draft, stock, payment και βάρδιες δεν επιβεβαιώθηκαν. Άλλοι προμηθευτές με παλιότερα FAIL μένουν ανοικτοί· προηγούμενα γενικά `AWAITING LAB` δεν αφορούν πλέον την οικονομική ανάγνωση αυτού του ΡΗΓΑΣ, αλλά δεν κλείνουν τη διαπρομηθευτική αποδοχή. Χωρίς οριστικοποίηση/πληρωμή. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate3-rigas-tda0086532-scoped-lab-pass.md` · manual: `docs/manual/invoices/PASS.md`.

## 2026-09-25 — Gate 4 έκπτωση πολλών τεμαχίων — διόρθωση ASSIGNED / LAB PENDING

- [x] **Νεότερο PASS καλαθιού Issue #1202, 25/09 14:34:** PR #1206 συγχωνευμένο και Render μετά `1615690e`. Φυσικό LAB POS 2 / «Ιατρός», 2 × ΝΕΡΟ 500ML / SKU 2269, 0,50 € ανά τεμάχιο, 10%: ορατό ποσό γραμμής και κάτω σύνολο **0,90 €**. POS1 1 / 0,70 € και POS2 16 / 7,50 € πριν/μετά αμετάβλητα. Το συγκεκριμένο σκέλος οθόνης ολοκληρώθηκε και δεν επαναλαμβάνεται· checkout, ρέστα με εισπραχθέν ποσό, άλλη ποσότητα/κατάστημα και συνολικό Gate 4 OPEN. Stock/Audit δεν μετρήθηκαν. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate4-discount-quantity-source-finding.md`.

## 2026-09-25 — Gate 5 G5-P02 μερική πληρωμή ιδιοκτήτη / εταιρική κάρτα — LAB PASS περιορισμένου scope

- [x] Μία εικονική πληρωμή 0,10 € ΔΑ0011467 σε deployed `56dd04d3`: οφειλή 1.380,34→1.380,24 €, επιβεβαιωμένο τραπεζικό 3,30→3,20 €, αναμονή και ουρές 0, POS01/POS02 αμετάβλητα. Στο ακριβές deployed `1c4c53cf`, το ίδιο Audit 25/09 00:56 εμφανίζει «ΔΑ0011467: 0,10 €», χωρίς δεύτερη πληρωμή. PASS μόνο για τη μερική πληρωμή ιδιοκτήτη/εταιρική κάρτα. Πληρωμή χειριστή POS και τα υπόλοιπα κριτήρια Gate 5 OPEN. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md` · manual: `docs/manual/payments/PASS.md`.

## 2026-09-25 — Gate 3 γενικό σύνολο FAST από τυπωμένη ανάλυση ΦΠΑ — DEPLOYED / AWAITING LAB

- [ ] PANINI 13461 είχε πρώτη επιλογή 70,36 € από απόδειξη είσπραξης αντί πληρωτέου τιμολογίου 75,60 €. PR #1199 / CI PASS / Render `6d17c86400da3120840126c1c6ec0bfee81fd8b7`. Ο αυστηρός υπάρχων κανόνας ΜΑΝΤΖΙΛΑΣ για τυπωμένο `ΣΥΝΟΛΑ` με καθαρό + ΦΠΑ = μικτό επεκτείνεται στην αρχική POS FAST ανάγνωση κάθε προμηθευτή, μόνο όταν η τριπλή αριθμητική απόδειξη βρίσκεται στην πρωτότυπη Azure μεταγραφή· διαφορετικά μένει η παλιά διαδρομή. Συνθετικό regression για ξεχωριστή απόδειξη, προστασία παλιού ΜΑΝΤΖΙΛΑΣ· δεν είναι γνήσιο LAB PASS. Δεν τροποποιεί τα υπάρχοντα πρόχειρα ή το λανθασμένο PANINI. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate3-generic-fast-vat-footer-awaiting-lab.md`.

## 2026-09-25 — Gate 3 διαπρομηθευτική ανάγνωση POS — DEPLOYED / AWAITING LAB

- [ ] Στο LAB μετρήθηκαν 46 OCR jobs (13 αποτυχημένα, 19 σε αναμονή, 10 AI ολοκληρωμένα, 4 τοπικά). Οι ετικέτες δεν αποδεικνύουν σωστή ανάγνωση. Το κουμπί χειροκίνητης διόρθωσης ακυρώνεται κατόπιν εντολής ιδιοκτήτη. PR #1194 / CI PASS / Render `f93ed98b2d137896b3cdc813c751f5536314b092`. Κοινή αλλαγή στην πρώτη ροή POS: ανεξάρτητη πλήρης ανάγνωση πρωτότυπης εικόνας **πριν** συγχωνευτούν δεύτερος πίνακας/Azure, αποδοχή μόνο μετά από όλες τις γραμμές, αριθμητική, ΦΠΑ και σύνολο. Παλαιότερα LAB FAIL ΜΟΥΧΑΛΗΣ, ΟΛΥΜΠΟΣ, ΠΡΑΤΤΕΪΝ, Fresh Delicacies, PANINI παραμένουν FAIL. Επόμενη αποδοχή μόνο σε νέα γνήσια POS υποβολή· καμία έγκριση/πληρωμή/απόθεμα. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate3-cross-supplier-source-before-merge.md`.

## 2026-09-25 — Gate 5 G5-P02 ιδιοκτήτης — λογιστικά σωστό, audit label RETEST

- [ ] Στο deployed `56dd04d3` η νέα εικονική πληρωμή ιδιοκτήτη 0,10 € με εταιρική κάρτα μείωσε το ΔΑ0011467 1.380,34→1.380,24 € και το επιβεβαιωμένο τραπεζικό 3,30→3,20 €, χωρίς αναμονή ή ουρά· LAB-POS-01 και LAB-POS-02 αμετάβλητα. Audit 25/09 00:56 υπάρχει, αλλά η προβολή δείχνει UUID αντί αριθμού παραστατικού. Διόρθωση προς CI/merge και επανάγνωση ίδιας εγγραφής χωρίς νέα πληρωμή. Gate 5 συνολικά ανοικτό. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## 2026-09-25 — Gate 3 ΜΟΥΧΑΛΗΣ 01/129707 — LAB FAIL / διόρθωση AWAITING LAB

- [ ] Νέο πραγματικό POS τιμολόγιο: έντυπο 14 σειρές / 490 τεμάχια / 1.791,63 € / ΦΠΑ 0%, ενώ το αυτόματο πρόχειρο είχε 26 σειρές και 5.292,24 €. Το πρόχειρο δεν οριστικοποιήθηκε. Ο πλήρης έλεγχος έπαιρνε ως οδηγό ήδη διπλασιασμένες υποψήφιες γραμμές. Η κοινή διόρθωση επαναδιαβάζει την πρωτότυπη εικόνα χωρίς αυτές και δέχεται νέο πίνακα μόνο με πλήρη οικονομική επαλήθευση. Τοπικά 1.456 PASS, 1 SKIP και build PASS· πραγματική επανάγνωση μετά το deploy εκκρεμεί. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-image-only-verifier-mouchlakis-awaiting-lab.md`.

## 2026-09-25 — Gate 4 αντίγραφο NON_FISCAL — LAB PASS συγκεκριμένης πώλησης

- [x] Υπάρχουσα πώληση `58b6d371-fa70-40ab-89cc-c01b3262898a` στο LAB POS 2, 1 × ΝΕΡΟ 500ML 0,50 € ΜΕΤΡΗΤΑ. Η προεπισκόπηση έδειξε ένα φύλλο με NON_FISCAL και προειδοποίηση, ο ιδιοκτήτης επιβεβαίωσε «ΒΓΗΚΕ» για το φυσικό χαρτί στις 25/09 περίπου 07:59 ώρα Ελλάδας, και η ίδια ενέργεια φάνηκε στο κεντρικό Audit 25/09 00:55 με ίδιο sale ID, LAB POS 2, 0,00 €. POS02 10 κινήσεις / 3,80 € μετρητά / 4,30 € σύνολο, POS01 1 / 1,00 €, SKU 2269 −57 και τελευταία κίνηση 23:22:35· αμφότερες βάρδιες ανοικτές. Η φυσική έξοδος πιστοποιείται από δήλωση ιδιοκτήτη, χωρίς φωτογραφία χαρτιού. Το συγκεκριμένο σκέλος ολοκληρώθηκε και δεν επαναλαμβάνεται. Το συνολικό Gate 4 παραμένει PENDING. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md` · manual: `docs/manual/pos/PASS.md`.

## 2026-09-25 — Gate 5 πληρωμή ιδιοκτήτη χωρίς δεύτερη έγκριση — LAB FAIL / διόρθωση AWAITING LAB

- [ ] Το G5-P01 στο εικονικό LAB: μία πληρωμή ιδιοκτήτη 0,10 € για ΔΑ0011467 πήγε λανθασμένα σε ουρά έγκρισης, ενώ ο ιδιοκτήτης ορίζει έγκριση μόνο για πληρωμή χειριστή μπροστά στο POS. Με χειροκίνητη επιβεβαίωση: τραπεζικό ταμείο 3,40→3,30 € επιβεβαιωμένο, εκκρεμές −0,10→0,00 €, ουρά 1→0, audit 25/09 00:13. Το συνολικό Gate 5 παραμένει ανοικτό.
- [ ] Περιορισμένη διόρθωση PR #1187: OWNER/SUPER_ADMIN εκτός STORE_OPERATOR επιβεβαιώνει κατά την καταχώριση, με audit και τραπεζική κίνηση· POS operator μένει για έγκριση. Μετά το CI/merge/deploy απαιτούνται νέες μετρημένες LAB πράξεις και για τους δύο ρόλους. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## 2026-09-24 — Δεσμευτικός κανόνας ιδιοκτήτη για όλες τις σελίδες

- [x] Κάθε ολοκληρωμένο αποτέλεσμα, ακόμη και περιορισμένο PASS, καταγράφεται αμέσως κεντρικά με checkpoint, ενεργή λίστα και τις αντίστοιχες ενημερώσεις manual/roadmap/PDF όπου ισχύουν. Οι άλλες σελίδες διαβάζουν το νεότερο `main` πριν προτείνουν νέα δοκιμή. Ανοικτό PR δεν είναι ακόμη κεντρική ενημέρωση. Βλ. `AGENTS.md` § «Υποχρεωτική άμεση κεντρική καταγραφή κάθε αποτελέσματος». Ο ιδιοκτήτης προειδοποίησε ρητά για αίτημα επιστροφής χρημάτων λόγω χρόνου/καθυστέρησης και άμεση αναφορά για διαφυγόντα κέρδη αν ξαναπαραλειφθεί η καταγραφή.
- [x] Gate 4: η φυσική πώληση LAB POS 2 στις 23:22:35, 0,50 € μετρητά, έχει ήδη διασταυρωθεί: POS02 9→10 κινήσεις, μετρητά 3,30→3,80 €, σύνολο 3,80→4,30 €, POS01 αμετάβλητο, SKU 2269 −56→−57. Η δοκιμή ρέστων έχει επίσης ήδη γίνει κατά δήλωση ιδιοκτήτη· το αριθμητικό της τεκμήριο δεν βρίσκεται ακόμη στο checkpoint, χωρίς αυτοτελές τεκμηριωμένο PASS. **Καμία επανάληψη πώλησης ή ρέστων για συμπλήρωση αρχείου.** Συνολικό Gate 4 PENDING. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md`.

## 2026-09-24 — Gate 3 κουμπί AI, πραγματικό COSMOS LAB FAIL διόρθωσης

- [x] Μετά το PR #1180 / Render `62012465aa8ae2f0f26703ca5b56e078b5724bbe`, ένα πάτημα «Διόρθωση προσχεδίου με AI» στο προϋπάρχον failed job COSMOS 108.950 (`76c6ae10-8d94-4fd7-bced-f7441d9f73f9`) επέστρεψε POS_FAILED: δεν επαληθεύτηκαν όλες οι τυπωμένες γραμμές και το σύνολο. Πρόχειρο πριν/μετά **26 είδη, 222,25 € καθαρή / 240,43 € μικτή**, έντυπο 195,78 €· καμία αυτόματη διόρθωση. LAB PASS μόνο για ασφαλή διατήρηση του προσχεδίου, LAB FAIL για επίτευξη διόρθωσης. POS01 1 κίνηση / 1,00 € και POS02 10 κινήσεις / 4,30 € πριν/μετά. Stock/audit NOT TESTED. Καμία οριστικοποίηση ή πληρωμή. Gate 3 OPEN· απαιτείται νέα υποβολή POS και πλήρης αντιπαραβολή με πρωτότυπο. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate3-ai-correct-draft-button-awaiting-lab.md`.

## 2026-09-24 — Gate 3 κουμπί διόρθωσης AI — AWAITING LAB

- [ ] Σε αποτυχημένη ανάγνωση POS με ενεργό προσχέδιο, το κουμπί «Διόρθωση προσχεδίου με AI» επαναδιαβάζει το πρωτότυπο και αντικαθιστά γραμμές μόνο μετά από πλήρη απόδειξη γραμμών, ΦΠΑ και τελικού ποσού. Η τοπική δοκιμή για 2621650 δέχεται 16 γραμμές / 356 τεμάχια / 1.359,66 € και απορρίπτει δύο γνωστές μετατοπίσεις. Αναμένονται CI, deploy και πραγματικό νέο LAB τιμολόγιο με πριν/μετά. Δεν έγινε πληρωμή, stock ή οριστικοποίηση. Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate3-ai-correct-draft-button-awaiting-lab.md`.
## 2026-09-24 — Gate 4 νέο VOID μετρητών — LAB PASS ποσού, stock και ιστορικού

- [x] Νέα διασταύρωση Audit και κινήσεων μετρητών στις 22:42:01: `CANCEL` −0,50 € και `POS ΑΚΥΡΩΣΗ` −0,50 € στην ίδια βάρδια LAB POS 2· η αρχική `POS πώληση` στις 22:38:39 είναι +0,50 €. Sale ID prefixes αντίστροφης `782d4a87…`, αρχικής `dbb97d03…`. PASS αντιστοίχισης ώρας/ποσού/βάρδιας σε δύο προβολές. Το ρητό `relatedSaleId` δεν φαίνεται ακόμη, NOT TESTED· χωρίς νέα κίνηση.
- [x] Από τη νέα πώληση POS02 στις 22:38:39, ένα VOID 0,50 € ΜΕΤΡΗΤΑ: POS02 8→9 κινήσεις, μετρητά 3,80→3,30 €, σύνολο 4,30→3,80 €, POS01 1 / 1,00 € αμετάβλητο, ΝΕΡΟ 500ML SKU 2269 −57→−56 και τελευταία κίνηση 22:42:01. Το φυσικό ιστορικό έδειξε **μία** «ΑΚΥΡΩΣΗ / VOID» −0,50 € ΜΕΤΡΗΤΑ στις 22:42:01. Ξεχωριστό Audit event στις 22:42:01 με ID `0fa74ea2…`, `CANCEL`, −0,50 € και LAB POS 2: PASS παρουσίας. Η σύνδεση `relatedSaleId` με την πώληση 22:38:39 δεν φαίνεται στο στιγμιότυπο και παραμένει NOT TESTED· χωρίς δεύτερο VOID. Συνολικό Gate 4 PENDING.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md` · Manual: `docs/manual/pos/PASS.md`.

## 2026-09-24 — Gate 4 νέα POS02 πώληση μετρητών / ένα stock decrement — LAB PASS

- [x] Νέα φυσική πώληση 22:38:39, 1 × ΝΕΡΟ 500ML 0,50 € ΜΕΤΡΗΤΑ: POS02 7→8 κινήσεις / μετρητά 3,30→3,80 € / σύνολο 3,80→4,30 €, POS01 1→1 / 1,00→1,00 €. Με δεύτερη ανανέωση Αρχείου ειδών SKU 2269 −56→−57, τελευταία κίνηση 21:46:05→22:38:39. Η πρώτη ανάγνωση αποθήκης ήταν stale. PASS μόνο αυτής της πώλησης· ξεχωριστό VOID με νέα προμέτρηση περιμένει αποτέλεσμα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md` · Manual: `docs/manual/pos/PASS.md`.

## 2026-09-24 — Gate 4 ακύρωση καλαθιού πριν πληρωμή — πραγματικό LAB PASS

- [x] Φυσικό LAB-POS-02, 1 × ΝΕΡΟ 500ML 0,50 €, «ΑΚΥΡΩΣΗ» και επιβεβαίωση χωρίς πληρωμή. Πριν/μετά: καλάθι 0,50→0,00 €· POS02 7→7 κινήσεις / 3,80→3,80 €, POS01 1→1 / 1,00→1,00 €, SKU 2269 −56→−56 και τελευταία κίνηση 21:46:05 αμετάβλητη. Το UI επιβεβαίωσε τη διαγραφή με αιτιολογία. Audit εγγραφή δεν έχει διαβαστεί· συνολικό Gate 4 PENDING.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md` · Manual: `docs/manual/pos/PASS.md`.

## 2026-09-24 — Κοινός κανόνας κάθε μελλοντικής LAB δοκιμής: πριν και μετά

- [x] **ΔΙΟΡΘΩΣΗ GATE 5 ΑΠΟ ΙΔΙΟΚΤΗΤΗ:** καμία σελίδα δεν ολοκλήρωσε Gate 5. Το προηγούμενο `PASS` και το σχετικό manual ήταν ατεκμηρίωτα· επίσημη κατάσταση **ΑΝΑΤΕΘΗΚΕ `agent/gate5-payments-reconciliation` / NOT TESTED** στις 24/09, με πλήρη πριν/μετά μετά το Gate 4. Το checkpoint 23/09 αντικαταστάθηκε. Gate 1 και Gate 2 κρατούν το χωριστό τους PASS.

- [x] Για κάθε νέα κίνηση, ανανεώνουμε και καταγράφουμε **πριν** στο checkpoint βάρδια/Terminal ID, πλήθος κινήσεων, μετρητά, κάρτα, IRIS, σύνολο, stock και τελευταία ώρα κίνησης των εμπλεκόμενων ειδών, καθώς και το άλλο POS ως μάρτυρα. **Μετά από μία ταυτοποιημένη ενέργεια** ανανεώνουμε τις ίδιες πηγές και καταγράφουμε τις ακριβείς διαφορές και το Audit. Απόν πριν/μετά σημαίνει `NOT TESTED` για το συγκεκριμένο οικονομικό/αποθεματικό αποτέλεσμα. Ισχύει για όλες τις σελίδες και όλα τα Gate.
- [x] Εδώ και τώρα, ανανεωμένη αρχική μέτρηση επόμενης δοκιμής: `LAB-POS-01` 1 κίνηση, μετρητά 0,50 €, κάρτα 0,50 €, IRIS 0,00 €, σύνολο 1,00 €· `LAB-POS-02` 7 κινήσεις, μετρητά 3,30 €, κάρτες/IRIS 0,50 €, σύνολο 3,80 €. SKU 2269 ΝΕΡΟ 500ML −56, τελευταία κίνηση 24/09 21:46:05. Πριν από οποιαδήποτε νέα συναλλαγή ανανεώνουμε **ξανά** επειδή το LAB μπορεί να αλλάξει από άλλη συσκευή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md`.

## 2026-09-24 — Gate 4 VOID IRIS / ιστορικό βάρδιας — LAB PASS προβολής

- [x] Φυσικό LAB-POS-02: η πώληση 1 × ΝΕΡΟ 500ML, IRIS 0,50 € στις 20:54 ακυρώθηκε από το ξεχωριστό κουμπί «ΑΚΥΡΩΣΗ / VOID» και επιβεβαίωση OK στις 21:46. Backoffice: POS02 6→7 κινήσεις, 4,30→3,80 €, κάρτες/IRIS 1,00→0,50 €, μετρητά 3,30 €· POS01 αμετάβλητο 1,00 €. Δεν έγινε δεύτερη ακύρωση.
- [x] PR #1171 / CI #2974 PASS / ακριβές Render `cdcc8b71db0059e5844d8078cce9272b0914182e`: νέα εικόνα του ίδιου `LAB-POS-02` εμφανίζει **μία** εγγραφή «ΑΚΥΡΩΣΗ / VOID», −0,50 €, IRIS −0,50 €, 1 × ΝΕΡΟ 500ML στις 21:46. Η προγενέστερη συμφωνία POS02 4,30→3,80 € και απομόνωση POS01 1,00 € διατηρείται. Το παλιό LAB FAIL ετικέτας έχει κλείσει· καμία δεύτερη ακύρωση.
- [ ] Stock SKU 2269 και audit της ίδιας ακύρωσης δεν έχουν τεκμηριωμένο πριν/μετά, ούτε έχουν επανελεγχθεί όλες οι παλιές επιστροφές· αυτά και το συνολικό Gate 4 παραμένουν PENDING.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-void-iris-history-awaiting-lab.md`.

## 2026-09-24 — Gate 4 μικτή πληρωμή / Κέντρο Βαρδιών — LAB PASS

- [x] Στο ακριβές Render `bbeb730c931218510a23f7c80074a79f943e8cfc` το LAB-POS-01 εμφανίζει την ήδη καταχωρισμένη μία μικτή πώληση: μετρητά 0,50 €, κάρτα 0,50 €, IRIS 0,00 €, σύνολο 1,00 €, μία κίνηση. Το LAB-POS-02 μένει 3,30 € μετρητά, 1,00 € κάρτες/IRIS, 4,30 € σύνολο, έξι συναλλαγές. Χωρίς νέα πώληση ή stock posting. Το συγκεκριμένο σκέλος αφαιρέθηκε από τα pending· Gate 4 συνολικά PENDING.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-mixed-payment-shift-projection-awaiting-lab.md` · Manual: `docs/manual/pos/PASS.md`.

## Ιστορικό Gate 4 — μικτή πληρωμή / Κέντρο Βαρδιών — παλιό LAB FAIL, αντικαταστάθηκε από PASS

- Στο LAB-POS-01 μία πώληση 1,00 € με 0,50 € μετρητά + 0,50 € κάρτα εμφανίστηκε στο Backoffice ως 1,00 € μετρητά / 0,00 € κάρτα. Το κοινό stock μειώθηκε μόνο μία φορά. Διορθώθηκε τοπικά η κατανομή προβολής με βάση τα αποθηκευμένα Payment ποσά.
- [x] CI #2968 PASS, PR #1168 merged, Render `bbeb730` επιβεβαιωμένο· η επανάγνωση ολοκληρώθηκε με το παραπάνω LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-mixed-payment-shift-projection-awaiting-lab.md`.

## 2026-09-24 — PEPSICO 38 4687 003 04817 — LAB FAIL / διαπρομηθευτική εργασία

- [x] Η προσωρινή απόπειρα αφαίρεσης ανεπιβεβαίωτης σειράς μόνο από παρόμοια περιγραφή και αλλοιωμένο κωδικό αποσύρθηκε: τέτοια στοιχεία δεν αποδεικνύουν ότι δεν υπάρχει δεύτερη φυσική σειρά. Καμία αλλαγή στη συγχώνευση OCR.
- [x] Τοπικός ελεγκτής πλήρους πίνακα πλέον δέχεται παραστατικά με συντελεστή ΦΠΑ ανά γραμμή αλλά ποσά ΦΠΑ μόνο στο υποσέλιδο: υπολογίζει ποσά ανά γραμμή και απαιτεί συμφωνία με όλη την τυπωμένη ομάδα ΦΠΑ και το ανεξάρτητο συνολικό ποσό. Αποκλίσεις ή ελλιπείς σειρές απορρίπτονται. Επιπλέον, μια αριθμητικά ασυνεπής δομημένη σειρά διατηρεί τα OCR στοιχεία αντί να αντικαθίσταται σιωπηρά από ελεύθερη ερμηνεία αριθμών· επισημαίνεται για έλεγχο. Τοπικά μόνο, χωρίς CI/deploy/LAB.
- [ ] Το πρώτο OCR είχε ήδη λανθασμένες ποσότητες. Οι παραπάνω αλλαγές δεν πιστοποιούν PEPSICO ούτε διορθώνουν το υπάρχον πρόχειρο των 28 γραμμών. Gate 3 παραμένει LAB FAIL / OPEN.

- [x] Έντυπο: 51 τεμάχια, αρχική αξία 64,14 €, έκπτωση 9,62 €, καθαρή 54,52 €, ΦΠΑ 7,11 €, πληρωτέο 61,63 €. Πρόχειρο BackOffice: 28 γραμμές, καθαρή 37,91 €, μικτή 40,08 €, διαφορά 21,55 €. Σε τελικές γραμμές επαναλαμβάνονται κωδικοί με ΦΠΑ 0%. Καμία οριστικοποίηση ή κίνηση αποθήκης επιβεβαιωμένη.
- [x] Ο δεύτερος πλήρης έλεγχος απέτυχε με μήνυμα «28 γραμμές, διαφορά 28,12 €» και διατήρησε το πρόχειρο. Στον κώδικα `mergeRecoveredLines` μπορεί να προσθέσει μη ταυτισμένη γραμμή από δεύτερη ανάγνωση/Azure· οι εξειδικευμένες αφαιρέσεις επαναλήψεων δεν καλύπτουν κάθε προμηθευτή. Αυτό είναι πιθανό σημείο παραγωγής διπλών γραμμών, όχι ακόμη αποδεδειγμένη αιτία για το συγκεκριμένο job.
- [x] Τοπική αναπαραγωγή του σημερινού `mergeRecoveredLines`: ίδιο είδος με OCR κωδικό `340058991` έναντι `340058891` και διαφορετική `sourceRow` κρατήθηκε δύο φορές (μία με ΦΠΑ 13%, μία με 0%). Η αναπαραγωγή χρησιμοποιεί συνθετικά μεταδεδομένα για το ορατό μοτίβο και δεν αποδεικνύει την προέλευση των γραμμών του πραγματικού job. Οι 47 σχετικές υπάρχουσες δοκιμές πέρασαν, άρα δεν καλύπτουν αυτή την απόκλιση.
- [x] Η αρχική προσπάθεια σύνδεσης Platform Super Admin απορρίφθηκε από αυτόματη έγκριση. Μετά τη ρητή έγκριση του χρήστη έγινε ασφαλής σύνδεση με 2FA σε ξεχωριστή καρτέλα, χωρίς παράκαμψη ή μεταβολή παραστατικού.
- [x] Μετά από ρητή έγκριση χρήστη, αναγνώστηκαν σε ξεχωριστή καρτέλα τα πραγματικά διαγνωστικά job `cd0464e5-5008-4039-a9c5-2cae65848d33` (μόνο ανάγνωση). `provider` 22 γραμμές, αρχικό άθροισμα 68,76 €· `tableRecheckRecovered` 22 και `azurePageRecoveryRecovered` 23· `original/reread` 29 γραμμές, άθροισμα μετά recovery 98,70 €, αναμενόμενο 61,63 €. Οι γραμμές 23–28 φέρουν `sourceFileIndex:0`, `sourcePage:1`, ΦΠΑ 0%, και η 29η έχει κενό κωδικό/ποσότητα 0. Άρα η δημιουργία επιπλέον γραμμών συμβαίνει μέσα στην πλήρη ανάγνωση/συγχώνευση πριν από το BackOffice· δεν είναι απλώς σφάλμα προβολής. `discountMathVerification` accepted 0, rejectedMath 1. Το BackOffice προβάλλει 28 γραμμές / 40,08 €: χωριστή μεταβολή οικονομικών μετά την OCR αποθήκευση. Καμία ενέργεια οριστικοποίησης.
- [x] Σύγκριση τριών αποθηκευμένων στιγμιότυπων: πάροχος 22 γραμμές/54 τεμάχια, αξία προ εκπτώσεων 68,76 €, καθαρή 58,45 €· πρώτη συγχωνευμένη ανάγνωση 29 γραμμές/65 τεμάχια, καθαρή 79,25 €· επανάληψη 29 γραμμές/65 τεμάχια, καθαρή 83,09 €. Έντυπο 51 τεμάχια, αξία προ έκπτωσης 64,14 €, καθαρή 54,52 €. Ο αρχικός πάροχος έχει ήδη ολισθήσεις ποσοτήτων μεταξύ γειτονικών σειρών και δεν αποτελεί ασφαλή αντικατάσταση του πρόχειρου. Οι 47 σχετικές τοπικές δοκιμές περνούν, αλλά δεν περιλαμβάνουν αυτό το πραγματικό διαπρομηθευτικό μοτίβο.
- [ ] Η γενική διόρθωση πρέπει να αποκλείει μη επαληθευμένες επιπλέον φυσικές γραμμές και να μη δημοσιεύει μετασχηματισμένα οικονομικά χωρίς επαλήθευση πλήρους τυπωμένου πίνακα, ΦΠΑ και συνολικής αξίας· να διακριθεί από νόμιμες ίδιες επαναλαμβανόμενες γραμμές. Το PEPSICO δεν έχει διορθωθεί.
- [ ] Να συγκριθούν τα αποθηκευμένα `posReadingEvidence.original/provider/reread` του συγκεκριμένου job με τους τυπωμένους κωδικούς και ποσά ανά φυσική σειρά· έπειτα να σχεδιαστεί επαλήθευση ολόκληρου πίνακα και εκπτώσεων με δοκιμές πολλών προμηθευτών. Gate 3 OPEN. Δεν έγινε commit, push ή merge για αυτή τη διάγνωση.

## 2026-09-24 — ΣΤΕΡΓΙΟΥ πιστωτικό 1004/2957 — LAB PASS συγκεκριμένου παραστατικού

- [x] Στο LAB POS 2 επιλέχθηκε ρητά πιστωτικό, ανέβηκε πρόχειρο με 3 γραμμές × 1 τεμάχιο, καθαρή 3,78 € και τελική 4,27 €· ο οικονομικός έλεγχος συμφώνησε. Η παραλαβή δεν άλλαξε αποθήκη και δεν δημιούργησε πληρωμή POS.
- [x] Μετά την οριστικοποίηση, η προβολή γραμμών δείχνει stock −1 για καθένα από τα 3 προϊόντα. Η καρτέλα προμηθευτή εμφανίζει −4,27 € και η λογιστική καρτέλα καταχωρεί `CREDIT_NOTE` 1004/2957, κίνηση −4,27 € και υπόλοιπο −4,27 €. Η αναφορά κινήσεων δείχνει 3 επιστροφές σε προμηθευτή.
- [ ] Gate 3 συνολικά OPEN. Το ξεχωριστό ΔΕΛΤΑ 9946 εξακολουθεί να έχει OCR FAIL ποσότητας και αξίας· ΟΧΟΝΟΣ TAA0034921 και ΟΛΥΜΠΟΣ ΤΔΑ02590 απαιτούν νέα επαλήθευση γραμμών. Το PASS αυτού του πιστωτικού δεν πιστοποιεί αυτά τα παραστατικά.

## 2026-09-24 — POS πιστωτικό ως επιστροφή — IN PROGRESS / LAB PENDING

- [x] Μετά το ασφαλές μπλοκάρισμα #1159, ο χρήστης διευκρίνισε ότι το POS πρέπει να παραλαμβάνει και πιστωτικά. Επιλογή συμψηφισμού οφειλής χωρίς είσπραξη μετρητών. Υλοποιείται τύπος `CREDIT_NOTE` από POS έως BackOffice, χωρίς πληρωμή, με αρνητικό πρόσημο στην καρτέλα προμηθευτή και αρνητική κίνηση stock μόνο κατά την ελεγχόμενη οριστικοποίηση.
- [ ] Το παλιό λανθασμένο πρόχειρο 9946 παραμένει **μη εγκεκριμένο**. Το σφάλμα OCR ποσότητας 2,46 αντί 1 δεν θεωρείται λυμένο. Απαιτούνται πράσινο CI, ακριβές deploy και νέο γνήσιο LAB πιστωτικό με έλεγχο ποσότητας, εκπτώσεων, συνόλου, αποθήκης, υπολοίπου και μηδενικής κίνησης ταμείου.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-credit-note-intake-awaiting-lab.md`.

## 2026-09-24 — Πιστωτικά στη γρήγορη ροή POS — LOCAL PASS / AWAITING CI & LAB

- [x] Αιτία 9946: το POS μπορούσε να ανοίξει αγορά/πληρωμή πριν διακρίνει το πιστωτικό. Περιορισμένη ασφαλής αλλαγή: ρητή επιλογή «Τιμολόγιο αγοράς»/«Πιστωτικό» μετά το FAST, επισήμανση από Azure/OpenAI, κανένα submit πιστωτικού και διακομιστής που απορρίπτει πιστωτικό/άγνωστο τύπο πριν από δημιουργία job/πρόχειρου. Η υφιστάμενη κανονική αγορά διατηρείται.
- [ ] CI/merge/exact Render και γνήσια LAB δοκιμή εκκρεμούν. Το πιστωτικό **δεν καταχωρίζεται αυτομάτως από POS**: χρειάζεται BackOffice ροή πιστωτικού. Η λανθασμένη ποσότητα 2,46 του 9946 παραμένει χωριστό OCR FAIL. Δεν εγκρίνεται το υπάρχον πρόχειρο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-credit-note-fast-guard-awaiting-lab.md`.

## 2026-09-24 — ΔΕΛΤΑ/ΦΙΛΩΝ 9946 — γνήσιο LAB FAIL πιστωτικού επιστροφής / Gate 3 OPEN

- [x] Στο LAB POS 2 νέο πραγματικό «ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ–ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ» 9946, σκοπός ΕΠΙΣΤΡΟΦΗ. Το έντυπο έχει 2 είδη, ποσότητες 2+1, καθαρή 5,34 €, έκπτωση 0,60 €, ΦΠΑ 0,70 €, πληρωτέο 6,04 €. Η εφαρμογή δημιούργησε «Νέα παραγγελία» 2 γραμμών, καθαρή 4,13 €, μικτή 4,67 € (απόκλιση 1,37 €), δεύτερη ποσότητα 2,46 αντί 1, δεύτερη μικτή αξία 1,13 € αντί 2,50 €.
- [ ] Σταματά η οριστικοποίηση/αποθήκη/πληρωμή αυτού του πρόχειρου. Ο κώδικας POS handoff/intake δεν μεταφέρει `documentType`, παρότι ο AI επανέλεγχος το αναγνωρίζει: χρειάζεται πλήρης ασφαλής ροή πιστωτικού ως επιστροφή και ξεχωριστή αριθμητική επαλήθευση των γραμμών. Δεν υπάρχει ακόμη διόρθωση ή PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-delta-9946-credit-note-lab-fail.md`.

## 2026-09-24 — ΣΙΓΜΑ ΑΤΤΙΚΗΣ Β 179241 / ΤΔΑΒ179241 — γνήσιο LAB PASS συγκεκριμένου παραστατικού

- [x] Μετά το ακριβές Render `cab35458307dba6d6629c1790579db8296e6613c`, νέο πραγματικό τιμολόγιο στο LAB POS 2. Ένα επιτυχές ανέβασμα στο BackOffice και πρόχειρο 10/10 τυπωμένων ειδών, 183 τεμαχίων, 746,54 € καθαρή/τελική αξία, ΦΠΑ 0%, εκπτώσεις 0. Οι 10 κωδικοί, ποσότητες, αρχικές τιμές και αξίες γραμμής συμφωνούν με το έντυπο στις εικόνες. Δεν έγινε έγκριση/αποθήκη.
- [ ] Gate 3 συνολικά OPEN: αυτό το τσιγαρικό παραστατικό δεν επαληθεύει τη διόρθωση `ΦΑΚ` του ΟΧΟΝΟΣ ούτε αίρει τις παλαιότερες αποτυχίες άλλων προμηθευτών. Χρειάζεται διαπρομηθευτική δοκιμή με αναλυτικές τιμές/εκπτώσεις.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-sigma-attikis-b179241-lab-pass.md`.

## 2026-09-24 — ΟΧΟΝΟΣ TAA0034921 — πραγματικό LAB FAIL οικονομικών γραμμών / Gate 3 OPEN

- [x] Νέα γνήσια υποβολή στο LAB POS 2 μετά το ακριβές Render `05c5d7f71976f8574aa6f48b0399f238dac7426c`: ένα job `2e0f58ae-3e8b-4dd1-ac4a-567ebc692874` και ένα αυτόματο πρόχειρο, 13/13 τυπωμένες γραμμές, 41 τεμάχια, καθαρή 36,72 €, ΦΠΑ 4,77 €, τελικό 41,49 €. Χωρίς αποθήκη ή έγκριση.
- [x] Σοβαρό LAB FAIL: αρχικές τιμές 0,970/2,500/1,600 € του εντύπου εμφανίζονται 970/2500/1600 €, με τεχνητές εκπτώσεις 99,93–99,94%. Οι σωστές καθαρές και μικτές αξίες δεν αποδεικνύουν σωστές αγορές ή εκπτώσεις. Η γρήγορη POS διαδρομή παρέκαμψε το AI reread επειδή ήδη συμφωνούσε το σύνολο, άρα `firstPassEvidence` είναι null.
- [x] Περιορισμένη διόρθωση: ανάγνωση τυπωμένης αλυσίδας `ΦΑΚ` υπό αριθμητικές διασταυρώσεις και μη αποδοχή ατεκμηρίωτης έκπτωσης >95%. Πλήρης τοπική suite και CI #2935 PASS, PR #1154 merged, exact Render `cab35458307dba6d6629c1790579db8296e6613c`.
- [ ] Η νέα γνήσια υποβολή ΣΙΓΜΑ ΑΤΤΙΚΗΣ πέρασε αλλά δεν έχει `ΦΑΚ`/30% εκπτώσεις· η διόρθωση ΟΧΟΝΟΣ δεν έχει ακόμη επαληθευτεί σε πραγματικό παραστατικό ίδιου τύπου. Καμία έγκριση, απόθεμα, λογιστική ή fiscal κίνηση στο αποτυχημένο πρόχειρο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-ohonos-taa0034921-lab-fail.md`.

## 2026-09-24 — ΤΔΑ02590: αρχική πηγή των 25 γραμμών — LAB FAIL / AWAITING EVIDENCE

- [x] Διαβάστηκε το ίδιο job `a4a9a814-8a9a-4967-82ca-0f158f1c1341`: 11 table recheck, 14 Azure recovery, 17 μεταγενέστερες γραμμές / 54,86 € αντί 46,65 €. Η επανανάγνωση αντικατέστησε τις αρχικές 25 γραμμές του job, αλλά το πρόχειρο 25 / 168,98 € έμεινε ως είχε. Η ακριβής αρχική πηγή δεν τεκμηριώνεται πλέον.
- [ ] Κρατάμε στο tenant-scoped job το πρώτο πλήρες στιγμιότυπο και τα provider/μεταγενέστερα στιγμιότυπα σε κάθε POS, χωρίς αλλαγή OCR ή draft. Regression τοπικό PASS· CI/merge/exact deploy και νέα διαφορετική γνήσια LAB υποβολή εκκρεμούν. Η επόμενη υποβολή είναι διαγνωστική μέχρι να αποδειχθεί και διορθωθεί η αιτία· Gate 3 OPEN.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-olympos-tda02590-lab-fail.md`.

## 2026-09-24 — ΤΔΑ02590: ανάγνωση αποθηκευμένων διαγνωστικών — AWAITING LAB

- [ ] Στην οθόνη «Ανάγνωση τιμολογίων», ανοίγουμε τα «Διαγνωστικά OCR (μόνο ανάγνωση)» του ίδιου job και ελέγχουμε τα αποθηκευμένα στοιχεία προέλευσης των 25 γραμμών. Καμία επανυποβολή, έγκριση ή κίνηση αποθήκης. Η διόρθωση ανάγνωσης ακολουθεί μόνο μετά την αιτιώδη διάγνωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-olympos-tda02590-lab-fail.md`.

## 2026-09-24 — Όλυμπος ΤΔΑ02590 — πραγματικό LAB FAIL / Gate 3 OPEN

- [x] Μετά το PR #1146 (CI #2916 PASS, παραγωγή `a95292e27a5d3264f98a695a901d4d38e629d098`), μία νέα γνήσια υποβολή POS: έντυπο 13 σειρές, 34 τεμάχια, καθαρή 41,31 €, ΦΠΑ 5,34 €, πληρωτέο 46,65 €. Πρώτο αυτόματο πρόχειρο 25 σειρές, καθαρή 164,25 €, μικτή 168,98 €, διαφορά 122,33 €, `POS_BACKGROUND_FAILED`.
- [x] Οι γραμμές 13–25 εμφανίζουν επαναληπτικές/μετατοπισμένες αναγνώσεις, ποσότητες 15/15,53/500/250 αντί τυπωμένων 4/3/4/4 και ατεκμηρίωτο ΦΠΑ 0%. Η πλήρης επανανάγνωση δεν διόρθωσε το πρόχειρο. Το μερικό PASS του Β 4462 και η μαθηματική διόρθωση του PR #1146 δεν αποτελούν συνολικό Gate 3 PASS.
- [ ] Επόμενο: διαγνωστικά του **ίδιου** αποθηκευμένου job για απόδειξη του σταδίου που δημιούργησε τις επιπλέον σειρές, πριν από νέα διόρθωση· όχι δεύτερο upload, έγκριση ή μεταβολή αποθήκης. Πραγματική αποδοχή μόνο σε νέο διαφορετικό τιμολόγιο μετά από τεκμηριωμένη αλλαγή, πράσινο CI, merge και exact deploy.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-olympos-tda02590-lab-fail.md`.

## 2026-09-24 — ΠΗΓΑΣΟΣ 514/18597: τυπωμένη μικρή έκπτωση — DEPLOYED / Gate 3 OPEN

- [x] Νεότερο πραγματικό αποτέλεσμα: 24 τυπωμένα είδη/230,49 €, πρώτο αυτόματο πρόχειρο 26 είδη/227,59 €: **LAB FAIL**. Δεν εγκρίθηκε, δεν ξαναυποβλήθηκε.
- [x] Η συγκεκριμένη φυσική σειρά Haribo 2 × 0,01 € με τυπωμένο 7% / 0,00 € αποκλειόταν από τη μαθηματική επαλήθευση της πλήρους OCR ανάγνωσης. Περιορισμένη διόρθωση δέχεται μηδενικό ποσό μόνο όταν το ποσοστό επί της βάσης είναι κάτω από 0,005 €· μηδενική ουσιαστική έκπτωση απορρίπτεται. Στοχευμένο regression PASS.
- [x] Πλήρης suite, CI #2916 PASS, PR #1146 merged, ακριβές Render revision `a95292e27a5d3264f98a695a901d4d38e629d098`. Το επόμενο διαφορετικό πραγματικό τιμολόγιο Όλυμπος ΤΔΑ02590 **απέτυχε** όπως καταγράφεται στην κορυφή. Η αλλαγή διόρθωσε το περιορισμένο μαθηματικό εμπόδιο, χωρίς να αποδείξει αξιόπιστη πλήρη OCR ανάγνωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-pegasos-514-18597-lab-fail.md`.

## 2026-09-24 — ΠΗΓΑΣΟΣ 514/18597 — πραγματικό LAB FAIL / Gate 3 OPEN

- [x] Πρώτη νέα υποβολή στο LAB POS, ένα ορατό αυτόματο πρόχειρο. Έντυπο: **24 είδη, 103 τεμάχια, καθαρή 203,98 €, ΦΠΑ 26,51 €, πληρωτέο 230,49 €**. Πρόχειρο: **26 είδη, καθαρή 207,28 €, μικτή 227,59 €**, διαφορά 2,90 €. Πέρα από το όριο δύο αβέβαιων γραμμών.
- [x] Συγκεκριμένες ασυμφωνίες: πρώτες δύο Nestlé έντυπο 15,26 € ανά σειρά αλλά πρόχειρο 16,68 € με ΦΠΑ 1,76 € στο ΕΦΚ· ποσότητες 100 και τιμές 100/70/85/99 αντί τυπωμένων 5 × 2,91 € / 5 × 2,91 € κ.λπ. για Lindt· γραμμές 18–26 περιέχουν ορατές επιπλέον/επαναληπτικές σειρές και ατεκμηρίωτο ΦΠΑ 0%.
- [ ] Χωρίς έγκριση, stock ή δεύτερη υποβολή. Χρειάζεται αιτιώδης διάγνωση των αρχικών OCR source rows και της συμπληρωματικής ανάγνωσης· δεν επιτρέπεται εικασία από το σωστό header total ή σιωπηλή διαγραφή πραγματικής επανάληψης.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-pegasos-514-18597-lab-fail.md`.

## 2026-09-24 — POS Β 4462 Σακελλαρίου — πραγματικό μερικό LAB PASS / συνολικό Gate 3 OPEN

- [x] Νέα γνήσια υποβολή στο LAB POS μετά το ακριβές deploy `e6c9f35118a1d8e9973a891db5532bc25bd1d8f0` (PR #1140, CI #2905 PASS). Δημιουργήθηκε ένα αυτόματο πρόχειρο, 4 φυσικές γραμμές, χωρίς ορατές διπλές ή ελλείψεις.
- [x] Σύγκριση φωτογραφίας τυπωμένου Β 4462 με αυτόματο πρόχειρο: ποσότητες 5/5/28/25 τεμάχια (άθροισμα 63), τιμές 24,00/1,35/1,25/1,12 €, καθαρές αξίες 120,00/6,75/35,00/28,00 €, ΦΠΑ 24% και 28,80/1,62/8,40/6,72 €. Καθαρή 189,75 €, ΦΠΑ 45,54 €, μικτή 235,29 €, διαφορά 0,00 €.
- [ ] Η αντιστοίχιση κάθε γραμμής σε προϊόν καταλόγου, τα ακριβή πλήθη job/settlement και η λειτουργία σε άλλους προμηθευτές δεν τεκμηριώνονται από τις φωτογραφίες. Καμία έγκριση/ενημέρωση αποθήκης. Το συνολικό Gate 3 δεν κλείνει από ένα τιμολόγιο· παλαιότερα LAB FAIL παραμένουν ιστορικά.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-sakellariou-4462-lab.md`. Οδηγίες: `docs/manual/pos/PASS.md`.

## 2026-09-24 — TWINS 8217 τυπωμένο «Τεμ.» — LAB FAIL / LOCAL PASS / AWAITING CI

- [x] PR #1139, παραγωγή `3c0c7409313315d105377e2cf1b1488eee23de25`: νέο πραγματικό POS τιμολόγιο TWINS `8217`, μία αυτόματη παραγγελία με 5/5 φυσικές γραμμές και 128,16 € / 128,16 €.
- [x] LAB FAIL ποσότητας: δεύτερη γραμμή τυπωμένη 6 Τεμ. × 1,10 €, πρόχειρο 36 μονάδες αποθήκης × 0,183333 €. Δεν εγκρίθηκε ούτε κινήθηκε αποθήκη.
- [x] Τοπική περιορισμένη διόρθωση: η τυπωμένη μονάδα `Τεμ.` αναγνωρίζεται ως τεμάχιο, χωρίς νέο πολλαπλασιασμό από το «6 τεμ» της περιγραφής ή verified learned pack. Διατηρούνται αποδεδειγμένα χαρτοκιβώτια, οικονομικά και λοιπές μονάδες.
- [x] Regression TWINS και προϋπάρχοντα 28897: 6/6 PASS.
- [ ] Πλήρης suite, CI, merge, ακριβές deploy και νέα διαφορετική γνήσια υποβολή POS. LAB PASS μόνο με σωστές φυσικές και αποθηκευτικές ποσότητες, έως δύο ορατά `ΠΡΟΣ ΕΛΕΓΧΟ`, χωρίς ανεπίλυτα, συμφωνία εκπτώσεων, ΦΠΑ και συνόλων πριν από έγκριση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-pos-twins-printed-tem-piece.md`.

## 2026-09-23 — POS κοινή ταυτότητα φυσικής γραμμής / ΦΠΑ 0% — LOCAL TESTING, LAB FAIL

- [x] Νεότερο LAB ΧΑΤΖΗΒΑΣΙΛΟΓΛΟΥ `ΤΔΑ0111053`: τυπωμένο 27 γραμμές, ΦΠΑ 0%, 1.568,60 €· αυτόματο πρόχειρο 30 γραμμές, 40.573,12 €. `POS_FAILED` μετά την επανανάγνωση. Δεν έγινε έγκριση ή απόθεμα.
- [x] Τοπική αναπαραγωγή: η συγχώνευση άφηνε ΦΠΑ 24% αντί επαληθευμένου 0% και διαφορετικός αναγνωρισμένος κωδικός μπορούσε να διπλασιάσει μία γραμμή παρότι είχε ίδια πηγή/θέση.
- [x] Τοπική αλλαγή στο branch `fix/pos-physical-row-merge` από το σημερινό `main`: ταυτοποίηση αποδεδειγμένης θέσης πίνακα και αποδοχή μόνο επαληθευμένου ΦΠΑ 0%. Δύο διαφορετικές φυσικές σειρές παραμένουν χωριστές.
- [x] Στοχευμένα 88/88, πλήρης server suite 1443 PASS / 1 SKIP / 0 FAIL, σύνταξη και diff check PASS τοπικά.
- [ ] CI, merge, ακριβές deploy, μία νέα γνήσια υποβολή POS με σωστό ένα πρόχειρο και έως δύο συγκεκριμένες γραμμές `ΠΡΟΣ ΕΛΕΓΧΟ`. Τα παλιά αποτυχημένα πρόχειρα δεν αλλάζουν. Δεν δηλώνεται LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-physical-row-merge-zero-vat.md`.
## ΚΕΝΤΡΙΚΗ ΕΝΕΡΓΗ ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ - ΥΠΟΧΡΕΩΤΙΚΗ ΠΗΓΗ

- Η τρέχουσα, καθαρισμένη λίστα όσων **δεν έχουν ακόμη πραγματικό PASS** βρίσκεται στο `docs/roadmap/PENDING_WORK.md`.
- **Άμεση προτεραιότητα 0:** ετοιμότητα και ελεγχόμενη πιλοτική εγκατάσταση καταστήματος έως Κυριακή 27/09/2026.
- Η επίσημη σειρά παραμένει Gate 1-8. Gate 1 και Gate 2 έχουν PASS. Gate 3 έχει ανατεθεί σε άλλη σελίδα. Η παλιά ένδειξη Gate 5 PASS αναιρέθηκε από τον ιδιοκτήτη στις 24/09: Gate 5 ανατέθηκε στο `agent/gate5-payments-reconciliation` / NOT TESTED, με αποδοχή μετά το Gate 4.
- Κάθε ελεύθερο Gate ή ανεξάρτητη υποεργασία μπορεί να αναληφθεί από διαφορετική σελίδα, αφού πρώτα σημειωθεί κεντρικά `ΑΝΑΤΕΘΗΚΕ - σελίδα/branch`. Ήδη ανατεθειμένο scope δεν δουλεύεται παράλληλα από δεύτερη σελίδα.
- Κάθε πραγματικό PASS διαγράφεται άμεσα από την pending λίστα από τη σελίδα που το ολοκλήρωσε. Όταν αδειάσει ένα Gate, μεταφέρεται στα PASS και δεν ξαναϋλοποιείται.
- Με κάθε πραγματικό LAB/LIVE/USER PASS, το ίδιο PR αφαιρεί υποχρεωτικά την εργασία από το roadmap και ενημερώνει checkpoint, αυτή την ενεργή λίστα, `docs/manual/<module>/PASS.md` και το κεντρικό PDF.
- Παλιότερα ιστορικά `AWAITING LAB` που έχουν υπερκαλυφθεί από νεότερο πραγματικό PASS δεν αποτελούν ενεργή εργασία και δεν πρέπει να ξαναυλοποιούνται.
- Τιμολόγια/OCR και efood/Pelican συνεχίζονται αποκλειστικά από τις αντίστοιχες εξειδικευμένες σελίδες.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-central-pending-roadmap.md`.

## 2026-09-24 — Κοινός κανόνας όλων των σελίδων: εικονικό LAB

- Το MYWORKSTATION LAB είναι εικονικό κατάστημα ελεγχόμενων δοκιμών. Πωλήσεις, επιστροφές, απόθεμα, χρήστες, ποσά και βάρδιες είναι δοκιμαστικά· μετράμε τα αποτελέσματα ώστε οι λειτουργίες να είναι σωστές όταν δημιουργηθούν πραγματικά καταστήματα.
- Κάθε νέο πραγματικό κατάστημα στήνεται χωριστά **από την αρχή** με δικά του είδη, αποθήκη, υπαλλήλους, POS και βάρδιες. Τα επιβεβαιωμένα LAB PASS καταχωρίζονται κεντρικά και οι διορθώσεις του κοινού κώδικα διατίθενται στα νέα καταστήματα. Δεν αντιγράφεται το LAB. Ιστορικά αρνητικά stock/εικονικές διαφορές και η παλιά cross-terminal κίνηση διατηρούνται στο LAB Audit, χωρίς να αποτελούν blockers για το νέο κατάστημα ή αυτόνομο λόγο Gate 4 PENDING.
- Τα επιβεβαιωμένα LAB PASS αφαιρούνται από τις ενεργές εκκρεμότητες. Συνολικό Gate 4 PASS απαιτεί τις υπόλοιπες πραγματικά μη δοκιμασμένες λειτουργίες του §4 του roadmap· η νέα εγκατάσταση παρακολουθείται χωριστά. Αυτή η διευκρίνιση υπερισχύει των παλιών ιστορικών «pending» που ακολουθούν.

## 2026-09-24 — Gate 4 POS 1/POS 2 και πιλοτική εγκατάσταση — ΑΝΑΤΕΘΗΚΕ

- **Νεότερο LAB PASS κλεισίματος δύο βαρδιών 24/09:** στο Backoffice, `LAB-POS-01` έκλεισε 15:33:07 και `LAB-POS-02` 15:39:23, καθένα με διαφορά **0,00 € / ΣΥΜΦΩΝΙΑ**, 3 και 4 κινήσεις αντίστοιχα. Το POS02 απέρριψε αρχικά εικονικό έλλειμμα 1,50 € και πρόσφερε επανακαταμέτρηση· το τελικό εικονικό συρτάρι ήταν 2,00 €. Με ανανέωση δεν έμεινε ανοιχτή βάρδια. **Το σκέλος κλεισίματος ολοκληρώθηκε και δεν επαναλαμβάνεται.** Το παλιό `MAIN` παραμένει με −0,50 € / έλεγχο· η ιστορική επιστροφή 12:44 σε λάθος terminal, η αρχική απογραφή και το πιλοτικό preflight παραμένουν pending. `docs/manual/pos/PASS.md`· **Gate 4 PENDING**.

- **Νεότερο LAB PASS μερικής επιστροφής 24/09:** στο φυσικό `LAB-POS-02` η δική του πώληση 1,50 € στις 11:47 επέστρεψε μόνο 1 × ΝΕΡΟ 1,5LT, 1,00 €, στις 14:50. Backoffice POS02 **3→4 κινήσεις, 1,50→0,50 €**, POS01 αμετάβλητο **3 κινήσεις, 0,50 €**. Κοινό stock SKU 2270 **−3→−2**, συνολικό **44.946→44.947** μετά από ανανέωση. Αυτό το σκέλος **PASS** και δεν επαναλαμβάνεται. Παλιά λάθος cross-terminal κίνηση 12:44, δύο κλεισίματα, αρχική απογραφή και πιλοτικό preflight παραμένουν pending. `docs/manual/pos/PASS.md`· **Gate 4 PENDING**.

- **Νεότερο LAB PASS κοινής αποθήκης 24/09:** 1 × ΝΕΡΟ 500ML 0,50 € στο φυσικό `LAB-POS-02` → βάρδια POS02 2→3 κινήσεις, 1,00→1,50 €, τελευταία 14:35. Βάρδια POS01 αμετάβλητη 3 κινήσεις, 0,50 €. Ενιαίο stock είδους 2269 **−53→−54**, συνολικό stock 44.947→44.946 μετά από ανανέωση. PASS μόνο για μία κίνηση αποθέματος και απόδοση αυτής της πώλησης· αρνητικό αρχικό stock, ιστορική cross-terminal απόκλιση, δύο κλεισίματα και εγκατάσταση παραμένουν pending. Οδηγίες `docs/manual/pos/PASS.md`. **Gate 4 PENDING**.

- **Νεότερο LAB PASS 24/09:** μετά το PR #1156 / Render `c54011e`, η νέα πώληση POS01 0,50 € στις 13:58 επιστράφηκε στο **ίδιο** `LAB-POS-01` στις 14:02. Backoffice POS01: 3 κινήσεις, καθαρό 0,50 €· POS02: αμετάβλητο στις 2 κινήσεις, 1,00 €, τελευταία 12:44. PASS μόνο για πλήρη επιστροφή δεμένη με το σωστό terminal. Η ιστορική λάθος επιστροφή 12:44 στο POS02 απαιτεί συμφωνία· κοινό stock, μερική επιστροφή, δύο κλεισίματα και εγκατάσταση παραμένουν pending. Οδηγίες `docs/manual/pos/PASS.md`. **Συνολικό Gate 4 PENDING**.

- **Νεότερο LAB AUDIT 24/09:** το ιστορικό POS01 return 0,50 € χρεώθηκε πραγματικά στο POS02 στις 12:44 (**cross-terminal FAIL**). Η διόρθωση PR #1156 / Render `c54011e` έδειξε μόνο τη νέα δική του πώληση 13:58 στη λίστα POS01 και οπτική επιστροφή −0,50 € στη συσκευή. Η κεντρική απόδοση της νέας επιστροφής δεν επιβεβαιώθηκε: έληξε το Backoffice login και η ασφαλής προσπάθεια επανασύνδεσης αποκλείστηκε αυτόματα πριν την υποβολή. Απαιτείται συμφωνία ιστορικής απόκλισης, έλεγχος POS01/POS02, stock και κλείσιμο βαρδιών. **Gate 4 PENDING**. Σωστό Platform Admin link: `https://myworkstation-app.onrender.com/platform-admin`.

- **Νεότερο LAB 24/09:** δύο δεσμευμένα terminal άνοιξαν χωριστές βάρδιες και καταχώρισαν χωριστές πωλήσεις 0,50 € (POS01) / 1,50 € (POS02). Η οθόνη επιστροφής του Εργαστηρίου 1 πρότεινε τη συναλλαγή 1,50 € του POS02: **LAB FAIL**, καμία επιβεβαίωση αυτής της ξένης επιστροφής. Διόρθωση terminal/session σε εξέλιξη, **AWAITING CI / DEPLOY / LAB RETEST**. Το Gate 4 παραμένει pending· λεπτομέρειες στο checkpoint.

- Νεότερο πραγματικό LAB: ακύρωση καλαθιού πριν από πώληση PASS και μία NON_FISCAL πώληση 0,50 € PASS ως καταχώριση. Το Backoffice την αποδίδει στη βάρδια **MAIN**, όχι στο `LAB-POS-02`, παρότι ο χειριστής ονομάζεται LAB POS 2. Το browser της δοκιμής δεν δείχνει δέσμευση Terminal ID. Δύο ενεργά terminal είναι καταχωρισμένα, αλλά χωριστές βάρδιες και κοινό stock δύο δεσμευμένων POS **NOT TESTED**. Συνολικό Gate 4 **LAB PARTIAL / PENDING**. Το νέο link ενεργοποίησης μπλοκαρίστηκε από αυτόματο έλεγχο έγκρισης· δεν έγινε περιστροφή διαπιστευτηρίου. Βλέπε `CHECKPOINTS/CHANGES/2026-09-24-ga…1830 tokens truncated…γιο.
- [x] Νέο LAB PASS: μία υποβολή από το POS δημιουργεί αυτόματα ένα και μόνο ασφαλές πρόχειρο, χωρίς διπλή πληρωμή/πίστωση, οριστικοποίηση, κίνηση αποθήκης, φορολογική, λογιστική ή myDATA ενέργεια. Επιτρέπονται έως **2 λανθασμένες ή αβέβαιες γραμμές ανά τιμολόγιο**, εφόσον επισημαίνονται ως **ΠΡΟΣ ΕΛΕΓΧΟ**.
- [x] Κάθε γραμμή χαμηλής σιγουριάς ή χωρίς επαρκή αριθμητική/μονάδα/συσκευασία επιβεβαίωση πρέπει να επισημαίνεται οπτικά ως **ΠΡΟΣ ΕΛΕΓΧΟ** στο BackOffice. Ο χειριστής διορθώνει μόνο αυτές τις γραμμές πριν από ρητή έγκριση.
- [x] Οι χειροκίνητες διορθώσεις χρησιμοποιούν το υπάρχον Invoice Learning και αποθηκεύονται ως κανόνες ανά προμηθευτή, ώστε επόμενο τιμολόγιο του ίδιου προμηθευτή να βελτιώνεται χωρίς να επηρεάζονται άλλοι.
- [x] Σταματούν οι ατέρμονοι στοχευμένοι κύκλοι στα παλιά `12674`, `12729`, `2612188`, `43243`. Τα υπάρχοντα drafts παραμένουν μη οριστικοποιημένα και μπορούν μόνο να χρησιμεύσουν ως αναφορά/ασφαλές regression evidence.
- [x] Η σήμανση **ΠΡΟΣ ΕΛΕΓΧΟ** πλέον αποθηκεύεται μαζί με αιτία για χαμηλή σιγουριά, μη έγκυρη αριθμητική ποσότητα/τιμή ή αβέβαιη συσκευασία και μένει ορατή στο BackOffice ακόμη κι όταν η γραμμή έχει αντιστοιχιστεί με προϊόν.
- [x] Η κανονική αποθήκευση χειροκίνητης διόρθωσης καθαρίζει τη σήμανση μόνο μετά από ρητή ενέργεια χειριστή και διατηρεί το υπάρχον supplier-scoped Invoice Learning/audit.
- [ ] Απαιτούνται unit/full-suite/build/CI/deploy και νέο καθαρό POS τιμολόγιο διαφορετικού προμηθευτή. Μόνο τότε μπορεί να κριθεί LAB PASS με το νέο όριο έως 2 γραμμών.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-pos-invoice-review-acceptance.md`.
## 2026-09-19 — Guard against swapped adjacent OCR rows

- [x] **LAB FAIL** on the fresh POS invoice `445` from supplier `ΚΑΡΑΓΕΩΡΓΙΟΥ Κ ΑΦΟΙ ΑΕΒΕ`: codes `0003012` and `0003013` received the neighbouring quantities (`4` versus printed `6`, and `6` versus printed `4`). The document total reconciled, but that does not prove row correctness.
- [x] New generic acceptance guard: an OCR line is confirmed only when its stored raw physical row independently supports its code, quantity and meaningful description words. A mismatch is persisted as `NEEDS_REVIEW` with the visible reason `Τα στοιχεία δεν επιβεβαιώνονται από την ίδια φυσική σειρά OCR`.
- [x] Carry `sourceColumnsVerified` across OCR finalization, the POS API schema and background handoff; it may no longer be silently discarded before draft persistence.
- [x] No supplier-specific rule or retroactive alteration of invoice `445`; it remains an unapproved diagnostic draft. No payment, stock, fiscal, accounting or myDATA mutation.
- [ ] Require focused/full tests, green CI, merge, exact deploy and one fresh one-submit POS test before declaring the guard or LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-pos-raw-row-review-guard.md`.

## 2026-09-19 — Safe same-draft replay verification (Fresh Snack)

- [x] The existing failed draft `36-ΤΔΑ 005401` must be tested from its stored image; it must not be deleted or submitted again.
- [x] On startup, a recent `POS_FAILED` draft is requeued exactly once only when a complete-table supplier profile records the specific pre-fix trailing-replay verification failure.
- [x] Legacy failed jobs that predate persistence of the profile may use only the linked draft's authoritative `FRESH SNACK` supplier name, together with the same exact failure text; no other supplier is eligible by name.
- [x] The diagnostic recovery endpoint resolves that authoritative supplier from the linked draft after rebuilding a lost durable handoff, so this historic draft can be retried without a new upload.
- [x] The recovery reuses the same job, attachment, credit/draft identity and replaces lines only if the new read is fully verified. It never approves, creates payment, moves stock or finalizes the document.
- [ ] Await CI, deployment and actual result: five physical rows, `47.67 EUR` net, `6.20 EUR` VAT, `53.87 EUR` gross.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-fresh-snack-safe-replay-verification.md`.
## 2026-09-19 — Λεβεντόπουλος ΠΟΣ1 και αποφυγή διπλών γραμμών — AWAITING LAB

- [x] Για τον προμηθευτή ΑΦΜ `800503361` (Λεβεντόπουλος), η ποσότητα και η τιμή διαβάζονται από `ΠΟΣ1` και `ΤΙΜΗ` του Azure πίνακα· όταν δεν επιστρέφεται πίνακας, εφαρμόζεται μόνο η μοναδική ισοσκελισμένη ακολουθία `ΜΜ | ΠΟΣ1 | ΠΟΣ2 | ΤΙΜΗ | ΕΚΠ% | Κ. ΑΞΙΑ | ΦΠΑ` της ίδιας γραμμής.
- [x] Αριθμός από περιγραφή προϊόντος δεν μπορεί να γίνει `ΠΟΣ1`, ενώ item με σπασμένο κωδικό που εκπροσωπείται ήδη από γραμμή πίνακα απορρίπτεται αντί να προστεθεί δεύτερη φορά.
- [x] Δεν αλλάζει υπάρχον draft, πληρωμή, πίστωση, απόθεμα, οριστικοποίηση, fiscal, accounting ή myDATA.
- [ ] Απαιτούνται πράσινο CI, merge/deploy και ένα νέο LAB τιμολόγιο Λεβεντόπουλου για επιβεβαίωση των ποσοτήτων `ΠΟΣ1`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-leventopoulos-mm-pos1-safe-quantity.md`.
## 2026-09-20 — Λεβεντόπουλος complete table fail-closed — CI PASS / AWAITING LAB

- [x] LAB evidence showed `ΤΔΛΠΧ14 15` was corrupted by a free-form numeric column scan: 17 candidate rows / `428,18 €` instead of the printed 9 rows / `194,77 €`.
- [x] The supplier rule now treats `ΠΟΣ1` as quantity only through a verified printed table; `ΜΜ` and `ΠΟΣ2` cannot become quantity by numeric guessing.
- [x] An incomplete reread preserves the same draft unchanged; no payment, credit, stock, finalization, fiscal/accounting or myDATA mutation.
- [ ] Green CI → merge → deploy → recheck the same attachment. A correct candidate must be exactly 9 rows and `194,77 €` before any draft replacement is allowed.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-leventopoulos-complete-table-fail-closed.md`.

## 2026-09-20 — Λεβεντόπουλος existing failed draft recovery — PR #992 / AWAITING CI

- [x] Πραγματική αιτία: το `ΤΔΛΠΧ14 15` παρέμενε `POS_FAILED`, το χειροκίνητο AI reread ήταν disabled και το automatic complete-table recovery δεν περιλάμβανε τον Λεβεντόπουλο.
- [x] Προστέθηκε supplier-specific one-time recovery του ίδιου job/image/draft με strategy `LEVENTOPOULOS_EMPTY_COMPLETE_TABLE_V17` και `replaceExistingDraft=true`.
- [x] Η αντικατάσταση παραμένει fail-closed: απαιτούνται 9 επαληθευμένες γραμμές, footer ΦΠΑ και τελικό σύνολο `194,77 €`. Διαφορετικά το υπάρχον draft δεν αλλάζει.
- [x] 62/62 targeted tests PASS. Καμία διαγραφή, νέα πληρωμή/πίστωση, αποθήκη, οριστικοποίηση, fiscal/accounting ή myDATA ενέργεια.
- [ ] Πράσινο CI → merge/deploy → έλεγχος του ίδιου `ΤΔΛΠΧ14 15` χωρίς νέο upload.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-leventopoulos-existing-failed-reread.md`.

## 2026-09-20 — Λεβεντόπουλος empty OCR complete-table recovery — CI PASS / AWAITING LAB

- [x] The existing diagnostic draft `ΤΔΛΠΧ14 15` returned zero product rows after the fail-closed gate. The background reader now invokes the full image table verifier even when its first OCR pass is empty.
- [x] It may reconstruct rows only when every physical row, the VAT footer and the operator-confirmed `194,77 €` total independently agree; otherwise the existing draft remains unchanged.
- [ ] Require green CI, merge/deploy and a reread of the same stored attachment. Expected result: exactly 9 rows / `194,77 €`, before any replacement is permitted.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-leventopoulos-complete-table-fail-closed.md`.

## 2026-09-20 — Invoice Learning ενιαίοι κανόνες προμηθευτή — PHASE 1 TESTED / AWAITING LAB

- [x] Αποφασίστηκε ότι δεν δημιουργείται δεύτερος invoice reader: ενισχύεται η υπάρχουσα ροή `POS → Τέλος τιμολογίου → ένα Πρόχειρο BackOffice`.
- [x] Ορίστηκε versioned κεντρικός κανόνας ανά προμηθευτή για στήλες, σελίδες, barcodes/Master Catalog, μονάδες, συσκευασίες, πιστωτικά και ειδικές γραμμές.
- [x] Απαγορεύτηκε η εκμάθηση ιστορικών ποσοτήτων, τιμών, εκπτώσεων και συνόλων ως μελλοντικών σταθερών.
- [x] Ορίστηκε ανεξάρτητη επαλήθευση κάθε νέου παραστατικού και fail-closed `Χρειάζεται έλεγχο` σε κάθε ασυμφωνία.
- [x] Το `Επιβεβαίωση & Εκμάθηση` δημοσιεύει VERIFIED full-table contract· ο POS verifier χρησιμοποιεί το κεντρικό profile flag για κάθε προμηθευτή αντί hard-coded allow-list.
- [x] Learned mappings δεν αποθηκεύουν τιμή/ποσότητα/έκπτωση παλιού τιμολογίου. `41/41` targeted και `1351/1351` full server tests PASS· client/server builds PASS.
- [ ] Offline contract των 33 ενεργών δειγμάτων → CI → LAB νέου απλού/πολυσέλιδου/μετατροπής/πιστωτικού.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning Azure footer VAT reconciliation — CI PASS / AWAITING LAB

- [x] LAB evidence: το Azure/OpenAI αποτέλεσμα είχε καθαρές γραμμές `47,48 €`
  και τελικό `53,91 €`, αλλά απορριπτόταν επειδή έλειπε ΦΠΑ ανά γραμμή.
- [x] Νέος fail-closed έλεγχος δέχεται πρόχειρο μόνο όταν το άθροισμα καθαρών
  γραμμών συμφωνεί με την καθαρή αξία footer και `καθαρή + ΦΠΑ = τελικό`.
- [x] Ελλιπής πίνακας εξακολουθεί να απορρίπτεται· δεν επινοείται ΦΠΑ προϊόντος
  και παραμένει απαίτηση ελέγχου γραμμών.
- [x] `9/9` targeted και `1353/1353` full server tests PASS.
- [ ] Green CI → merge/deploy → νέο upload του ίδιου δείγματος στο LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning κρατά Azure όταν λείπει μόνο SubTotal — CI PASS / AWAITING LAB

- [x] LAB evidence: το Azure αποτέλεσμα `47,48 €` απορριπτόταν επειδή η φόρμα
  επέστρεφε `TotalTax`/`InvoiceTotal` αλλά όχι `SubTotal`, και το OpenAI-only
  fallback έβρισκε μόνο `30,24 € από 53,91 €`.
- [x] Νέα αυστηρή συμφωνία: `InvoiceTotal - TotalTax = άθροισμα καθαρών
  γραμμών`, μόνο όταν λείπει line-level ΦΠΑ και με ανοχή `0,05 €`.
- [x] Ελλιπείς γραμμές ή υπάρχων line-level ΦΠΑ δεν περνούν από αυτόν τον
  δρόμο. Δεν αλλάζουν stock, πληρωμή, οριστικοποίηση ή λογιστική.
- [x] `11/11` targeted και `1355/1355` full server tests PASS.
- [ ] Green CI → merge/deploy → ίδιο upload στο Invoice Learning LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning Azure retry / no AI-only result — CI PASS / AWAITING LAB

- [x] LAB evidence: `Azure: REQUEST_FAILED` ακολουθήθηκε από μερικό AI-only
  αποτέλεσμα `40,90 € από 53,91 €`.
- [x] Προσωρινά Azure failures επαναλαμβάνονται έως 3 φορές· μόνιμα failures
  δεν μπαίνουν σε άσκοπο retry.
- [x] Μετά από τεχνική αποτυχία Azure η ανάγνωση σταματά ρητά και δεν
  παρουσιάζεται OpenAI-only αποτέλεσμα ως κανονική ανάγνωση.
- [x] `11/11` targeted και `1357/1357` full server tests PASS.
- [x] Green CI → merge/deploy `b3e1b69b67a3c9c198fc904ea20784750e1086b0` → ίδιο upload στο Invoice Learning LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning Azure safe diagnostics — CI PASS / AWAITING LAB

- [x] Το retry gate λειτουργεί: το LAB δεν παρουσίασε ξανά το ελλιπές
  OpenAI-only αποτέλεσμα μετά από Azure request failure.
- [x] Προστέθηκε ασφαλής διαγνωστικός κωδικός για auth/access/endpoint/model,
  rate limit, network, timeout και Azure 5xx, χωρίς έκθεση μυστικών.
- [x] Το Azure polling timeout επαναλαμβάνεται πλέον έως 3 φορές.
- [x] `3/3` targeted και `1358/1358` full server tests PASS.
- [ ] Green CI → merge/deploy → ίδιο upload και καταγραφή του ακριβούς
  διαγνωστικού κωδικού.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.
## 2026-09-20 — Invoice Learning Azure + OpenAI complementary-row recovery — CI PASS / AWAITING LAB

- [x] Υποδομή LAB: σωστό endpoint, νέο Azure key και API-key authentication Enabled· το `ACCESS_403` εξαφανίστηκε.
- [x] Νεότερο πραγματικό LAB αποτέλεσμα: Azure απάντησε, αλλά η συνολική ανάγνωση έμεινε ασφαλώς μπλοκαρισμένη ως `NO_SAFE_RESULT` με `35,72 € από 53,91 €`.
- [x] Azure και OpenAI γραμμές συγχωνεύονται ως multiset, ώστε πραγματικές επαναλαμβανόμενες γραμμές να μη χάνονται.
- [x] Το υβριδικό αποτέλεσμα επιστρέφεται μόνο αν ο υπάρχων ανεξάρτητος footer έλεγχος συμφωνήσει πλήρως· διαφορετικά παραμένει μπλοκαρισμένο.
- [x] Καμία πληρωμή, stock, έγκριση, οριστικοποίηση, fiscal/accounting ή myDATA μεταβολή.
- [x] `14/14` targeted και `1360/1360` full server tests PASS τοπικά.
- [ ] Green CI → merge/deploy → ίδιο upload στο Invoice Learning LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-hybrid-row-recovery.md`.

## 2026-09-20 — Invoice Learning → POS verified handoff — AWAITING CI / POS

- [x] Πραγματικό Invoice Learning αποτέλεσμα: DELTA `28897`, 11 γραμμές,
  `53,92 €` έναντι τυπωμένου `53,91 €` (αποδεκτή απόκλιση `0,01 €`).
- [x] Η αιτία του `POS_BACKGROUND_AI_RECHECK` εντοπίστηκε: οι συμφωνημένες
  γραμμές δεν περνούσαν από τον current-image verifier όταν δεν υπήρχε διαφορά
  συνόλου, ενώ ο τελικός ασφαλής έλεγχος απαιτούσε τη σφραγίδα του.
- [x] Κάθε μη επαληθευμένη γραμμή προφίλ Learning οδηγείται πλέον σε πλήρη
  οπτικό και αριθμητικό έλεγχο της τρέχουσας εικόνας πριν γεμίσει το υπάρχον
  πρόχειρο POS.
- [x] Δεν αλλάζει πληρωμή, stock, fiscal, λογιστική, myDATA, έγκριση ή
  οριστικοποίηση. Αποτυχία επαλήθευσης αφήνει το πρόχειρο ανέπαφο.
- [x] `73/73` targeted και `1367/1367` full server tests PASS τοπικά.
- [ ] Green CI → merge/deploy → μία ασφαλής επανάληψη του `28897` από POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-verified-handoff.md`.

## 2026-09-21 — Exact Learning bypasses generic OCR mutation — READY FOR CI

- [x] **Fresh POS FAIL (12:26):** the post-deploy attempt still ended as
  `POS_FAILED / POS_BACKGROUND_FAILED` with zero lines.
- [x] The exact learned rows were being passed again through generic OCR/profile
  recovery, allowing their `sourceColumnsVerified` proof to be lost.
- [x] Exact central Learning now ends AI recheck directly as `AI_COMPLETE` after
  exact supplier/invoice identity, confirmed row arithmetic and gross-total
  reconciliation. No second OCR/profile mutation is allowed.
- [x] Targeted `7/7` and full server suite `1382/1382` PASS.
- [ ] Push → PR → green CI → merge → exact Render deploy.
- [ ] Delete the empty diagnostic draft and submit `28897` once after deploy.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-verified-handoff.md`.
## 2026-09-20 — DELTA 28897 POS economics + durable Learning draft — CI PASS / AWAITING LAB

- [x] **LAB FAIL:** the first POS draft showed printed quantities multiplied by 1000 (`2 → 2000`, `1 → 1000`), discounts as `99,9` instead of `10/15`, and VAT `0` instead of `13`, despite gross `53,91 €`.
- [x] Plain `ΤΜΧ/TEM` rows no longer interpret `1LT/450ML` capacity metadata as stock-piece multipliers; package/weight conversion still requires an explicit verified rule.
- [x] A claimed complete printed table is revalidated immediately before persistence. Corrupted quantity/discount/VAT arithmetic now fails closed and cannot fall back to the lossy legacy finalizer.
- [x] Exact regression fixture preserves the 11 printed quantities, discounts `10%/15%`, VAT `13%`, and gross `53,91 €`.
- [x] **LAB FAIL:** «Αποθήκευση Προχείρου» gave no durable/visible confirmation. It now awaits the central workspace `PUT`, disables during save, and displays explicit success or failure.
- [x] No approval, finalization, payment, stock, fiscal, accounting or myDATA mutation.
- [ ] Green CI → merge → exact Render deploy.
- [ ] LAB: save a Learning draft and reload it; then delete the erroneous diagnostic POS draft and submit `28897` once from POS. Acceptance requires one draft with quantities `2,1,3,6,3,3,3,2,4,3,1`, discounts `10%` for rows 1–9 / `15%` for rows 10–11, VAT `13%`, and total `53,91 €` (cent rounding tolerance only).
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — DELTA exact Learning at final persistence — TESTING

- [x] **Fresh POS FAIL:** after Learning success, the BackOffice draft still
  showed quantities `2000/1000/3000` and discount `99,9%`; do not finalize it.
- [x] Final `pos-intake` now revalidates the exact central Learning invoice
  after supplier validation and before product matching/database insertion.
- [x] Exact reuse remains fail-closed: same supplier, `28897`, `53,91 €`, all
  11 rows confirmed and every line equation balanced.
- [x] Targeted DELTA/Learning regression `9/9` PASS.
- [ ] Full suite → push → PR → green CI → merge → exact Render deploy.
- [ ] Delete this erroneous draft and retry once only after exact deployment.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-20 — DELTA 28897 fresh-run display repair — CI PASS / AWAITING LAB

- [x] Η ώρα `10:49 μ.μ.` επιβεβαίωσε ότι η προβληματική εγγραφή ήταν νέα και όχι παλιό πρόχειρο.
- [x] Αφαιρέθηκε η εμπιστοσύνη σε raw OCR multiplier (`1LT → 1000`) για μονάδα `ΤΜΧ`.
- [x] Προστέθηκε ασφαλής αποκατάσταση `99,9 → 10/15` και `ΦΠΑ 0 → 13` μόνο όταν αποδεικνύεται από ποσότητα, αρχική τιμή, καθαρή και μικτή αξία.
- [x] Η υπάρχουσα νέα POS OCR παραγγελία διορθώνεται κατά το επόμενο άνοιγμα λεπτομερειών μετά το deploy.
- [x] `1373/1373` full server tests PASS.
- [ ] Green CI → merge → exact Render deploy → άνοιγμα της υπάρχουσας `28897` και οπτική επιβεβαίωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — DELTA Learning exact POS handoff — READY FOR PUSH

- [x] **Fresh POS FAIL (09:27):** `28897` created a zero-line draft and ended as
  `POS_FAILED / POS_BACKGROUND_FAILED`, because the background reader ignored
  the already-confirmed Learning document and required another provider read.
- [x] «Επιβεβαίωση & Εκμάθηση» now confirms every non-rejected row and awaits
  the central workspace save; it cannot display a false central-save success.
- [x] Before Azure/OpenAI, POS may reuse only a `LEARNED` document with the
  exact supplier, invoice number and gross total, all rows confirmed, and
  independently balanced quantity/price/discount/VAT arithmetic.
- [x] Exact `28897` regression preserves 11 rows, quantities
  `2,1,3,6,3,3,3,2,4,3,1`, discounts `10%/15%`, VAT `13%`, and total within
  the existing `0,05 €` safety tolerance.
- [x] Client production build PASS; full server suite `1377/1377` PASS.
- [ ] User approval → push → PR → green CI → merge → exact Render deploy.
- [ ] LAB: reopen Learning `28897`, press «Επιβεβαίωση & Εκμάθηση» once, then
  delete the zero-line diagnostic draft and submit the invoice once from POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — Central Learning restore before OCR — READY FOR PUSH

- [x] **LIVE evidence:** a new Learning upload remained safely blocked as
  `NO_SAFE_RESULT` (`55,25 €` versus printed `53,91 €`). No partial draft was
  created.
- [x] Root cause: the Lab rendered from the local cache while the central
  workspace restore was still running, so the saved `28897` was not available
  for continuation and the user was forced into another provider read.
- [x] The Lab now awaits central restore before rendering and no longer has a
  competing static bootstrap.
- [x] Every restored invoice exposes «Συνέχιση / Επιβεβαίωση», loading its
  saved rows into the editable review without Azure/OpenAI.
- [x] Targeted `8/8`, full server `1379/1379`, client production build PASS.
- [ ] Green CI → merge → exact Render deploy → refresh Learning and continue
  saved `28897` without uploading the image again.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — DELTA stale Learning header total — READY FOR CI

- [x] **Fresh POS FAIL (11:53):** `28897` remained a zero-line draft and ended
  as `POS_FAILED / POS_BACKGROUND_FAILED` after a successful Learning save.
- [x] Root cause: Learning retained stale OCR header total `55,25 €`, while its
  11 confirmed rows reconcile to the trusted POS/printed total `53,91 €`.
- [x] Exact replay no longer trusts that stale header. It still requires exact
  supplier + invoice number, all rows confirmed, balanced line arithmetic and
  complete learned gross within `0,05 €` of the POS total.
- [x] Targeted exact-Learning regression `6/6` and full server suite
  `1381/1381` PASS, including real quantities and discounts with stale header
  `55,25 €`.
- [ ] Push → PR → green CI → merge → exact Render deploy.
- [ ] Delete the empty diagnostic draft and submit `28897` once after deploy.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-verified-handoff.md`.
## 2026-09-21 — Invoice Learning: supplier identity vs commercial format — CI PASS / AWAITING LAB

- [x] Νομικός εκδότης παραμένει δεμένος με επωνυμία και ΑΦΜ.
- [x] Προστέθηκαν ξεχωριστά εμπορική οικογένεια τιμολογίου και διανομέας/περιοχή.
- [x] Η οικογένεια χρησιμοποιείται μόνο για διάταξη/στήλες· δεν αντιγράφονται ποσότητες, τιμές ή εκπτώσεις.
- [x] Νέο migration και UI εκμάθησης για επιβεβαίωση του νέου ΑΦΜ ΜΑΝΤΖΑΒΑΣ με μορφή ΔΕΛΤΑ.
- [ ] Πράσινο CI → merge → deploy → δοκιμή νέου τιμολογίου ΜΑΝΤΖΑΒΑΣ.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-supplier-commercial-family.md`.
## 2026-09-21 — Invoice Learning supervised partial correction — CI PASS / AWAITING LAB

- [x] Partial OCR/AI results now remain editable only inside Invoice Learning Lab.
- [x] Added «＋ Προσθήκη γραμμής» so missing printed rows can be entered manually.
- [x] POS/order intake remains fail-closed and cannot create a partial invoice/order.
- [x] Targeted invoice-learning tests and JavaScript syntax checks PASS.
- [ ] Green CI → merge → deploy → retest the same DELTA invoice.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-supervised-partial-correction.md`.
## 2026-09-21 — Invoice Learning mathematical discount recovery — CI PASS / AWAITING LAB

- [x] Recover a missing discount only when quantity × unit price × discount reconciles with the printed net value.
- [x] Example verified: `6 × 1,74 − 10% = 9,40 €`.
- [x] Do not invent missing product rows; keep them for supervised manual addition.
- [x] Targeted invoice-learning tests `17/17` PASS.
- [ ] Green CI → merge → deploy → retest the DELTA invoice.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-discount-recovery.md`.

## 2026-09-21 — Invoice Learning document management and AFM lookup — CI PASS / AWAITING LAB

- [x] Added user-controlled deletion for an individual learned invoice, with confirmation.
- [x] Deletion removes only the selected learning document; supplier profiles and DELTA format rules remain.
- [x] Added top-level official supplier-name lookup by 9-digit AFM through the existing VAT lookup path.
- [x] Local client build, JavaScript syntax checks and diff validation PASS.
- [ ] Green CI → merge → deploy → user deletes the duplicate MANTZAVAS 38001 record and verifies AFM lookup.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-document-management.md`.

## 2026-09-21 — POS exact Learning replay with missing draft total — READY FOR CI

- [x] LAB evidence: MANTZAVAS `38001` remains `LEARNED`, but POS created a safe zero-line draft and rejected the background reread.
- [x] Exact replay now loads the matching learned invoice even when a failed POS retry lost the temporary header total.
- [x] The fallback uses only the same supplier + invoice number and the learned line arithmetic; it does not copy DELTA economics.
- [x] Targeted exact-handoff regression `8/8` PASS; syntax and diff checks PASS.
- [ ] Green CI → merge → deploy → retry the existing safe MANTZAVAS `38001` draft once.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-pos-missing-total.md`.

## 2026-09-21 — POS retry for every confirmed complete-table profile — READY FOR CI

- [x] LAB evidence: the existing MANTZAVAS 38001 failed job stayed `POS_FAILED` after refresh because its complete-table profile had no generic retry strategy.
- [x] Every centrally confirmed complete-table profile can now restart the same failed draft; exact Learning replay remains supplier + invoice scoped.
- [x] No payment, duplicate invoice, stock or cross-supplier economics are introduced by the retry.
- [ ] Green CI → merge → deploy → refresh POS and retry MANTZAVAS 38001.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-pos-generic-retry.md`.

## 2026-09-21 — POS reviewable draft on header-total difference — READY FOR CI

- [x] A valid printed table may now populate the existing POS draft even when its line total differs from the invoice header.
- [x] The server preserves verified row economics when the table reconciles to its own total; it does not copy another supplier's quantities, prices or discounts.
- [x] The existing intake reconciliation flag records the difference and keeps the document in draft/approval review with stock and finalization blocked.
- [x] A table with corrupted row arithmetic or no usable lines remains fail-closed.
- [x] Targeted POS handoff/recovery/line-contract tests `45/45` PASS.
- [ ] Green CI → merge → deploy → retest MANTZAVAS 38001 and manually correct 1–2 codes if needed.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-pos-review-draft.md`.

## 2026-09-21 — Invoice Learning draft save separated from profile sync — READY FOR CI

- [x] «Αποθήκευση Προχείρου» writes the central workspace immediately without waiting for all supplier-profile/product-knowledge synchronization.
- [x] «Επιβεβαίωση & Εκμάθηση» continues to synchronize supplier rules centrally.
- [x] Added a 30-second request timeout and explicit error path so a stuck request cannot look like a silent save.
- [x] Targeted draft-save and POS contract tests PASS.
- [ ] Green CI → merge → deploy → save the 12-line draft again and verify it remains after refresh.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-draft-save.md`.
## 2026-09-21 — Κοινός καθαρισμός φωτογραφιών παραστατικών — CI PASS / AWAITING LAB

- [x] Μία κοινή ροή για φωτογραφίες από PC/κινητό/κάμερα σε νέο τιμολόγιο, πληρωμή ανοιχτών τιμολογίων, λοιπά έξοδα και κατάθεση.
- [x] Αυτόματο συντηρητικό κόψιμο, ίσιωμα, αφαίρεση σκιάς, ενίσχυση αντίθεσης και διατήρηση έως 3000 px πριν από Azure OCR/upload.
- [x] Έλεγχος ανάλυσης και θολώματος πριν επιτραπεί αποστολή· σαφές μήνυμα για νέα λήψη.
- [x] Τα PDF παραμένουν ανέπαφα. Καμία αλλαγή σε πληρωμή, πίστωση, duplicate guard, draft, stock, fiscal, accounting ή myDATA.
- [x] Client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → LAB με καθαρή/θολή φωτογραφία και PDF.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-shared-document-image-quality.md`.


## 2026-09-22 — Invoice Learning review navigation

- Enter μετακινεί το focus στο επόμενο ενεργό κελί.
- Η περιοχή ελέγχου δεν έχει κάθετη εσωτερική κύλιση.
- Επιβεβαιωμένες γραμμές πράσινες και απορριφθείσες κόκκινες.
- Δεν τροποποιήθηκε η λογική του «Επιβεβαίωση & Εκμάθηση».
- PR: #1061.


## 2026-09-22 — Invoice Learning no horizontal scroll

- Ο πίνακας ελέγχου προσαρμόζεται στο πλάτος της οθόνης χωρίς οριζόντια κύλιση.
- PR: επόμενη αλλαγή Invoice Learning.
## 2026-09-22 — Νέο είδος τιμολογίου: barcode και δεκαδικά — LAB PASS

- [x] **LAB FAIL**: σε LAB χωρίς Master Catalog η διόρθωση γραμμής δημιουργούσε νέο είδος χωρίς επιλογή barcode.
- [x] Προστέθηκαν τρεις ρητές επιλογές: υπάρχον barcode, αυτόματο εσωτερικό EAN-13 MyWorkStation ή προσωρινά χωρίς barcode.
- [x] Το νέο προϊόν δημιουργείται και αντιστοιχίζεται στην ίδια ασφαλή συναλλαγή πριν από την οριστικοποίηση.
- [x] Διορθώθηκε η διπλή επεξεργασία των πεδίων έκπτωσης σε ευρώ που μηδένιζε δεκαδικά με κόμμα· γίνονται δεκτά `1,50` και `1.50`.
- [x] Δεν γίνεται stock posting, πληρωμή, οριστικοποίηση, λογιστική ή myDATA από τη διόρθωση.
- [x] Πράσινο CI, merge και ακριβές Render deploy (`dc79662a`, PR #1074).
- [x] Πραγματικό LAB PASS: νέα είδη δημιουργήθηκαν χωρίς `404` και η παραγγελία `7460` οριστικοποιήθηκε σωστά.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-new-product-barcode-decimals.md`
## 2026-09-22 — Generate εσωτερικού barcode και LAB 404 — LAB PASS

- [x] LAB evidence: η επιλογή «Δημιουργία εσωτερικού MyWorkStation» δεν είχε κουμπί παραγωγής και η καταχώρηση νέου προϊόντος επέστρεφε `Σφάλμα 404`.
- [x] Προσθήκη `Generate Barcode` με άμεση εμφάνιση έγκυρου εσωτερικού EAN-13 και αποθήκευση του ίδιου κωδικού.
- [x] Διόρθωση client API prefix σε `/api/commerce/purchase-orders/.../ocr-lines/.../create-product`.
- [x] Πράσινο CI, merge και ακριβές Render deploy (`dc79662a`, PR #1074).
- [x] Νέα πραγματική δοκιμή χρήστη ολοκληρώθηκε χωρίς `404`; το εσωτερικό barcode αποθηκεύτηκε στο νέο προϊόν.
## 2026-09-22 — Πολυσέλιδο `AI_COMPLETE` resume — IN PROGRESS

- [x] LAB FAIL: ΤΑΛΩΣ `01T00125909`, 2 σελίδες, `252,06 €`, έμεινε πάνω από 10 λεπτά σε `AI_COMPLETE` με 0 είδη.
- [x] Εντοπίστηκε κενό ανάμεσα στην ολοκλήρωση AI και στο durable background handoff.
- [x] Το ίδιο `AI_COMPLETE` job γίνεται recoverable από τις ήδη αποθηκευμένες γραμμές, χωρίς νέο upload ή νέα πληρωμή.
- [x] Η πρώτη πραγματική επανάληψη αποκάλυψε ότι το BackOffice `fast-recover` παρέλειπε το `AI_COMPLETE`, παρότι startup/worker το δέχονταν.
- [x] Το refresh της λίστας επιλέγει πλέον `AI_COMPLETE`, το προωθεί σε `POS_QUEUED` και επανεκκινεί το ίδιο durable handoff.
- [x] Δεύτερο LAB FAIL: το recovery ξεκίνησε αλλά το παλιό handoff έκανε νέο `AI_RECHECK` και έληξε σε timeout.
- [x] Όταν υπάρχουν αποθηκευμένες AI γραμμές, το recovery τις επαναχρησιμοποιεί ρητά χωρίς δεύτερη κλήση OCR/AI.
- [x] Η αυτοΐαση ξεκινά απευθείας από το POS polling και καλύπτει stale `POS_PROCESSING`; δεν απαιτείται BackOffice refresh.
- [x] Στοχευμένα recovery tests `44/44` PASS και πλήρες server suite `1399/1399` PASS.
- [ ] Πράσινο CI, merge, ακριβές Render deploy και αυτόματη συνέχιση του υπάρχοντος job.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-gate3-multipage-ai-complete-resume.md`
## 2026-09-22 — Invoice Learning πολυσέλιδο upload — LAB FAIL / LOCAL PASS

- [x] Πραγματικό Gate 3 δείγμα ΤΑΛΩΣ: το Learning δέχεται μόνο μία φωτογραφία και δεν μπορεί να εκπαιδεύσει το δισέλιδο παραστατικό.
- [x] Post-deploy LAB FAIL: η σελίδα έμεινε λευκή από recursive `MutationObserver` μετά την αλλαγή της ετικέτας του κουμπιού.
- [x] Idempotent hotfix: η ετικέτα γράφεται μόνο όταν διαφέρει και δεν ξαναπυροδοτεί ατέρμονα observer loop.
- [x] Επιλογή έως 5 φωτογραφιών, διατήρηση σειράς και ενιαία Azure → AI ανάγνωση όλων των σελίδων.
- [x] Targeted `23/23`, πλήρες server suite `1402/1402`, client build και server build PASS.
- [ ] Πράσινο CI, merge, ακριβές deploy και LAB επανάληψη.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, χωρίς οριστικοποίηση/stock/νέα πληρωμή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-multipage-upload.md`.

## 2026-09-22 — TALOS χάρτης στηλών και ασφαλής επανέλεγχος — LOCAL PASS / AWAITING CI + LAB

- [x] LAB FAIL: μετά τον χάρτη στηλών, η ίδια δισέλιδη εικόνα επέστρεφε cached μετατοπισμένες στήλες (`0,78` αντί ποσότητας `6`) και λάθος σύνολα.
- [x] Το πραγματικό κουμπί αποθηκεύει πλέον κεντρικά μόνο τον χάρτη του επιλεγμένου προμηθευτή και εκκινεί αυτόματα νέο επανέλεγχο.
- [x] Δεν γίνεται bulk επανεγγραφή προφίλ: διατηρούνται όλες οι υπάρχουσες εκμαθήσεις, mappings/barcodes και τα προφίλ άλλων προμηθευτών.
- [x] Το cached αποτέλεσμα ξαναπερνά από την τρέχουσα κεντρική διάταξη και από νέο οικονομικό reconciliation.
- [x] Ο ρητός χειροκίνητος χάρτης υπερισχύει από λάθος provider column map μόνο όταν η τρέχουσα ωμή γραμμή επαληθεύεται μαθηματικά.
- [x] TALOS regression και πλήρες server suite `1407/1407` PASS· client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → Ctrl+F5 και επανέλεγχος των 2 σελίδων.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, πριν από οποιαδήποτε «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-talos-column-map-recheck.md`.

## 2026-09-23 — TALOS server-side printed-row verification — LOCAL PASS / AWAITING CI + LAB

- [x] LAB FAIL μετά το πρώτο deploy: το client-only repair δεν εφαρμοζόταν στο πραγματικό Azure/cached αποτέλεσμα και παρέμενε σύνολο `247,09 €`.
- [x] Η επαλήθευση μεταφέρθηκε στον server και εφαρμόζεται σε Azure, cached reread, OpenAI fallback και hybrid αποτέλεσμα.
- [x] Αυστηρό scope μόνο σε ΤΑΛΩΣ (`800802293` ή αναγνωρισμένη επωνυμία) και μόνο όταν ισοζυγίζουν `ποσότητα × τιμή = προ έκπτωσης` και `προ έκπτωσης − έκπτωση = καθαρή αξία`.
- [x] Regression για τις 13 λανθασμένες ποσότητες PASS· άλλοι προμηθευτές και μη ισοζυγισμένες γραμμές παραμένουν αμετάβλητοι.
- [x] Στοχευμένα `38/38`, πλήρες server suite `1413/1413` και client production build PASS.
- [x] Αυτόνομο browser LAB μετά το πρώτο server deploy: 44 γραμμές αλλά `218,66 € + 28,43 € = 247,09 €`; τρεις OCR παραλλαγές παρέμεναν (`4320394`, `4323717`, `4332684`).
- [x] Προστέθηκαν οι δύο επαληθεύσιμες επταψήφιες σειρές ανάγνωσης, fallback αναγνώρισης επωνυμίας ΤΑΛΩΣ και άθροιση ΦΠΑ με στρογγυλοποίηση ανά γραμμή όπως στο παραστατικό.
- [x] Δεύτερο αυτόνομο LAB στο `b0cae260`: 44 γραμμές, `218,66 € + 28,44 € = 247,10 €`· η αποτυχία απομονώθηκε σε μεταγενέστερο wrapper που ξανάγραφε 3 ήδη επαληθευμένες γραμμές με stale package-conversion τιμές.
- [x] Ο wrapper διατηρεί πλέον ολόκληρη την επαληθευμένη τυπωμένη οικονομική γραμμή μόνο όταν ισοζυγίζουν ποσότητα, τιμή, έκπτωση, καθαρή αξία και ΦΠΑ, χωρίς αλλαγή στις ήδη σωστές γραμμές.
- [x] Τρίτο αυτόνομο LAB στο `2cf30505`: το production bundle ήταν σωστό αλλά η ταυτότητα προμηθευτή συμπληρωνόταν από την εξωτερική upload ροή μετά το σύγχρονο result hook, οπότε ο αυστηρός TALOS verifier έκλεινε ασφαλώς χωρίς εφαρμογή.
- [x] Προστέθηκε deferred same-tick εφαρμογή πάνω στις ίδιες ήδη διαβασμένες ωμές γραμμές, αφού εμφανιστεί η ταυτότητα προμηθευτή· χωρίς νέο OCR και χωρίς διεύρυνση σε άλλον προμηθευτή.
- [x] Τέταρτο αυτόνομο LAB σε καθαρή καρτέλα στο `9053b68a`: `44 / 218,66 € / 28,44 € / 247,10 €`· η ταυτότητα προμηθευτή εμφανίζεται αργότερα από ένα event-loop tick.
- [x] Ο TALOS verifier περιμένει πλέον οριοθετημένα έως 5 δευτερόλεπτα για το ΑΦΜ/επωνυμία και διαφορετικά βγαίνει χωρίς αλλαγή· δεν εκτελεί νέο OCR και δεν εφαρμόζεται σε άλλον προμηθευτή.
- [x] Πέμπτο αυτόνομο LAB στο `77c64418`: το cached provider αποτέλεσμα παρέμενε χωρίς supplier identity και έδωσε `44 / 218,66 € / 28,44 € / 247,10 €`.
- [x] Προστέθηκε fail-closed server fallback μόνο για ακριβώς 44 γραμμές και τουλάχιστον 5 από 6 διακριτούς κωδικούς TALOS· δεν αποθηκεύει παλιές οικονομικές τιμές και συνεχίζει να αλλάζει μόνο μαθηματικά επαληθευμένες γραμμές.
- [x] Νέα θετικά και αρνητικά regressions PASS· πλήρες server suite `1416/1416` και client production build PASS.
- [x] Έκτο αυτόνομο LAB στο `89589d1a`: η ζωντανή φόρμα απέδειξε ότι η ταυτότητα TALOS επιστρέφεται ως top-level `supplierTaxId` / `supplierName`, ενώ ο server verifier διάβαζε μόνο nested `supplier`.
- [x] Ο verifier δέχεται πλέον και τα δύο response shapes με αμετάβλητο supplier scope και τον ίδιο αυστηρό μαθηματικό έλεγχο ανά γραμμή.
- [ ] Πράσινο CI → merge → ακριβές deploy → αυτόνομο browser LAB με τις 2 σελίδες.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, πριν από «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-talos-server-verified-rows.md`.

## 2026-09-23 — Workforce AI draft employee/week fix — AWAITING CI + LAB

- [x] LAB FAIL: AI preview DRAFT save returned «Δεν βρέθηκε εργαζόμενος Workforce v2.».
- [x] LAB FAIL: selected week 21/09–27/09 was previewed as 23/09–29/09.
- [x] Authenticated Workforce validation context restored for AI apply.
- [x] AI weeks normalized to Monday–Sunday with approved leave loaded from Monday.
- [x] Stale employees, inactive templates and out-of-week dates rejected before persistence.
- [x] Cross-store candidates require active `canSchedule` access.
- [x] Targeted tests, syntax and diff checks PASS.
- [ ] Green CI → merge → exact Render deploy → LAB retry of AI preview and DRAFT save.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-ai-draft-employee-week.md`.


## 2026-09-23 — Workforce εύκολη ροή και καθαρή εβδομάδα — AWAITING CI + LAB

- [x] Η αναλυτική εβδομάδα χωρίστηκε σε responsive κάρτες ημέρας και βάρδιας χωρίς επικαλύψεις.
- [x] Οι καθημερινές ενέργειες κρατούν αυτόματη αιτιολογία στο Audit χωρίς textarea.
- [x] Η δημοσίευση έχει μία σύντομη τελική επιβεβαίωση.
- [x] Μετά τη δημοσίευση ανοίγει αυτόματα η τελική αναλυτική εβδομάδα.
- [ ] Πράσινο CI → merge → ακριβές Render deploy → browser LAB της πλήρους ροής.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`.

- [x] Δεύτερη οπτική διόρθωση Workforce: modal σχεδόν πλήρους οθόνης και scoped overrides ώστε οι τρεις βάρδιες να μην συγχωνεύονται.
- [ ] Πράσινο CI → merge → ακριβές deploy → νέα οπτική δοκιμή εβδομαδιαίου προγράμματος.


## 2026-09-23 — TALOS εκπτώσεις κλάδου και κενή λιανική — LOCAL PASS / AWAITING CI + LAB

- [x] Η στήλη έκπτωσης κλάδου δεν περνά πλέον ως λιανική· η λιανική μένει κενή.
- [x] Η έκπτωση κλάδου και η επόμενη έκπτωση εφαρμόζονται διαδοχικά ως Εκπτ.1 και Εκπτ.2.
- [x] Η γραμμή `4323717` επαληθεύεται ως ποσότητα `6`, τιμή `1,02 €`, εκπτώσεις `18,40% + 12%` και καθαρή αξία `4,39 €`.
- [x] Πολυγραμμικές Azure εγγραφές διαβάζονται πλήρως και η αλλαγή παραμένει αυστηρά περιορισμένη στον TALOS.
- [x] Targeted `42/42`, πλήρες server suite `1417/1417` και client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → νέο upload των 2 σελίδων χωρίς «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-talos-industry-discounts-retail.md`.


## 2026-09-23 — Workforce Πρόγραμμα βαρδιών — PRODUCTION PASS / ΟΛΟΚΛΗΡΩΘΗΚΕ

- [x] AI preview και ασφαλής αποθήκευση ως νέα έκδοση DRAFT.
- [x] Επιλεγμένη εβδομάδα Δευτέρα–Κυριακή και πραγματικοί εργαζόμενοι/κανόνες/άδειες.
- [x] Έλεγχος 21/21 αναθέσεων, προεπισκόπηση, έγκριση και δημοσίευση.
- [x] Αυτόματες αιτιολογίες Audit στις καθημερινές ενέργειες και μία απλή επιβεβαίωση στη δημοσίευση.
- [x] Χωριστές ενότητες AI Πρόγραμμα, Βάρδιες, Άδειες & Ρεπό και Audit.
- [x] Μεγάλο responsive modal, ξεχωριστές ημέρες και βάρδιες, χωρίς επικαλύψεις.
- [x] Πράσινο CI #2813, PR #1100, merge και ακριβές Render deploy `5eb06f2c307029d044efe5cc8ea732b425c33154`.
- [x] USER VISUAL PASS από την τελική παραγωγική εικόνα.
- [ ] Επόμενο και μόνο επόμενο Workforce βήμα: ολοκλήρωση Παρουσιών / Κάρτας εργασίας και σύνδεση με POS.
- **ΜΗΝ επαναλάβετε την υλοποίηση ή την οπτική διόρθωση του Προγράμματος βαρδιών.**
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`.


## 2026-09-23 — Workforce Παρουσίες από POS — AWAITING CI + LAB

- [x] Άνοιγμα ταμειακής βάρδιας → αυτόματη έναρξη παρουσίας.
- [x] Κλείσιμο ταμειακής βάρδιας → αυτόματη λήξη και πραγματικές ώρες.
- [x] Σύνδεση με δημοσιευμένο πρόγραμμα, νυχτερινή βάρδια και έλεγχοι απόκλισης.
- [x] Πάνω από 8 ώρες → NEEDS_APPROVAL.
- [x] Διόρθωση late clock-in που έκλεινε πρόωρα την OPEN κατάσταση.
- [x] Audit POS_SHIFT με Cash Shift ID και προστασία από διπλή παρουσία.
- [ ] Πράσινο CI → merge → exact deploy → LAB με PIN εργαζομένου, άνοιγμα και κλείσιμο POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-attendance.md`.
## 2026-09-23 — TALOS POS learned mismatch — LAB FAIL / LOCAL PASS / AWAITING CI

- [x] Real POS draft `01T00125909`: 44 rows, `825,82 €` against `252,06 €`; repeating `13,00 €`/`14,69 €` values. No approval or deletion.
- [x] Production revision observed as `d426f2df`, behind main `d8abc2cf` and its later TALOS changes.
- [x] Read-only live Learning view: VAT `800802293`, learned number `00125909`, 44 rows, `223,05 € + 29,00 € = 252,05 €`. POS sent `01T00125909`, `252,06 €`: series mismatch skipped exact replay.
- [x] TALOS-only full-series alias enables exact learned replay if every row and the total pass; invalid learned economics stop without generic AI substitution.
- [x] Centrally learned complete-table profiles now block POS orders with mismatched totals across all stores. Learning reports shared success only after row reconciliation and central profile save complete.
- [x] Targeted exact-learning, profile-sync and POS contract tests `16/16` PASS; full server suite `1420/1420`, client build and diff check PASS.
- [ ] Green CI → merge → verify exact Render revision → inspect all 44 learned rows and reconcile `223,05 € + 29,01 € = 252,06 €`.
- [ ] LAB PASS only after one new POS submission creates a single correct BackOffice draft without manual refresh or resubmission; do not approve or post stock before reconciliation.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-talos-pos-learned-mismatch.md`.
## 2026-09-23 — Ενιαίος κανόνας POS έως 2 γραμμές προς έλεγχο — LAB FAIL / LOCAL TESTING

- [x] Ισχύει σε κάθε σελίδα και κατάστημα η απόφαση 19/09: έως 2 **υπαρκτές** αβέβαιες γραμμές ανά τιμολόγιο, με εμφανές «ΠΡΟΣ ΕΛΕΓΧΟ» και αιτία· ο χειριστής διορθώνει πριν από έγκριση. Καταγράφηκε στο root `AGENTS.md`.
- [x] Νέο LAB FAIL: LAB POS 2 Λεβεντόπουλος `ΤΑΜΠΧ14 15` παραμένει `POS_FAILED` με 0 είδη. Αυτό δεν είναι αποδεκτή περίπτωση δύο διορθώσεων. Ο παλιός αριθμός `ΤΔΛΠΧ14 15` δεν ταυτίζεται αυθαίρετα.
- [x] Η πρόσφατη καθολική πύλη απόλυτης συμφωνίας προσαρμόζεται: υποψήφιος πίνακας με έως 2 ρητά μη επαληθευμένες γραμμές και αποδεδειγμένη αριθμητική στις υπόλοιπες μπορεί να γίνει ασφαλές πρόχειρο προς έλεγχο. Κενός πίνακας, 3+ αβέβαιες ή αλλοιωμένη βεβαιωμένη γραμμή μπλοκάρονται.
- [x] Στοχευμένα tests (17 + 46) και client build πέρασαν τοπικά.
- [x] Πλήρης server suite: 1423/1423 passed.
- [ ] Πράσινο CI → merge → ακριβές deploy → μία νέα γνήσια υποβολή POS για LAB αποδοχή. Το παλιό draft μόνο για διάγνωση, χωρίς νέο upload/διαγραφή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-two-review-lines-central-rule.md`.

## 2026-09-23 — LAB POS 2 Λεβεντόπουλος: παλινδρόμηση ελέγχου συνόλου — LOCAL FIX

- [x] **Νεότερο LAB FAIL μετά το PR #1113 / deploy `35ab1b50`**: νέα υποβολή από LAB POS 2, `ΤΑΠΠΧ14 15`, 07:29, ξανά `POS_FAILED / POS_BACKGROUND_FAILED`, 0 αποθηκευμένες γραμμές. Η παλιά εξαίρεση κάλυπτε μόνο πλήρως επαληθευμένες γραμμές· το συνολικό supplier gate εξακολουθεί να πετάει την πραγματική υποψήφια ανάγνωση πριν από το πρόχειρο.
- [ ] Νέα διόρθωση: αποθήκευση των αναγνωρισμένων γραμμών ως DRAFT με ορατή απόκλιση συνόλου· το υπάρχον FINAL guard εμποδίζει posting/stock. Το LAB όριο έως δύο συγκεκριμένων γραμμών προς έλεγχο δεν έχει ακόμη επαληθευτεί και δεν δηλώνεται PASS.
- [ ] CI → merge → exact deploy → μία νέα πραγματική υποβολή από μπροστά στο POS. Δεν ανασταίνεται το προηγουμένως διαγραμμένο job και δεν ζητείται επανάληψη του ίδιου upload.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-leventopoulos-visible-draft-after-total-gate.md`.

- [x] Πραγματική επανάληψη `ΤΑΠΠΧ14 15`: `POS_FAILED / POS_BACKGROUND_AI_RECHECK`, 0 **αποθηκευμένα** είδη, ίδιο γενικό μήνυμα απαίτησης συμφωνίας συνόλου. Τα 0 αποθηκευμένα είδη δεν αποδεικνύουν μηδενική ανάγνωση OCR.
- [x] Ο έλεγχος που μπήκε με TALOS σταματούσε ακόμη και πλήρη πίνακα επαληθευμένο ως προς τη δική του αριθμητική, εφόσον το σύνολο κεφαλίδας είχε απόκλιση >5 €. Το πρόχειρο πρέπει να κρατά αυτές τις γραμμές για ορατή διόρθωση, χωρίς έγκριση ή απόθεμα.
- [x] Διευκρίνιση ιδιοκτήτη: το αποτυχημένο τιμολόγιο **διαγράφηκε ήδη από το POS**. Η δοκιμή πρέπει να ξαναγίνει από την μπροστινή κανονική ροή POS, χωρίς επαναφορά του διαγραμμένου job. Η σχεδιαζόμενη αλλαγή αυτόματης ανάκτησης αποσύρθηκε πριν από commit.
- [x] Πλήρης server suite: 1427 passed, 1 skipped, 0 failed.
- [ ] CI → merge → ακριβής παραγωγή → μία νέα υποβολή **από μπροστά στο POS** και έλεγχος τυπωμένων σειρών/συνόλου. LAB PASS μόνο με όλες τις φυσικές σειρές και έως δύο συγκεκριμένες προς έλεγχο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-leventopoulos-header-review-regression.md`.

## 2026-09-23 — Workforce εκτυπώσιμες κάρτες εργασίας — MERGED / AWAITING LAB

- [x] Κουμπί «Εκτύπωση κάρτας» δίπλα σε κάθε ενεργό εργαζόμενο του καταστήματος βάσης.
- [x] Προεπισκόπηση φυσικού μεγέθους με όνομα, κατάστημα και Code 128· χωρίς PIN ή οικονομικά/προσωπικά στοιχεία.
- [x] Σταθερός store-scoped κωδικός, ίδιος στην επανεκτύπωση και συμβατός με το υπάρχον POS attendance scan.
- [x] PR #1116, πράσινο CI #2852 και production revision `7395d95ff080b34d85a775697045b188be11e94f`.
- [ ] LAB: εκτύπωση και προσέλευση/αποχώρηση με σκανάρισμα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-printable-cards.md`.

## 2026-09-23 — POS σάρωση κάρτας εργασίας με κάμερα — LOCAL PASS / AWAITING CI + LAB

- [x] Νέο κουμπί «Σάρωση με κάμερα» μέσα στην επιλογή Κάρτα εργασίας.
- [x] Ανάγνωση Code 128 από κάμερα PC/tablet και αυτόματη αποστολή στην ίδια ασφαλή ροή προσέλευσης/αποχώρησης.
- [x] Καθαρό πλαίσιο στόχευσης και μήνυμα άδειας/συμβατότητας browser.
- [x] Αυτόματο κλείσιμο camera stream μετά τη σάρωση, την αλλαγή μεθόδου ή το κλείσιμο modal.
- [x] Διατηρούνται scanner, χειροκίνητη εισαγωγή και προσωπικό PIN.
- [ ] Πράσινο CI → merge → exact deploy → LAB σάρωση της εκτυπωμένης κάρτας από την κάμερα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-attendance-camera-scan.md`.

## 2026-09-23 — Λεβεντόπουλος πλήρης επανέλεγχος εικόνας — LAB FAIL / LOCAL PASS

- [x] Νεότερο LAB POS 2: 22 αποθηκευμένες γραμμές και 450,96 € έναντι 194,77 €, διπλές γραμμές και ποσότητες 1000· η κατώτερη επανανάγνωση 14 σειρών δεν αντικατέστησε το πρόχειρο. Καμία έγκριση ή απόθεμα.
- [x] Η πλήρης επαλήθευση της εικόνας αντικαθιστούσε προσωρινό πίνακα `{line,index}` και οι τυχόν επιτυχώς επαληθευμένες γραμμές χάνονταν. Διόρθωση μόνο για το κεντρικό προφίλ Λεβεντόπουλου μίας σελίδας, χωρίς αλλαγή σε άλλους προμηθευτές.
- [x] Στοχευμένα 54/54, πλήρης server suite 1433 passed / 1 skipped / 0 failed πάνω στο προηγούμενο main.
- [ ] Πράσινο CI → merge → ακριβές deploy → **νέα** κανονική υποβολή από POS. LAB PASS μόνο με όλες τις φυσικές σειρές, έως δύο συγκεκριμένες προς έλεγχο και σωστό σύνολο. Το υπάρχον πρόχειρο παραμένει αμετάβλητο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-leventopoulos-full-image-reread-target.md`.

## 2026-09-23 — Προστασία παλιών τιμολογίων ανά προμηθευτή — LOCAL TESTING / LAB NOT TESTED

- [x] Διατηρούνται οι υπάρχουσες δοκιμές για ΤΑΛΩΣ, Λεβεντόπουλο, Μαντζήλα `12729`, ΔΕΛΤΑ `28897` και Fresh Snack.
- [x] Ο κοινός έλεγχος απομόνωσης περιλαμβάνει πλέον καταγεγραμμένες οικονομικές γραμμές από Μαντζήλα, ΔΕΛΤΑ και Fresh Snack, με παραπλανητικό κείμενο άλλου προμηθευτή. Δεν αλλάζει η ανάγνωση.
- [ ] Πρωτότυπες εικόνες και ανεξάρτητα επιβεβαιωμένες αναμενόμενες γραμμές απαιτούνται πριν δηλωθεί πλήρης δοκιμή εικόνας προς πρόχειρο.
- [ ] Πράσινο CI → merge → ακριβές deploy → νέα κανονική υποβολή POS από διαφορετικούς προμηθευτές καθώς έρχονται. Τεστ και CI δεν είναι LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-cross-supplier-regression-matrix.md`.

## 2026-09-23 — ΚΟΝΤΟΓΙΑΝΝΗΣ 129979 — LAB OCR ECONOMICS PASS / MATCHING NOT VERIFIED

- [x] Νέα μία υποβολή LAB POS 2 από διαφορετικό προμηθευτή: ένδειξη POS «ολοκληρώθηκε σωστά στο BackOffice (2 γραμμές, οικονομικός έλεγχος OK)». Το τυπωμένο `129979` έχει δύο φυσικές σειρές: `0055` 10 × 1,25 = 12,50 €, `0320` 5 × 2,20 = 11,00 €, καθαρό 23,50 €, ΦΠΑ 13% / 3,06 €, πληρωτέο 26,56 €. Το αυτόματο πρόχειρο δείχνει ακριβώς δύο σειρές, τις ίδιες ποσότητες/τιμές/καθαρές αξίες/ΦΠΑ και 26,56 €, διαφορά 0,00 €. Νεότερη εικόνα λίστας: μία «Νέα παραγγελία», OCR job `AWAITING_APPROVAL / POS_BACKGROUND_COMPLETE`. Δεν έγινε δεύτερη υποβολή.
- [ ] Δεν φαίνεται στις διαθέσιμες εικόνες η κατάσταση αντιστοίχισης ειδών (`MATCHED`/`NEEDS_REVIEW`/`UNRESOLVED`). Μη δηλώνεται πλήρες LAB PASS κατά τον κανόνα δύο αβέβαιων γραμμών μέχρι αυτός ο έλεγχος. Δεν έγινε έγκριση, απόθεμα ή τελική καταχώριση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-kontogiannis-129979-lab-reading.md`.

## 2026-09-23 — ΚΑΡΑΜΟΛΕΓΚΟΣ ΙΑΑ-126-009370 — LAB FAIL / LOCAL TESTING

- [ ] **Νέο LAB FAIL, διαφορετικός προμηθευτής:** ΚΑΡΑΜΟΛΕΓΚΟΣ `ΙΑΑ-126-009370`, μία υποβολή LAB POS 2. Έξι τυπωμένες και έξι αποθηκευμένες γραμμές, τυπωμένο 27,44 €, πρόχειρο 37,03 €. Η γραμμή 521 τυπώνει 3 × 1,88 €, έκπτωση 20%, καθαρό 4,51 €· το πρόχειρο δείχνει έκπτωση 10%, καθαρό 13,00 €. Απέτυχε ο πλήρης επανέλεγχος και διατήρησε τις έξι λανθασμένες γραμμές. Δεν έγινε έγκριση ή ενημέρωση αποθήκης.
- [ ] **AWAITING LAB:** ο κοινός έλεγχος γραμμής επισημαίνει ασυμφωνία `ποσότητα × αρχική τιμή − εκπτώσεις` ως `ΠΡΟΣ ΕΛΕΓΧΟ` σε πρόχειρο, χωρίς να μαντεύει την έκπτωση από το σύνολο ή να αλλάζει τις πέντε σωστές γραμμές. Το νέο τιμολόγιο παραμένει LAB FAIL· απαιτείται επόμενη γνήσια υποβολή POS για αποδοχή.

## 2026-09-23 — Fresh Delicacies ΒΒ 6529 — LAB FAIL / LOCAL TESTING

- [x] Πραγματικό LAB POS 2: τυπωμένες 14 γραμμές / 47,02 €· αυτόματο πρόχειρο 16 γραμμές / 17.443,47 €. Πλήρης επανανάγνωση απέτυχε και διατήρησε το λανθασμένο πρόχειρο.
- [x] Στοχευμένη προστασία πριν από αποθήκευση ακραία διογκωμένου, μη επαληθευμένου πίνακα για προφίλ που απαιτεί πλήρη επαλήθευση. Το υπάρχον πρόχειρο δεν μεταβάλλεται.
- [ ] Πράσινο CI, merge, ακριβές deploy και νέα γνήσια υποβολή POS με διαφορετικό νέο τιμολόγιο. Η προστασία δεν είναι διόρθωση της ανάγνωσης ούτε LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-fresh-delicacies-bb6529-catastrophic-draft.md`.

- [x] CI #2873 PASS, PR #1125 merged as `16007363`; exact production `/api/health` revision confirmed. Containment deployed, **reading remains LAB FAIL**.
- [x] Recorded all 14 printed row equations (net 41,60 €, VAT 5,42 €, gross 47,02 €) and reproduced downstream amplification of one corrupt structured OCR row; raw provider/job row evidence is still unavailable.
- [ ] Inspect only the ΒΒ 6529 job's original and reread outputs before a shared parsing change; replay across different suppliers. The administrative browser inspection was auto-review rejected as overly broad and was not repeated.
- [ ] **AWAITING LAB:** bounded job-local evidence for a future successful complete reread records the original table, the provider candidates before recovery and the final table; it does not repair the existing ΒΒ 6529 draft or record a provider failure before it returns rows. The live LAB POS login is active, but the ΒΒ 6529 job's raw provider output remains unavailable. Do not infer LAB PASS from instrumentation.


## 2026-09-23 — POS camera scanner fallback — CI RECHECK

- [x] Το πραγματικό Store Mode δεν διαθέτει εγγενές `BarcodeDetector` και εμφάνιζε μήνυμα ασυμβατότητας.
- [x] Προστέθηκε ενσωματωμένος ZXing fallback decoder για Code 128, ενώ διατηρείται ο γρήγορος native decoder όπου υπάρχει.
- [x] Η κάμερα και ο decoder κλείνουν μετά από επιτυχία, αλλαγή μεθόδου ή κλείσιμο παραθύρου.
- [x] PIN, εξωτερικό scanner και χειροκίνητη εισαγωγή παραμένουν διαθέσιμα.
- [x] Τοπικά: camera regression 2/2 PASS, client production build PASS και diff check PASS.
- [ ] Αναμένεται νέο πλήρες CI και ακριβής επιβεβαίωση production revision.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-attendance-camera-scan.md`.

## 2026-09-23 — Κοινές δοκιμές τιμολογίων πολλών προμηθευτών — LOCAL PASS / LAB NOT TESTED

- [x] Καταγράφηκε πίνακας με πραγματικούς στόχους ΤΑΛΩΣ, Λεβεντόπουλου, MANTZILAS, DELTA και Fresh Snack, μαζί με το όριο έως δύο ορατών αβέβαιων γραμμών ανά 20 προϊόντα.
- [x] Νέο regression αποδεικνύει ότι η εκμάθηση ποσοτήτων ΤΑΛΩΣ δεν ξαναγράφει τέσσερις άλλους προμηθευτές και η επιλογή εικόνας Λεβεντόπουλου δεν αντικαθιστά τρεις άλλους πίνακες.
- [ ] Πλήρης suite, πράσινο CI, merge και έλεγχος ακριβούς deploy. Κατόπιν ξεχωριστό νέο πραγματικό POS παραστατικό από διαφορετικούς προμηθευτές, χωρίς επανυποβολές των παλιών τιμολογίων. Καμία δήλωση LAB PASS από αυτοματοποιημένα τεστ.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-cross-supplier-regression-matrix.md`.


## 2026-09-23 — POS camera preview startup race — LOCAL PASS / CI RECHECK

- [x] Πραγματικό LAB FAIL: το φωτάκι της κάμερας άναβε και έσβηνε αμέσως χωρίς να εμφανιστεί προεπισκόπηση.
- [x] Αιτία: το camera stream μπορούσε να ζητηθεί πριν το React δημιουργήσει το στοιχείο video.
- [x] Η προεπισκόπηση δημιουργείται πλέον συγχρονισμένα πριν από το `getUserMedia`, και μετά συνδέονται stream και decoder.
- [x] Camera regression 2/2 PASS, client production build PASS και diff check PASS.
- [ ] Αναμένεται πλήρες CI, merge, exact Render revision και νέα πραγματική δοκιμή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-attendance-camera-scan.md`.


## 2026-09-23 — POS Code 128 camera recognition hardening — LOCAL PASS / CI RECHECK

- [x] Πραγματικό LAB: η κάμερα μένει ανοικτή, αλλά δεν αναγνώρισε την κάρτα ακόμη και όταν το barcode κάλυπτε σωστά το πράσινο πλαίσιο.
- [x] Ο ZXing fallback περιορίστηκε αποκλειστικά σε Code 128 με `TRY_HARDER` και συχνότερες προσπάθειες.
- [x] Η κάμερα ζητά πλέον ιδανική ανάλυση 1920×1080 για καθαρότερες λεπτές μπάρες.
- [x] Η νέα εκτύπωση προσθέτει quiet zone 12 modules ανά πλευρά, πάνω από την απαίτηση Code 128.
- [x] Camera/card regression 5/5 PASS, client production build PASS και diff check PASS.
- [ ] Αναμένεται πλήρες CI, merge, exact Render revision και επανεκτύπωση κάρτας για πραγματικό LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-attendance-camera-scan.md`.
## 2026-09-23 — POS τιμολόγια μίας σελίδας με ασυμφωνία — LAB FAIL / LOCAL TESTING

- [x] Νέα πραγματικά LAB: ΝΤΑΒΟΥ 13/65,90 € → πρόχειρο 12/59,99 €· PANINI 14/75,60 € → πρόχειρο 14/39,92 € και λάθος αρχικό σύνολο 70,36 € από απόδειξη είσπραξης· ΠΡΑΤΤΕΙΝ 16/260,13 € → πρόχειρο 21/367,32 € με επιπλέον σειρές και λάθος ΦΠΑ.
- [x] Εντοπίστηκε ότι η συμπληρωματική ανάγνωση συγχωνεύεται με την πρώτη και μπορεί να αφήσει δύο εκδοχές της ίδιας φυσικής γραμμής όταν διαφέρει ο αναγνωρισμένος κωδικός.
- [x] Μόνο σε μία σελίδα με απόκλιση ενεργοποιείται ο υπάρχων αυστηρός πλήρης ελεγκτής. Αντικατάσταση γίνεται μόνο με αποδεδειγμένες γραμμές, τυπωμένες ομάδες ΦΠΑ και σύνολο POS· διαφορετικά διατηρείται ο υποψήφιος πίνακας. Τα ήδη συμφωνημένα και οι ειδικοί προμηθευτές διατηρούν τη διαδρομή τους.
- [ ] Πράσινο CI → merge → ακριβές deploy → νέο πραγματικό POS τιμολόγιο για LAB. Η επιλογή λάθος αρχικού συνόλου PANINI είναι χωριστό εκκρεμές πρόβλημα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-single-page-verified-table.md`.
## 2026-09-23 — Υποχρεωτικός κανόνας PASS → εγχειρίδιο + Workforce οδηγίες — PRODUCTION RULE

- [x] Κάθε πραγματικό LAB/LIVE/USER PASS αποθηκεύεται υποχρεωτικά στο `docs/manual/<module>/PASS.md` από όλες τις σελίδες/agents.
- [x] Το ίδιο PR ενημερώνει checkpoint και κεντρική ενεργή λίστα και περιλαμβάνει δοκιμασμένες οδηγίες χρήσης, δικαιώματα, όρια και troubleshooting.
- [x] CI/local/simulated PASS δεν γράφεται ως πραγματικό PASS.
- [x] Πριν από νέα εργασία διαβάζεται το σχετικό manual ώστε να μην επαναλαμβάνεται ολοκληρωμένη ροή.
- [x] Προστέθηκαν οι ολοκληρωμένες οδηγίες Workforce για πρόγραμμα ανά εργαζόμενο, Chat, εκτύπωση κάρτας και παρουσία μέσω PIN/QR/κάμερας/scanner.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-mandatory-pass-manual-workforce.md`.
- Manual: `docs/manual/workforce/PASS.md`.
## Gate 5 — G5-P08 LAB FAIL / διόρθωση σε ανάπτυξη, 25/09/2026

Μία πληρωμή προμηθευτή 46,92 € καταχωρίστηκε ως μετρητά POS2, παρά το τραπεζικό συνθετικό PDF. Μία εκκρεμότητα και έξοδα βάρδιας 0,20→47,12 €, POS1 αμετάβλητο. Μην επιβεβαιώσετε/επαναλάβετε την πληρωμή. Διορθώνεται η ψευδής επιβεβαίωση «Απόκλιση» και προστίθεται ασφαλής ακύρωση εκκρεμούς με αναστροφή. CI/deploy και LAB ακύρωση **AWAITING LAB**, Gate 5 OPEN. Λεπτομέρειες `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.
## Gate 5 — G5-P08 ακύρωση με ασυμφωνία προβολής, 25/09/2026

PR #1237 CI #3135 πράσινο/deploy `148c6b1`. Μία ακύρωση FRESH/ΒΒ 6529 46,92 € έδωσε ουρά ιδιοκτήτη 1→0 και κεντρικές δεσμεύσεις 46,92→0 €, αλλά BackOffice POS2 εξακολουθεί να δείχνει 47,12 € έξοδα/17 κινήσεις: η προβολή συμπεριλαμβάνει αναστραμμένη συναλλαγή. Frontend διόρθωση σε εξέλιξη, CI/deploy και νέο LAB retest εκκρεμούν. Μη γίνει δεύτερη πληρωμή. Gate 5 OPEN. Αναλυτικό checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.
## 2026-09-25 — Gate 4 φυσικό POS1 / Νοσηλευτές / SKU 2273 — LAB PASS πώλησης

- [x] Μία φυσική LAB πώληση μετρητών στις 13:15:08 Ελλάδας: 1 × ΝΕΡΟ ΠΙΠΙΛΑ 750ML / 2273, «Νοσηλευτής / Νοσοκόμος», 0,70 €. POS1 0→1 κινήσεις / 0,00→0,70 € μετρητά, POS2 16→16 / 7,50 € αμετάβλητο, stock −3→−4 και τελευταία πώληση ενημερώθηκε. Audit sale ID `a98ef87c-f076-47fb-aace-86e22252447d` / CASH 0,70 € και ολοκλήρωση με τον ίδιο δικαιούχο. Health πριν `52d3375d`, ακριβής φυσική revision μη τεκμηριωμένη. **Περιορισμένο PASS** πώλησης/ταμείου/stock/Audit· φυσική εκτύπωση/fiscal και συνολικό Gate 4 PENDING. Δεν επαναλαμβάνεται. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`.
## 2026-09-25 — Gate 4 τέσσερις δικαιούχοι LAB — περιορισμένο PASS ανάγνωσης

- [x] Στις ~13:35 read-only Master Catalog / LAB: Ιατροί 3×10% με ίδια τρία IDs/Audit, Νοσηλευτές 1×20% στο SKU 2273 με ίδιο ID/Audit, Προσωπικό 0 κανόνες/0 ιστορικό, Πελάτες 0 κανόνες/0 ιστορικό. Render `a3a1a040`. Μόνο τωρινό στιγμιότυπο, όχι POS συμπεριφορά των δύο τελευταίων ομάδων ή άλλο κατάστημα· συνολικό Gate 4 OPEN. Δεν έγινε νέα πώληση ή αποθήκευση. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`.
## 2026-09-25 — Gate 4 φυσικό POS2, Προσωπικό και Πελάτης — PASS καλαθιού

- [x] Εικόνες ιδιοκτήτη 14:04 Ελλάδας: στο ίδιο καλάθι 1 × ΝΕΡΟ ΠΙΠΙΛΑ 750ML / SKU 2273, Προσωπικό **0 ενεργές εκπτώσεις / 0,80 €** και Πελάτης **0 ενεργές εκπτώσεις / 0,80 €**. Ανανεωμένα POS1 **1 κίνηση / 0,70 €**, POS2 **16 κινήσεις / 7,50 €**, SKU 2273 **−4**, τελευταία πώληση 13:15:08 αμετάβλητα. Το συγκεκριμένο σκέλος ολοκληρώθηκε· δεν ξαναδοκιμάζεται. Checkout με αυτούς τους δικαιούχους, άλλο κατάστημα και συνολικό Gate 4 παραμένουν ανοικτά. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-master-audience-discount-awaiting-lab.md`.

## 2026-09-25 — Gate 4 φυσική πώληση Ιατρού και σύνδεση POS

- [x] LAB-POS-02 15:23: 2 × SKU 2269 / Ιατρός / CASH 0,90 €, βάρδια 16→17, μετρητά 7,00→7,90 €, stock −59→−61, Audit `b549a68c-ecb1-41a6-9298-6345e6ff2b89`. Η συγκεκριμένη πώληση δεν επαναλαμβάνεται.
- [x] LAB-POS-02 15:28: μία πώληση 1 × SKU 2269 / CASH 0,50 €, βάρδια 17→18, μετρητά 7,90→8,40 €, stock −61→−62, Audit `128c894d-b9b8-4a2f-b145-1329b99531e1`. Η μία καταχώριση επιβεβαιώθηκε, όχι ο χρόνος αποθήκευσης offline.
- [ ] Η ένδειξη «Συνδεδεμένο» παρέμενε σταθερή ενώ ο Chrome έδειχνε `ERR_FAILED` με Wi-Fi off. PR #1269 ελέγχει πραγματικά `/api/health` και παραμένει AWAITING CI/DEPLOY/LAB. Μία φυσική δοκιμή offline ουράς/replay αφού εγκατασταθεί: ένδειξη εκτός σύνδεσης, τοπικός κωδικός πριν τη σύνδεση, μία μόνο κίνηση βάρδιας/stock/Audit μετά. Συνολικό Gate 4 PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-offline-connectivity-awaiting-lab.md`.
## 2026-09-25 — Gate 4 offline διπλά IDs — AWAITING LAB

- [x] Φυσικό POS02 16:07 εκτός σύνδεσης: τοπικό μήνυμα 0,50 € `4437bc8e`. Μετά reconnect νέα βάρδια 0→1 κίνηση / CASH 0→0,50 €, SKU2269 −62→−63 και Audit sale `1434f91d-6f6d-4658-8a46-9aff14907ec3`, αλλά συνδεδεμένο SYNCED client ID `48d724fd`. Το `4437bc8e` παραμένει PENDING/0 προσπάθειες. Προηγούμενο ζεύγος 15:28: SYNCED `f111b785` / PENDING `d203e422`. Συνολικά 2 PENDING, 2 SYNCED, 0 replay. Δεν θεωρούμε PASS ή αφαιρούμε PENDING χωρίς απόδειξη.
- [ ] Προστασία checkout από δεύτερο πάτημα, άρνηση γρήγορης ίδιας offline καταχώρισης και διατήρηση νέων εγγραφών κατά τον συγχρονισμό: AWAITING CI/DEPLOY/LAB. Καμία νέα πώληση μέχρι να ελεγχθούν οι τοπικές ουρές και τα δύο PENDING. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-offline-dual-id-awaiting-lab.md`.

## 2026-09-25 — Gate 5 αποτέλεσμα API και σωστή πληρωμή ιδιοκτήτη

- [x] Στο deployed `ee90a74`, μία σωστή τραπεζική πληρωμή ιδιοκτήτη 0,10 € με αναγνώσιμο PDF μείωσε τη ΔΑ0011467 **1.380,24→1.380,14 €**, χωρίς αλλαγή στη βάρδια POS2 (**1 κίνηση / 0,50 €**) και χωρίς ουρά έγκρισης (**0,00 €**). G5-P09 LAB PASS, δεν επαναλαμβάνεται.
- [x] Λάθος ποσό και λάθος τρόπος PDF απορρίφθηκαν χωρίς αλλαγή οφειλής. Υπερπληρωμή 1.380,15 € επίσης δεν καταχωρίστηκε.
- [ ] Μη αναγνωρίσιμο PDF πέρασε λανθασμένα δύο φορές από 0,01 €: αρχικά ως parser `null` και στο πρώτο fix ως αντικείμενο με κενά πεδία. Η οφειλή αναμένεται **1.380,14→1.380,12 €**. Το δεύτερο fix απαιτεί ρητά ποσό, τρόπο και παραστατικό πριν από άμεση επιβεβαίωση ιδιοκτήτη· AWAITING CI/DEPLOY/LAB. Διπλή υποβολή και ροή χειριστή POS παραμένουν OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate5-readable-payment-proof-awaiting-lab.md`.
- [ ] Η πρώτη live ροή χειριστή POS αποκάλυψε ότι το ποσό μηδενιζόταν επειδή η ασταθής `api` prop επανεκκινούσε τη φόρτωση τιμολογίων σε κάθε render. Διόρθωση με `useCallback` και regression test: targeted 6/6 και production build PASS. PR #1282 / CI #3244 απέτυχε μόνο επειδή έλειπε αυτή η υποχρεωτική ενημέρωση checkpoint· νέο CI/deploy και μία επανάληψη POS πληρωμής εκκρεμούν. Gate 5 OPEN.

## 2026-09-25 — Gate 4 ανάγνωση τοπικής offline ουράς — PASS

- [x] Το ίδιο φυσικό LAB POS 2 έδειξε «Τοπική ουρά: 0» στις 16:45 μετά το deploy. Η offline πώληση καταχωρίστηκε ακριβώς μία φορά, με μία κίνηση βάρδιας και μία μεταβολή stock. Τα PENDING `4437bc8e`, `d203e422` με 0 προσπάθειες παραμένουν μόνο ως ιστορικό audit exception· δεν διαγράφονται και δεν επαναποστέλλονται. Δεν απαιτείται νέα πώληση. **Gate 4 PASS.** Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-offline-local-queue-readback-awaiting-lab.md`.
- [x] PR #1291: η τελική κατάσταση δημοσιεύεται κεντρικά ως **PASS / ΟΛΟΚΛΗΡΩΜΕΝΟ** σε roadmap, manual, active list, checkpoint και PDF. Οι παλιές ενδείξεις Gate 4 `OPEN`/`PENDING` είναι ιστορικές και δεν δημιουργούν νέα εργασία.

## 2026-09-25 — Gate 7 αναφορές και στατιστικά — ΑΝΑΤΕΘΗΚΕ / OPEN

- [x] **Περιορισμένο LAB PASS 25/09/2026:** PR #1280 / deploy `be8be8f0`. Read-only επανέλεγχος στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, χωρίς νέα οικονομική κίνηση. Η ώρα πώλησης εμφανίστηκε 16:07:55 Ελλάδας, οι ενεργές βάρδιες `MAIN` και `LAB-POS-02` εμφανίστηκαν μαζί, και η βάρδια POS2 έδειξε `ΝΕΡΟ 500ML` ποσότητα 1 / έκπτωση 0,00 € / τζίρο 0,50 € και χειριστή `LAB POS 2` / 1 πώληση / 0,50 €. Ελληνικές επικεφαλίδες PASS. Η ίδια συμφωνία δεν επαναλαμβάνεται.
- [ ] Συνολικό Gate 7 παραμένει `OPEN`: εκκρεμούν τελικά πραγματικά δεδομένα Gate 3/5/6 και πλήρης κάλυψη ακυρώσεων, voids, επιστροφών, εκπτώσεων, τρόπων πληρωμής και stock/audit. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate7-reports-reconciliation-assignment.md`, manual `docs/manual/reports/PASS.md`.

## 2026-09-25 — Gate 6 Online παραγγελίες και Delivery — ΑΝΑΤΕΘΗΚΕ / OPEN

- [ ] **Νεότερο πραγματικό LAB αποτέλεσμα 26/09 — FAIL:** η `ONL-001` δημιούργησε πώληση 0,50 € / `SALE_CASH` στη λανθασμένη `MAIN` πριν αποτύχει ο τελικός handoff. Η παραγγελία έμεινε `OUT_FOR_DELIVERY`, terminal/fiscal/stock έμειναν λανθασμένα ή ελλιπή και η `MAIN` ξανάνοιξε παράλληλα με την `LAB-POS-02`. Δεν επαναλαμβάνεται πληρωμή της ίδιας παραγγελίας. Στενή fail-closed διόρθωση στο `agent/gate6-terminal-fail-closed-20260926`. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate6-terminal-fail-closed.md`. **Gate 6 OPEN.**
- [ ] Ανάθεση στο `agent/gate6-online-delivery-20260925`. Το Gate 6 είναι η γενική ροή Online Ordering/Delivery του MyWorkStation και **δεν είναι** η εξωτερική σύνδεση efood/Pelican.
- [ ] Scope: σωστό κατάστημα και ξεχωριστό online/delivery ταμείο, ετεροχρονισμένη χρέωση, ακριβώς μία αφαίρεση αποθέματος, idempotent retry/διπλή παραγγελία, ακύρωση/απόρριψη/ολοκλήρωση και συμφωνία POS–BackOffice–Audit.
- [ ] Υπάρχει παλιό CI/E2E τεκμήριο δημιουργίας→duplicate retry→accept→prepare→ready→POS checkout→deliver με μία μείωση stock, αλλά δεν ισοδυναμεί με νέο πραγματικό LAB PASS. Πρώτα γίνεται απογραφή του σημερινού production και μετά συγκεντρωτική φυσική δοκιμή με πλήρες πριν/μετά.
- [ ] efood/Pelican και credentials παραμένουν ανεξάρτητα στην ειδική σελίδα και δεν μπλοκάρουν το Gate 6.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate6-online-delivery-assignment.md`.
- [ ] Στην πρώτη εγκεκριμένη πραγματική υποβολή το checkout σταμάτησε πριν από το API λόγω σύγκρουσης του πεδίου `name` με το `window.name`. Δεν δημιουργήθηκε παραγγελία/πώληση/stock κίνηση. Έγινε ρητή σύνδεση όλων των πεδίων με `document.getElementById` και regression test· `online-store-*.test.js` **22 PASS / 0 FAIL**. Αναμένονται deploy και μία μόνο πλήρης φυσική ροή. **Gate 6 OPEN.**
- [ ] Μετά το checkout deploy, η πραγματική υποβολή έφτασε στο API αλλά επέστρεψε HTTP 500 χωρίς επιτυχή δημιουργία. Προστέθηκε ασφαλές production diagnostic ανά στάδιο συναλλαγής (`LOCK/SERIAL/ORDER/LINES/EVENT`) πριν από νέα απόπειρα. **Καμία επιβεβαιωμένη παραγγελία ή οικονομική κίνηση.**
- [ ] Το production diagnostic απομόνωσε το 500 στο `LOCK`: το PostgreSQL advisory lock επέστρεφε `void` μέσω `$queryRaw`. Διορθώθηκε σε `$executeRaw`. Αναμένεται deploy και retry με την ίδια idempotency key.
- [x] **Μερικό πραγματικό PASS δημιουργίας/idempotency:** δημιουργήθηκε μία μόνο `ONL-001` (`70378da9-5753-42d6-81c9-6f2add0e6ea7`), 1 × ΝΕΡΟ 500ML SKU 2269, 0,50 €, Delivery, CARD, NEW. Retry με την ίδια key επέστρεψε `duplicate:true` και το ίδιο id. Το POS βρέθηκε αποσυνδεδεμένο στην οθόνη PIN· εκκρεμεί η πλήρης αλυσίδα POS→checkout→delivery→stock/βάρδια/Audit. **Gate 6 OPEN.**
- [ ] Μετά την είσοδο στο LAB POS 2 βρέθηκε πραγματικό UI blocker: ο Online Orders launcher καλούσε ανύπαρκτη `isKat()` και δεν εμφάνιζε καθόλου το κουμπί. Προστέθηκε ρητός έλεγχος ενεργής store session και regression test. Αναμένονται CI/deploy και επανέλεγχος της `ONL-001`.
- [ ] Πρώτος φυσικός έλεγχος: βρέθηκαν λανθασμένη ώρα UTC και ελλιπής λίστα βαρδιών λόγω terminal-scoped ανάγνωσης. Υλοποιήθηκαν ώρα Ελλάδας, ασφαλές store-wide BackOffice reporting, ελληνικές επικεφαλίδες και αναλυτικές ενότητες προϊόντων/χειριστών. Τοπικά 13/13 tests και production build PASS· αναμένονται πράσινο CI, deploy και φυσικός επανέλεγχος. Δεν δημιουργήθηκε νέα πώληση.

## 25/09/2026 — Gate 3: ΔΕΛΤΑ 30721 κεντρικό προφίλ POS + BackOffice / LOCAL FULL PASS, AWAITING CI-LAB

Πραγματικό έντυπο ΘΕΟΔΩΡΟΠΟΥΛΟΣ ΑΓΓΕΛΟΣ ΕΠΑΜΕΙΝΩΝΔΑΣ/066880843, προϊόντα ΔΕΛΤΑ, 30721: 18 γραμμές, ποσότητα 85, 107,03 € + 13,91 € = 120,94 €. POS πρόχειρο 17 γραμμές/127,70 € επειδή μικτά ποσά μπήκαν ως καθαρά και προστέθηκε ξανά ΦΠΑ· background `POS_FAILED` παρότι υπήρχε πρόχειρο. Learning 17 γραμμές/115,66 €, λάθος κεφαλίδα και stale οικονομικά μετά τη διόρθωση. Στενή διόρθωση: VAT-inclusive shift, διατήρηση πρόχειρου σε review, πραγματικός επανυπολογισμός και κεντρικός versioned χάρτης 12 στηλών ανά ΑΦΜ με οικογένεια/διανομέα, ρητή εμβέλεια όλων των καταστημάτων για POS + BackOffice. Προστέθηκε αναγνώριση της τυπωμένης μονάδας `TM`. Πλήρης αναπαραγωγή 18/85/107,03/120,94 σε δύο καταστήματα, 1.503 server tests PASS / 0 FAIL / 1 SKIP και production build PASS. Δεν έγινε Confirm/Learn, έγκριση, stock ή πληρωμή. CI/deploy/LAB readback εκκρεμούν· νέο διαφορετικό POS τιμολόγιο απαιτείται για τελική αποδοχή. Gate3 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-delta-30721-learning-economics.md`.


## 2026-09-25 — Invoice Learning central profile activation hotfix

- [x] Διορθώθηκε το production bootstrap ώστε να καλεί την υπαρκτή `installMaster()` και να ενεργοποιεί τη ρύθμιση εμπορικής οικογένειας/στηλών.
- [x] Η κεντρική ρύθμιση παραμένει κοινή για POS και BackOffice όλων των καταστημάτων, χωρίς μεταφορά οικονομικών στοιχείων μεταξύ διαφορετικών ΑΦΜ.
- [x] Ο επανέλεγχος στέλνει πλέον το επιβεβαιωμένο ΑΦΜ/επωνυμία στον server, ώστε brand-only OCR όπως «ΔΕΛΤΑ» να εφαρμόζει το σωστό κεντρικό προφίλ εκδότη.
- [x] Το OpenAI fallback επιστρέφει υποχρεωτικά πιστή `rawText` μεταγραφή κάθε φυσικής γραμμής, ώστε οι δηλωμένες στήλες να εφαρμόζονται και όταν το Azure δεν δώσει ασφαλές αποτέλεσμα.

## 2026-09-25 — Invoice Learning επαναληπτικός έλεγχος timeout — AWAITING CI/DEPLOY/LAB

- [x] Στο πραγματικό ΔΕΛΤΑ 30721 ο πρώτος μαθηματικά πλήρης AI έλεγχος ολοκληρωνόταν, αλλά η σελίδα τον απέρριπτε όταν ο επόμενος από τους τρεις ελέγχους σταθερότητας έληγε σε timeout.
- [x] Η σελίδα διατηρεί πλέον μόνο προηγούμενο αποτέλεσμα με `completeness.complete=true`, το εμφανίζει με σαφή προειδοποίηση για χειροκίνητο έλεγχο και δεν χρησιμοποιεί ποτέ μερικό αποτέλεσμα ως fallback.
- [x] Η fail-closed ροή POS, η επιβεβαίωση/εκμάθηση, το stock και η πληρωμή δεν αλλάζουν.
- [x] Τοπικά: 42 invoice/profile tests PASS, 7 stability/timeout/multipage tests PASS και client build PASS.
- [ ] Απαιτούνται πράσινο CI, ακριβές production deploy και νέο readback του ίδιου τιμολογίου για επιβεβαίωση 18 γραμμών / ποσότητα 85 / 107,03 € + 13,91 € = 120,94 €. Δεν πατιέται Confirm/Learn και δεν αποστέλλεται στο POS πριν τη συμφωνία.
- [x] Production readback στο `760a123d`: δύο μερικές αναγνώσεις ολοκληρώθηκαν, ο επόμενος OpenAI έλεγχος έληξε σε timeout και το πλήρες-result safeguard τις απέρριψε σωστά. Νέα στενή διόρθωση εμφανίζει τις ασφαλείς μερικές Azure γραμμές μόνο για εποπτευόμενη διόρθωση, χωρίς να τις χαρακτηρίζει πλήρεις ή σταθερές. AWAITING CI/DEPLOY/LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-invoice-learning-stability-timeout-fallback.md`.
- [x] Production `9ec2d603`: το μερικό εποπτευόμενο πρόχειρο εμφανίστηκε σωστά με 18 γραμμές. Στη διόρθωση βρέθηκε parser bug που μετέτρεπε τα `2.485` και `2.006` σε χιλιάδες. Η στενή διόρθωση διατηρεί τα τρία δεκαδικά· 115 σχετικά tests και client production build PASS. Δεν έγινε Save, Confirm/Learn ή POS. AWAITING CI/DEPLOY/LAB.
## 25/09/2026 — Gate 5 πληρωμές, πιστώσεις και συμφωνίες — LAB PASS

Στο `MYWORKSTATION LAB` ολοκληρώθηκε η ενιαία πραγματική αποδοχή των G5-P02–P10 μετά τα PR #1279 (`1a07f656`) και #1282 (`93889ec`). Επιβεβαιώθηκαν ιδιοκτήτης χωρίς δεύτερη έγκριση, χειριστής POS με μία έγκριση ιδιοκτήτη, σωστό αναγνώσιμο PDF, απόρριψη λάθος ποσού/μεθόδου, μη αναγνώσιμου PDF και υπερπληρωμής, καθώς και προστασία διπλού click. Στην τελική διπλή υποβολή 0,01 € η ΔΑ0011467 μειώθηκε ακριβώς **1.380,02→1.380,01 €** μία φορά. Τελικοί μάρτυρες: ουρά **0 / 0,00 €**, εικονική τράπεζα **−43,85 € / αναμονή 0,00 €**, `MAIN` **0 / 0,00 €**, `LAB-POS-02` **1 / 0,50 €**. Καμία πραγματική τραπεζική/φορολογική συναλλαγή. **PASS GATE 5**· αφαιρέθηκε από το pending roadmap και δεν επαναλαμβάνεται χωρίς νέο πραγματικό FAIL ή νέα απαίτηση. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate5-readable-payment-proof-awaiting-lab.md`, manual `docs/manual/payments/PASS.md`.
## 25/09/2026 — Gate 8 Χειριστές, ρόλοι και τελική ασφάλεια — ΑΝΑΤΕΘΗΚΕ

Ανάθεση στο `agent/gate8-roles-security-20260925`. Scope: Super Admin, Owner, Manager και Employee/χειριστής POS, PIN/κάρτα χωρίς καθαρή αποθήκευση, tenant/store/module isolation, store override, λήξη άδειας/συνδρομής, ανάκληση συνεδριών και Audit δικαιωμάτων. Πρώτα γίνεται read-only απογραφή και κάθε σκέλος χαρακτηρίζεται PASS/FAIL/NOT TESTED· δεν αλλάζουν χρήστες, PIN, άδειες ή modules χωρίς συγκεκριμένο τεκμηριωμένο κενό. Gate 3, Gate 4 και Gate 6 παραμένουν στις άλλες ανατεθειμένες σελίδες. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate8-roles-security-assignment.md`.

## 25/09/2026 — Gate 7 Αναφορές και στατιστικά — PASS / ΚΛΕΙΔΩΜΕΝΟ

Ρητή τελική επιβεβαίωση ιδιοκτήτη: το Gate 7 έχει ολοκληρωθεί με **PASS**, δεν επιτρέπεται να αναληφθεί ή να επαναληφθεί και αφαιρείται από την ενεργή pending λίστα. Η παλαιότερη ένδειξη «ΠΕΡΙΟΡΙΣΜΕΝΟ LAB PASS / OPEN» είναι ιστορική και superseded. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate7-reports-reconciliation-assignment.md`, manual `docs/manual/reports/PASS.md`.
## 25/09/2026 — Gate 8 BackOffice οπτική απλοποίηση — PRODUCTION VISUAL PASS

Στο Gate 8 εντοπίστηκαν δύο πραγματικά οπτικά FAIL: κυριολεκτικό `\\n` στη μπάρα modules μεταξύ «RBS Observer» και «Κάμερες / Video Audit», και στενή καρτέλα εργαζομένου 500 px με δύσχρηστη κύλιση. PR #1292 / CI #3271 / ακριβές Render `96fb51f6`: η παραγωγική μπάρα δεν εμφανίζει πλέον το escaped κείμενο και η πραγματική καρτέλα μετρήθηκε στα 860 px, σε δύο στήλες 397 px, editor 812 px και χωρίς οριζόντια υπερχείλιση. **PRODUCTION VISUAL PASS** χωρίς αποθήκευση δεδομένων. Το συνολικό Gate 8 παραμένει OPEN για ρόλους/απομόνωση/άδειες/PIN/συνεδρίες/Audit. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate8-roles-security-assignment.md`.

## 25/09/2026 — Gate 8 λήξη άδειας και Online Store — LOCAL FIX / AWAITING CI

Πραγματικό LAB: προσωρινό κλείσιμο `ONLINE_ORDERING` έδωσε 20→19 modules και σωστή απόρριψη, μετά πλήρη επαναφορά 20/20. Προσωρινό `ACTIVE`→`EXPIRED` έκοψε σωστά Store Mode/POS, αλλά το public Online Store παρέμεινε ενεργό: **LAB FAIL**. Η αρχική κατάσταση αποκαταστάθηκε (`ACTIVE`, Enterprise, 20 modules, χωρίς λήξη, ΚΑΤ αμετάβλητο). Στενή διόρθωση εφαρμόζει company license και store override και στις δύο public online routes. CI/deploy/retest εκκρεμούν· Gate 8 OPEN.
## 2026-09-25 — Gate 6 Online Store stock policy — AWAITING CI

- [x] Στο LAB Online Store δημοσιεύτηκε μόνο το «ΝΕΡΟ 500ML» (SKU 2269, 0,50 €), χωρίς δημιουργία παραγγελίας ή πώλησης.
- [x] Διορθώθηκε η ροή `catalog-modifiers`: όταν ο «Έλεγχος διαθέσιμου stock» είναι ανενεργός, αρνητικό stock δεν εμφανίζει ψευδώς το προϊόν ως «Εξαντλήθηκε» και δεν μπλοκάρει το submit. Όταν είναι ενεργός, η ποσότητα ελέγχεται server-side.
- [x] Τοπικό τεχνικό αποτέλεσμα Gate 6: **68 PASS / 0 FAIL**· πακέτο `online-store-*.test.js`: **21 PASS / 0 FAIL**.
- [ ] PR #1297 / CI σε αναμονή. Μετά από πράσινο deploy θα γίνει μία συγκεντρωτική φυσική παραγγελία με πλήρες πριν/μετά σε POS, stock και Audit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-gate6-online-delivery-assignment.md`.


## 25/09/2026 — Gate 8 lifecycle χειριστών και κεντρικό Audit — CI PENDING

Πραγματικό LAB: προσωρινός Manager δημιουργήθηκε, μπήκε με PIN στο σωστό κατάστημα/POS και μετά την απενεργοποίηση η ενεργή συνεδρία ανακλήθηκε αμέσως· ο λογαριασμός διατηρήθηκε ανενεργός για ιστορικό. Οι πραγματικοί Employee/Seller έχουν POS πρόσβαση χωρίς BackOffice/Power User, ενώ PIN και πλήρης κάρτα δεν αποκαλύπτονται στο UI. Εντοπίστηκε πραγματικό FAIL: τα ήδη καταγεγραμμένα lifecycle rows δεν εμφανίζονταν στο κεντρικό Audit. PR #1298 προσθέτει δημιουργία, αλλαγή προφίλ/ρόλου, αλλαγή PIN, είσοδο PIN/κάρτας, έξοδο και απενεργοποίηση με αυστηρή allow-list metadata χωρίς PIN/hashes/πλήρη κάρτα. 13/13 στοχευμένα tests PASS· πλήρες CI, deploy και production readback εκκρεμούν. Owner cross-tenant και πραγματική λήξη άδειας/store override παραμένουν NOT TESTED. Συνολικό Gate 8 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate8-operator-lifecycle-audit.md`.

## 25/09/2026 — Invoice Learning ΔΕΛΤΑ visual reading order — AWAITING CI

- [x] Επιβεβαιώθηκε ότι η επιχειρησιακή ανοχή έως **0,05 €** είναι PASS και διαφορά **0,01 €** δεν μπλοκάρει το POS.
- [x] Βρέθηκε η πραγματική αιτία της χειροκίνητης διόρθωσης: ο αποθηκευμένος χάρτης ΔΕΛΤΑ δεν εφαρμοζόταν όταν το Azure επέστρεφε τις στήλες σε οπτική σειρά.
- [x] Η νέα ανάκτηση είναι fail-closed και απαιτεί συμφωνία καθαρής και μικτής εξίσωσης κάθε γραμμής.
- [x] Το πραγματικό δείγμα 30721 περνά regression με **18 γραμμές / ποσότητα 85 / 107,03 € / 120,94 €**.
- [x] Πλήρες server suite **1.517 PASS / 0 FAIL / 1 SKIP** και production client build PASS.
- [ ] PR #1299: νέο CI, merge, ακριβές deploy και production readback χωρίς χειροκίνητη διόρθωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-invoice-learning-delta-reading-order.md`.

## 25/09/2026 — Invoice Learning επιβεβαιωμένη ταυτότητα εγγράφου — AWAITING CI

- [x] Το production readback του 30721 συμφώνησε σε **18 γραμμές / ποσότητα 85 / 107,03 € + 13,91 € = 120,94 €** και η κεντρική εκμάθηση αποθηκεύτηκε.
- [x] Διορθώθηκε ο μοναδικός OCR κωδικός `751454 → 751459` ως κανόνας του προμηθευτή `066880843`.
- [x] Το Confirm/Learn συγχρονίζει πλέον τον συμπληρωμένο αριθμό και την ημερομηνία τιμολογίου πριν από την κεντρική αποθήκευση· 46 στοχευμένοι έλεγχοι και client build PASS.
- [ ] Μετά το deploy επαναβεβαιώνεται η ίδια εγγραφή ως `30721`: πρέπει να παραμείνουν **9** learned documents και να μην υπάρξει stock, πληρωμή ή αποστολή POS.
- [x] Production `0b6b9652`: η εγγραφή εμφανίζεται πλέον ως `30721` / `LEARNED` και το πλήθος παρέμεινε **9**.
- [ ] Τελικό idempotency hotfix: οι μετρητές documents/lines του προφίλ επανυπολογίζονται από τις πραγματικές learned εγγραφές, ώστε επαναβεβαίωση του ίδιου id να μην τους αυξάνει και να διορθώνει τυχόν προηγούμενη υπερμέτρηση.
- [x] PR #1306 / CI #3305 / production `951c79f8`: τελική επαναβεβαίωση `30721` / `LEARNED`, με **9** εγγραφές και idempotent μετρητές.
- [ ] Πραγματικό LAB POS 2: η έγκυρη PIN συνεδρία χάθηκε όταν ένα παράλληλο αίτημα της ροής προμηθευτών επέστρεψε γενικό `401`. Το auth hotfix κρατά το token σε προσωρινή αστοχία validation και αποσυνδέει μόνο για ρητά άκυρη/ληγμένη/ανακλημένη συνεδρία. Μετά CI/deploy επαναλαμβάνεται μία φορά μόνο η δημιουργία πρόχειρου — χωρίς πληρωμή ή stock.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-25-invoice-learning-delta-reading-order.md`.

## 25/09/2026 — Gate 8 ενιαίο production checkpoint — 9/11 PASS, OPEN

PR #1298 / CI #3285 / Render `41e044eb`: το πραγματικό κεντρικό Audit εμφανίζει δημιουργία, PIN login και απενεργοποίηση χειριστή χωρίς PIN/hash/πλήρη κάρτα. PR #1301 / CI #3292 / Render `dd8be575`: προσωρινή `EXPIRED` άδεια απορρίπτει πλέον και POS και public Online Store. Η αρχική κατάσταση αποκαταστάθηκε πλήρως: LAB `ACTIVE`, Enterprise, 20 modules, χωρίς λήξη, Online Store/POS ενεργά και `TABLE_SERVICE` **ΑΝΕΝΕΡΓΟ**. Εννέα από τις έντεκα γραμμές αποδοχής έχουν PASS. Εκκρεμούν μόνο πραγματική authenticated Owner δοκιμή και πραγματικό `StorePaidModule` override με επαναφορά. Gate 8 παραμένει OPEN· Gate 6 και Gate 7 δεν αγγίζονται. Αναλυτικό checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate8-roles-security-assignment.md`.

## 25/09/2026 — Gate 8 τελικό PASS — 11/11 / ΚΛΕΙΔΩΜΕΝΟ

Το προηγούμενο 9/11 checkpoint διόρθωνε λανθασμένα ως εκκρεμή δύο στοιχεία που είχαν ήδη production evidence στο `main`. Το `2026-09-06-module-access-live-verification.md` επιβεβαιώνει Owner πρόσβαση βάσει company/store entitlement και απαγόρευση κλειδωμένων modules. Νέα read-only ανάγνωση από τη σωστή οθόνη «Έλεγχος δικαιωμάτων» επιβεβαίωσε ενεργή άδεια, 20 Owner modules, 2 περιορισμένα για εργαζόμενο, κλειδωμένα modules `ΟΧΙ` και πραγματικό store-level entitlement `ONLINE_RADIO` με πηγή «Ρύθμιση καταστήματος». Η λανθασμένη Owner login σελίδα εγκαταλείφθηκε χωρίς σύνδεση ή αλλαγή. **Gate 8 PASS / ΚΛΕΙΔΩΜΕΝΟ**· δεν επαναλαμβάνεται χωρίς νέο πραγματικό FAIL ή νέα απαίτηση. Gate 6 και Gate 7 δεν αγγίχτηκαν.\n\n## 25/09/2026 — Gate 6 launcher POS session fallback — CI PENDING\n\nΣτο πραγματικό LAB POS 2 η νέα έκδοση φόρτωσε χωρίς `isKat` error, αλλά το κουμπί Online Παραγγελιών δεν εμφανίστηκε. Αιτία: η ενεργή εμπορική POS συνεδρία/token βρίσκεται στο `localStorage`, ενώ ο launcher διάβαζε μόνο `sessionStorage`. Προστέθηκε fallback στην κανονική POS συνεδρία και regression test· **8/8 tests και client production build PASS**. Η παραγγελία **ONL-001** παραμένει `NEW`, χωρίς αλλαγή κατάστασης. **Gate 6 OPEN** μέχρι πράσινο CI/deploy και πλήρη ροή αποδοχή → προετοιμασία → έτοιμη → delivery → τελική συμφωνία.\n
## 26/09/2026 — Workforce Payroll LAB FAIL / period selector

Στο LAB η προεπισκόπηση Σεπτεμβρίου έδειξε 7 εργαζομένους / 19,67 €. Το POST δημιουργίας περιόδου απάντησε επιτυχία, αλλά η λίστα έμεινε «Δεν υπάρχει περίοδος» εξαιτίας αποτυχίας της παράλληλης επισκόπησης ταμείου («Δεν βρέθηκε ενεργό κατάστημα»). Το DB readback της περιόδου, πληρωμές και κλείδωμα **NOT TESTED**. Στενή UI διόρθωση απομονώνει την επισκόπηση ταμείου και κρατά τα μετρητά φραγμένα όταν αυτή αποτυγχάνει. **AWAITING CI / DEPLOY / LAB**, Workforce Payroll OPEN. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.
## 26/09/2026 — Workforce Payroll περιορισμένο LAB αποτέλεσμα / OPEN

PR #1341 / CI #3421 PASS / Render `6edcf34f`: η προϋπάρχουσα περίοδος Σεπτεμβρίου αναγνώστηκε ως DRAFT (7 εργαζόμενοι, 19,67 €) χωρίς διπλή δημιουργία. Στο εικονικό LAB, τραπεζική μερική εγγραφή 5,00 € άφησε 14,67 € και δεύτερη 14,67 € μηδένισε το υπόλοιπο. Στο Ταμείο Τράπεζας εμφανίστηκαν −5,00 € και −14,67 € **σε αναμονή, χωρίς αποδεικτικό**· δεν έγινε εξωτερική μεταφορά. Το κλείδωμα αποκλείστηκε από 9 εκκρεμείς παρουσίες, οι οποίες δεν εγκρίθηκαν. Μετρητά NOT TESTED λόγω μη διαθέσιμης επισκόπησης βάρδιας στο Platform Admin. Νέο στενό endpoint ενεργών βαρδιών AWAITING CI/DEPLOY/LAB. **Workforce Payroll OPEN**, `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.
## 26/09/2026 — Workforce Payroll ενεργές βάρδιες LAB / περιορισμένο PASS

PR #1343 / CI #3424 PASS / Render exact `d2c16b5803501bc813a1ba562303c2dddb1907cf`: στην εικονική περίοδο Σεπτεμβρίου η επιλογή «Μετρητά ενεργής βάρδιας» έδειξε `MAIN` και `LAB-POS-02`. **Περιορισμένο LAB PASS μόνο ανάγνωσης βαρδιών**. Δεν έγινε πληρωμή μετρητών, επειδή το υπόλοιπο περιόδου είναι ήδη 0,00 €. Στις 25/9 φαίνεται μία παρουσία `Χρειάζεται έλεγχο` (Εργαστήριο Χειριστής 1, 12:54–15:09) και μία `Σε εξέλιξη` (LAB POS 2 από 15:58), μέρος των 9 εκκρεμών· καμία δεν μεταβλήθηκε. Το μηδενικό υπόλοιπο της παλιάς περιόδου δεν συμφωνεί αυτομάτως με τυχόν μεταγενέστερες διορθώσεις παρουσιών. Κλείδωμα και πλήρες Payroll **OPEN**. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

## 26/09/2026 — Workforce Payroll πλήρης απογραφή blocker / OPEN

Στο ίδιο LAB, οι 9 εκκρεμείς είναι 5 στις 23/9, 2 στις 24/9 και 2 στις 25/9: τέσσερις 8+ ωρών (20ω48λ, 16ω23λ, 24ω14λ, 15ω32λ), τέσσερις `NEEDS_REVIEW` και μία παλιά `OPEN`. Νέα προεπισκόπηση 7 εργαζόμενοι / 19,67 € ισούται με το ήδη πληρωμένο DRAFT, αλλά παραλείπει τις εκκρεμείς ώρες. Δεν έγιναν εγκρίσεις, clock-out ή νέες πληρωμές. Απαιτούνται ελεγχόμενη διόρθωση παρουσιών, επανυπολογισμός/συμφωνία περιόδου και δοκιμή μετρητών πριν από κλείδωμα. Αναλυτικό εγχειρίδιο εντός προγράμματος μετά το πραγματικό τελικό PASS. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

## 26/09/2026 — Workforce Payroll έγκριση 16ω23λ / stale DRAFT FAIL

Κατόπιν οδηγίας ιδιοκτήτη εγκρίθηκε μόνο η 16ω23λ παρουσία της 23/9 με αιτιολογία/Audit. Η προεπισκόπηση αυξήθηκε **19,67 € → 101,59 €**, ενώ το ήδη πληρωμένο DRAFT παρέμεινε 19,67 € / υπόλοιπο 0,00 €. Οι υπόλοιπες οκτώ εκκρεμότητες δεν μεταβλήθηκαν. Διόρθωση πραγματικών λεπτών και φραγή κλειδώματος παλιού snapshot **AWAITING CI/DEPLOY/LAB**. Επανυπολογισμός DRAFT και cash test OPEN. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

## 26/09/2026 — Workforce Payroll διόρθωση 24ω14λ → 15ω00λ / περιορισμένο LAB PASS

PR #1350 / CI #3445 PASS / Render exact `97679d2b`: στην LAB παρουσία LAB POS 2 της 24/9 μπήκαν 15 ώρες και 0 λεπτά με αιτιολογία. Η αξία άλλαξε 121,17 € → 75,00 €, η κατάσταση έμεινε «Χρειάζεται έγκριση» και μόνο μετά από δεύτερη αιτιολογημένη 8+ έγκριση έγινε «Εγκρίθηκε». Η προεπισκόπηση Σεπτεμβρίου έγινε 176,59 €, ενώ το παλιό πληρωμένο DRAFT μένει 19,67 € / υπόλοιπο snapshot 0,00 €: διαφορά 156,92 €. **Περιορισμένο PASS διόρθωσης/έγκρισης παρουσίας.** Ο 20ω48λ και οι υπόλοιπες παρουσίες δεν μεταβλήθηκαν. Reconciliation, cash payment και τελικό Payroll lock OPEN. `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.
## 26/09/2026 18:28 Ελλάδα — Gate 3 πληρωμή → πρόχειρο → ανάγνωση από βοηθό

Ρητή νέα προτεραιότητα ιδιοκτήτη: μία πληρωμή POS παραδίδει ένα επεξεργάσιμο πρόχειρο με φωτογραφίες, σαφή ένδειξη «Ανάγνωση από βοηθό» και χωρίς παραπλανητικό OCR σφάλμα αν το πρόχειρο υπάρχει. Ο βοηθός διαβάζει τις φυσικές γραμμές και διορθώνει το ίδιο πρόχειρο· η ακρίβεια της πρώτης αυτόματης ανάγνωσης μετατίθεται σε μελλοντική αναβάθμιση. PR #1364 αλλάζει μόνο την ένδειξη ήδη παραδομένου πρόχειρου. CI/deploy/LAB AWAITING, πραγματικό handoff failure εξακολουθεί να είναι σφάλμα, 17 γραμμές ΜΑΝΤΖΗΛΑ και τελική καταχώριση OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.


## 26/09/2026 — Gate 6 ONL-002 δρομολόγηση πληρωμής — AWAITING CI / DEPLOY / LAB

- [x] Η δοκιμαστική παραγγελία `ONL-002` (LAB GATE 6 FINAL, Delivery, μετρητά, 1 × ΝΕΡΟ 500ML / SKU 2269, 0,50 €) προχώρησε μία φορά `NEW → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY`.
- [x] Η αρνητική δοκιμή από μη δεσμευμένο Cloud POS απορρίφθηκε fail-closed, χωρίς πώληση, πληρωμή, stock ή μεταβολή στο `MAIN`.
- [x] Επιβεβαιώθηκε η ενεργή αντιστοίχιση: `LAB-POS-02`, φορολογική `LAB-FISCAL-02`, EFTPOS καταστήματος `LAB-EFTPOS-02A`, EFTPOS delivery `LAB-EFTPOS-02B`.
- [x] Διορθώθηκε η πληρωμή ώστε να χρησιμοποιεί το ρυθμισμένο terminal της online δρομολόγησης για μετρητά/φορολογική και κάρτα/EFTPOS. Το σφάλμα πληρωμής παραμένει πλέον ορατό μέσα στο ενεργό παράθυρο πληρωμής.
- [x] Τοπικός έλεγχος Gate 6: **12/12 PASS**, πρόσθετο contract **5/5 PASS** και production client build PASS.
- [ ] PR #1365: απαιτούνται πράσινο CI, ακριβές deploy και μία μόνο τελική φυσική πληρωμή με μετρητά από το πραγματικό `LAB-POS-02`.
- [ ] Τελικό readback: `DELIVERED`, ακριβώς μία πώληση/πληρωμή 0,50 €, βάρδια `LAB-POS-02`, stock SKU 2269 κατά −1, σωστή φορολογική/πληρωτική δρομολόγηση και κανένα duplicate. Το `MAIN` και η ιστορική `ONL-001` πρέπει να μείνουν αμετάβλητα.
- Η `ONL-002` παραμένει `OUT_FOR_DELIVERY` χωρίς τελική πώληση. **Gate 6 OPEN** μέχρι το παραπάνω τελικό LAB readback· δεν επαναλαμβάνονται τα ήδη PASS βήματα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-26-gate6-onl002-payment-routing.md`.
## 26/09/2026 19:08 Ελλάδα — Gate 3 μετρητής φυσικών γραμμών βοηθού

Render `b17de87` ενεργό. ΜΑΝΤΖΗΛΑΣ 13234: βοηθός 17 φυσικές γραμμές, αρχικό πρόχειρο 0, αλλά UI «2 ελλείπουσες» επειδή μετρούσε μόνο τις πλήρως συμπληρωμένες. Στενή διόρθωση χωρίζει το πλήθος φυσικών ελλειπουσών από τις έτοιμες για εφαρμογή· οι ελλιπείς παραμένουν ορατές και απαιτούν ανθρώπινη συμπλήρωση, χωρίς αυτόματη εγγραφή. CI/deploy/LAB AWAITING, καμία νέα POS υποβολή/πληρωμή ή stock. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.
## 26/09/2026 19:33 Ελλάδα — Gate 3 επιλογή προϊόντος κανόνα από τιμολόγιο

Στο ΜΑΝΤΖΗΛΑΣ 13234 νέο LAB readback: 17 φυσικές γραμμές, 6 στο ίδιο πρόχειρο, 11 λείπουν (10 πλήρως συμπληρωμένες), προεπισκόπηση 369,38 € έναντι 369,36 € (+0,02 €). Το πεδίο κανόνα δεν άνοιγε τις προτάσεις με κλικ. Αλλαγή σε πραγματική λίστα επιλογής κωδικού και περιγραφής από τις αναγνωσμένες γραμμές, με προεπιλογή υπάρχοντος συντελεστή όταν υπάρχει. CI/deploy/LAB AWAITING· καμία νέα πληρωμή/οριστικοποίηση. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## 26/09/2026 — Πιλοτική εγκατάσταση νέου καταστήματος, 1 POS — AWAITING CI/FIELD TEST

- [ ] Ο ιδιοκτήτης διευκρίνισε ότι κάθε κατάστημα έχει όσα πραγματικά POS θέλει. Ο offline readiness checker απαιτούσε δύο· στενή αλλαγή δέχεται 1 ή περισσότερα με μοναδικά Terminal IDs. Local tests 1/2/3/20 READY, 0/διπλό ID ή ρόλο NOT_READY. Γενική ετοιμότητα εξακολουθεί ανατεθειμένη στο `agent/gate4-install-readiness`, αυτή η ρητή διόρθωση στο `agent/pilot-variable-pos-20260926`. CI/deploy/πεδίο **NOT TESTED**. `CHECKPOINTS/CHANGES/2026-09-26-pilot-variable-pos-readiness.md`.


## 26/09/2026 — Gate 6 πολλαπλά terminals / δεύτερο LAB FAIL — AWAITING CI

Μετά το production `b17de87a` το ορατό σφάλμα αποκάλυψε ότι η `ONL-002` μπλοκαρίστηκε πριν από πώληση: «Δεν έχει οριστεί το ετεροχρονισμένο POS/Ταμείο 2». Η επαναποθήκευση του υπαρκτού mapping `LAB-POS-02` / `LAB-FISCAL-02` / `LAB-EFTPOS-02A` / `LAB-EFTPOS-02B` πέτυχε, αλλά το ίδιο fail παρέμεινε. Αιτία: ο server απαιτούσε ένα μοναδικό Delivery terminal σε ολόκληρο το κατάστημα, αντί να ελέγχει το συγκεκριμένο terminal της συνεδρίας. Η διόρθωση επιτρέπει απεριόριστα terminals και κάνει fail-closed έλεγχο μόνο στο ενεργό terminal και στο δικό του fiscal/Delivery mapping. 15/15 στοχευμένα tests PASS. `ONL-002` παραμένει χωρίς πώληση/πληρωμή και Gate 6 OPEN μέχρι CI/deploy/μία τελική δοκιμή. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate6-onl002-payment-routing.md`.

## 26/09/2026 — Gate 6 alias συνεδρίας / τρίτο LAB FAIL — AWAITING CI

Μετά το ακριβές production `c39d7289`, το ίδιο fail εμφανίστηκε ξανά στο πραγματικό POS, χωρίς καμία πώληση, πληρωμή ή κίνηση stock. Το αποθηκευμένο mapping παραμένει σωστό, αλλά η συνεδρία μπορεί να φέρει παλαιότερο Terminal ID. Η στενή διόρθωση προτιμά ακριβή αντιστοίχιση και, μόνο όταν αυτή λείπει, τη μοναδική χαρτογραφημένη fiscal + Delivery διαδρομή με ανοικτή βάρδια. Με μηδέν ή πολλαπλές ανοικτές υποψήφιες γίνεται fail-closed και δεν υπάρχει fallback στο `MAIN`. `ONL-002` και Gate 6 παραμένουν OPEN μέχρι CI/deploy/μία τελική δοκιμή.
## 26/09/2026 19:39 Ελλάδα — BackOffice συνεδρία κατά τον έλεγχο Gate 3

Ο ιδιοκτήτης αναφέρει αποσύνδεση ενώ εργάζεται στο BackOffice πελάτη ως Super Admin. Ο server έδινε support token 2 ωρών έναντι κύριας συνεδρίας 12 ωρών. Στενή αλλαγή: ανανέωση ήδη ενεργής BackOffice συνεδρίας όσο η σελίδα μένει ανοιχτή, χωρίς αλλαγή εταιρείας/δικαιωμάτων και χωρίς αναβίωση μετά από Logout/ανάκληση· διατηρείται φρέσκο platform token για επιστροφή από support view. Η φόρτωση της κεντρικής οθόνης σε προσωρινό σφάλμα δίνει retry αντί να κάνει logout. Στην εικόνα `image(20260926-163825).png` υπάρχει χωριστό null `openSession` στον έλεγχο ταμείων· εμφανίζεται πλέον σαφές retry μήνυμα αν η απόκριση είναι κενή. Τοπικό/CI/deploy/LAB AWAITING. Gate 3 συνεχίζει OPEN.
## 26/09/2026 — Gate 3 ΜΑΝΤΖΙΛΑΣ, ποσοστιαίες εκπτώσεις / PR #1373

Μετά το #1372 / CI #3503 / exact Render `384f9fb`, η ανάγνωση του ίδιου 13234 έδειξε 17 φυσικές, 11 ελλείπουσες και 12 «ΠΡΟΣ ΕΛΕΓΧΟ», αρκετές ψευδώς λόγω περιττού ποσού μαζί με ορθό ποσοστό έκπτωσης. Το #1373 περιορίζει τη σήμανση όταν το ποσοστό επαληθεύει την καθαρή αξία εντός 0,05 €. Αρχικό CI #3505 FAIL λόγω ελλείποντος checkpoint/active list· επανάληψη CI/deploy/LAB AWAITING. Δεν εφαρμόστηκαν γραμμές ούτε έγινε πληρωμή, οριστικοποίηση ή stock. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.
## 27/09/2026 — Gate 6 ONL-002 πραγματική ολοκλήρωση PASS / readback AWAITING CI

Στο production `e09d008a`, η `ONL-002` ολοκληρώθηκε μία φορά από το πραγματικό `LAB-POS-02`: `DELIVERED`, πώληση `c9eb5160-1c13-41f2-a7b9-356ce8f9ce5f`, μία πληρωμή CASH 0,50 €, μία `SALE_CASH` 0,50 € στη συνεδρία `b39ef41a-1d1a-4887-ac88-50ce92903773`, και δύο συμφωνημένα κεντρικά Audit rows στις 10:09 από `LAB POS 2`. Το `MAIN` έμεινε 0 κινήσεις / 0,00 €, η `ONL-001` έμεινε ανέγγιχτη και το SKU 2269 εμφανίζει −65 με τελευταία πώληση 10:09:27. Η εμπορική ροή έχει πραγματικό PASS. Στενή διόρθωση της ψευδούς BackOffice ένδειξης terminal/EFTPOS/fiscal/stock είναι AWAITING CI/deploy και ιστορικό readback της ίδιας παραγγελίας· δεν γίνεται νέα συναλλαγή. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate6-onl002-payment-routing.md`.
## 27/09/2026 — Gate 6 Online παραγγελίες και Delivery — PASS / ΚΛΕΙΔΩΜΕΝΟ

- [x] Το production revision `1704865d05b649ac4ef3f8c9d6fc14f2d7144daa` (PR `#1377`, CI `#3513` PASS) εμφάνισε σωστά το ιστορικό readback της ίδιας `ONL-002`, χωρίς νέα συναλλαγή.
- [x] `DELIVERED`, μία πώληση `COMPLETED` 0,50 €, μία πληρωμή CASH, `LAB-POS-02`, `NON_FISCAL · LAB-FISCAL-02`, EFTPOS «Δεν απαιτείται», μία άμεση αφαίρεση stock `−64 → −65` και μία κίνηση βάρδιας `SALE_CASH` 0,50 €.
- [x] `0` πιθανά duplicates, `MAIN` 0 κινήσεις / 0,00 € και `ONL-001` ανέγγιχτη.
- [x] Οι παλιότερες εγγραφές Gate 6 με `OPEN`, `FAIL` ή `AWAITING` παραμένουν μόνο ως ιστορικό και **αντικαθίστανται από την παρούσα τελική εγγραφή**. Δεν αποτελούν ενεργή εκκρεμότητα και δεν επαναλαμβάνονται χωρίς νέο πραγματικό FAIL ή νέα απαίτηση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-26-gate6-onl002-payment-routing.md`. Manual: `docs/manual/online-delivery/PASS.md`.
## 27/09/2026 — Εστίαση / TABLE_SERVICE — ΑΝΑΤΕΘΗΚΕ / OPEN

- [ ] Ρητή ανάθεση ιδιοκτήτη στο `agent/table-service-restaurant-20260927`: τραπέζια/τραπεζοκαθίσματα, σάλες, σερβιτόροι, mobile ασύρματη παραγγελιοληψία, χωριστή αποστολή σε κουζίνα/καφέ/μπαρ ή άλλο πόστο, KDS/εκτύπωση, εκτέλεση, λογαριασμός, πληρωμή, φύρα και αναφορές εστίασης.
- [x] Απογραφή production base `3d963d2c`: υπάρχουν module/store licensing, βασικά τραπέζια, order/lines, χειριστής/terminal, batches ανά `productionStation`, κοινή ουρά παρασκευής, READY, φόρτωση/πληρωμή στο POS, φύρα και BackOffice ιστορικό. Στοχευμένα contract tests **19/19 PASS**.
- [ ] Συνολικό πραγματικό αποτέλεσμα: **LAB NOT TESTED / OPEN**. Το `TABLE_SERVICE` στο LAB παραμένει ανενεργό από την τελική επαναφορά Gate 8 και δεν ενεργοποιείται πριν από ελεγχόμενο baseline.
- [ ] **Κανόνας handoff:** αν η παρούσα σελίδα σταματήσει πριν από το συνολικό PASS, δημοσιεύει τελικό checkpoint και η ανάθεση περνά σε ονομασμένη νέα σελίδα/branch. Η παλιά ανάθεση αποδεσμεύεται μόνο αφού η νέα ανάληψη καταγραφεί και συγχωνευτεί στο `main`· δεν επιτρέπεται κενό ή διπλή ιδιοκτησία.
- [ ] Κρίσιμα ανοικτά: κάτοψη/σάλες, mobile waiter PWA, πολλοί γύροι στον ίδιο λογαριασμό, μεταφορά/ένωση/split, οικονομικά modifiers, stage-aware ακύρωση/φύρα, ανεξάρτητο KDS και εκτυπωτές ανά πόστο, live ειδοποιήσεις και πλήρης συμφωνία Sale/Payment/fiscal/stock/βάρδιας/Audit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.
## 27/09/2026 — Εστίαση A1 / σάλες και οπτική διάταξη — LOCAL PASS, CI PASS / AWAITING LAB

- [x] `agent/table-service-floor-plan-20260927`: store-scoped σάλες/ζώνες, χωρητικότητα και σχήμα τραπεζιού, φίλτρα σάλας και χρωματική κατάσταση ΕΛΕΥΘΕΡΟ / ΑΝΟΙΚΤΟ / ΕΤΟΙΜΟ.
- [x] Δημιουργία/μεταβολή μόνο από Manager/Owner/Super Admin, με tenant/store isolation και Audit.
- [x] **21/21** στοχευμένα tests και frontend production build PASS.
- [ ] CI, exact deploy και πραγματικό LAB/USER αποτέλεσμα εκκρεμούν. Δεν έγινε ενεργοποίηση module, εγγραφή LAB ή εμπορική συναλλαγή. Συνολικό TABLE_SERVICE **OPEN / LAB NOT TESTED**.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.
# TABLE_SERVICE — ενεργή εργασία 27/09/2026

- Κατάσταση: OPEN — όχι PASS.
- Διορθώνεται η ορατότητα του κουμπιού «ΤΡΑΠΕΖΙΑ» στο LAB POS με έλεγχο του προστατευμένου endpoint του module.
- LAB readback: το κουμπί εμφανίστηκε στο revision `3d91181f`, αλλά το πρώτο άνοιγμα αποκάλυψε σύγκρουση `Map`/`MapIcon`. Η διόρθωση και το regression test βρίσκονται στο PR #1393 και αναμένουν νέο CI/deploy/readback.
- Επόμενο υποχρεωτικό βήμα: deploy ακριβούς revision και φυσικός έλεγχος στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ πριν συνεχιστούν σάλες, τραπέζια, σερβιτόροι και αποστολή σε κουζίνα/καφέ.

**TABLE_SERVICE Φάση A1 πραγματική εγγραφή — POS PASS / CENTRAL AUDIT FIX AWAITING DEPLOY (27/09/2026):** Στο LAB δημιουργήθηκαν μία φορά `ΚΕΝΤΡΙΚΗ ΣΑΛΑ LAB` και `ΤΡΑΠΕΖΙ LAB 1` (4 άτομα, τετράγωνο). BackOffice `1/1` και POS εμφάνιση στη σωστή σάλα **PASS**. Εντοπίστηκε ότι το κεντρικό Audit απέκλειε τα dining configuration events· προστέθηκαν allowlist, ελληνικές αναλυτικές περιγραφές και ταυτότητα χειριστή. 18/18 tests και build PASS· αναμένεται CI/deploy/readback των ίδιων εγγραφών, χωρίς επανάληψη. Συνολικό TABLE_SERVICE OPEN.

**TABLE_SERVICE Φάση A1 Audit readback — LAB PASS / ACTOR NAME FINAL FIX (27/09/2026):** PR #1404, CI #3574 και Render `fa72e07e` PASS. Οι ίδιες ιστορικές εγγραφές σάλας/τραπεζιού εμφανίζονται πλέον στα κεντρικά Συμβάντα με πλήρη ελληνική περιγραφή, χωρίς νέα εγγραφή. Εκκρεμεί μόνο deploy/readback της τελικής αντιστοίχισης Super Admin UUID → πραγματικό όνομα. Συνολικό TABLE_SERVICE OPEN για τις επόμενες λειτουργίες εστίασης.

## 27/09/2026 15:05 Ελλάδα — Gate 3, προεπισκόπηση με λανθασμένες ταυτότητες προϊόντων

- [ ] `image(20260927-114705).png`: 14 προτεινόμενες σειρές, 59 αντί 57 τεμάχια, καθαρό 72,01 € αντί 69,88 €, πληρωτέο 81,37 € αντί 78,96 €. Ο ιδιοκτήτης επιβεβαίωσε λανθασμένους κωδικούς **και** ονομασίες. **LAB FAIL ανάγνωσης**· η υπάρχουσα φραγή εφαρμογής λειτούργησε. Δεν εφαρμόστηκαν αλλαγές, νέα υποβολή ή πληρωμή. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.
- [ ] Αλλαγή εισόδου εικόνων: τρεις επικαλυπτόμενες μεγεθύνσεις του ίδιου φύλλου αντί μίας κεντρικής περικοπής, χωρίς αλλαγή οικονομικής ροής. **AWAITING CI/DEPLOY/LAB**. Απαιτείται επανέλεγχος όλων των πραγματικών ονομάτων και κωδικών του ίδιου πρόχειρου μαζί με 57 / 69,88 € / 78,96 €· προστασία των προηγούμενων PASS και FAIL άλλων προμηθευτών. Gate 3 OPEN.

**TABLE_SERVICE A1 CONFIG/AUDIT — ΤΕΛΙΚΟ LAB PASS (27/09/2026):** PR #1405, CI #3576, Render `67cd9c63`. Η υπάρχουσα σάλα `ΚΕΝΤΡΙΚΗ ΣΑΛΑ LAB` και το `ΤΡΑΠΕΖΙ LAB 1` εμφανίζονται σε BackOffice/POS και στις δύο πρώτες γραμμές του κεντρικού Audit, με αναλυτικά ελληνικά στοιχεία και χειριστή `Χρήστος Μάνης`. Καμία διπλή εγγραφή ή οικονομική/stock κίνηση. Η συγκεκριμένη υποφάση κλειδώνει PASS· συνολικό TABLE_SERVICE OPEN.

**TABLE_SERVICE C1 — ΞΕΧΩΡΙΣΤΕΣ ΟΥΡΕΣ ΠΟΣΤΩΝ (27/09/2026):** Προστέθηκαν καρτέλες και εκκρεμείς μετρητές ανά παραμετρικό πόστο παραγωγής, με φιλτραρισμένα δελτία και ρητή ενέργεια `ΕΤΟΙΜΗ ΣΤΟ [ΠΟΣΤΟ]`. 23/23 tests και production build PASS. Κατάσταση **LOCAL PASS / AWAITING CI, DEPLOY AND LAB READBACK**· συνολικό TABLE_SERVICE OPEN.

## 27/09/2026 15:32 Ελλάδα — Gate 3 ΟΛΥΜΟΣ 26505, ταυτότητες προϊόντων

- [ ] Μετά το #1410, στο ίδιο πρόχειρο οι εικόνες `123210`/`123233` δείχνουν 13 σειρές, 57 τεμάχια, καθαρό 69,88 €, πληρωτέο 78,97 € έναντι 78,96 €, αλλά **13/13 ΠΡΟΣ ΕΛΕΓΧΟ** και ορατά λανθασμένους/κομμένους κωδικούς (`1`/`74`/`242` αντί `500`/`745`/`747`). **LAB FAIL ταυτότητας**· καμία εφαρμογή/νέα πληρωμή. Οικονομική ανοχή δεν κλείνει το Gate 3.
- [ ] Ανεξάρτητη ανάγνωση μόνο κωδικών/ονομασιών, με φραγή εφαρμογής σε διαφωνία και ατομική επιλογή αβέβαιων σειρών. **ΠΡΟΧΕΙΡΟ / NOT READY FOR MERGE** ώσπου να ελεγχθεί το πρωτότυπο και η χειροκίνητη διόρθωση, έπειτα CI/DEPLOY/LAB στο ίδιο υπάρχον πρόχειρο και σε δείγματα άλλων προμηθευτών· μετράται χρόνος/κόστος AI. Checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`. Gate 3 OPEN.

## 27/09/2026 — Gate 3 ΟΛΥΜΠΟΣ 26505, αιτία πλάγιας φωτογραφίας — AWAITING CI/DEPLOY/LAB

- [ ] Πρωτότυπο JPEG 1600×900 EXIF=1: το παραστατικό είναι πλάγιο στα pixel, ενώ το UI περιστρέφει μόνο την προβολή. Οι 13 φυσικές σειρές/κωδικοί απογράφηκαν στο checkpoint. Το πειραματικό δεύτερο AI αίτημα #1413 αποσύρεται και αντικαθίσταται με αναγνώριση στενού πλάγιου χαρτιού και όρθια views στο ίδιο AI αίτημα· local image-view tests 3/3, AI replay και LAB NOT TESTED. Το παλιό 13/13 ΠΡΟΣ ΕΛΕΓΧΟ παραμένει LAB FAIL. Αποδοχή στο ίδιο πρόχειρο, έως 2 αβέβαιες σειρές, 57 / 69,88 € / 78,96 € ±0,05 €, χωρίς νέα πληρωμή/stock/οριστικοποίηση. Gate 3 OPEN.

## 27/09/2026 16:29 Ελλάδα — Gate 3 ΟΛΥΜΠΟΣ 26505, 13 σωστές ταυτότητες, 2 κενά ΣΕΤ

- [ ] Στο exact Render `cd47997`, νέο LAB preview ίδιου πρόχειρου: 13/13 κωδικοί/ονομασίες αντιπαραβλήθηκαν με το πρωτότυπο, 57 / 69,88 € / 78,96 € τυπωμένο, UI 78,97 € (+0,01 €). Ο μετρητής δηλώνει μόνο 11/13 πλήρεις επειδή οι δύο `ΣΕΤ` γραμμές 633/667 έχουν κενό συντελεστή `Τεμ./πακ.` παρά πράσινη «Ευκρινής». Δεν έγινε εφαρμογή ή οριστικοποίηση. Στενή ομαλοποίηση `ΣΕΤ`→μία μονάδα με προεπιλογή 1, CI/DEPLOY/LAB AWAITING. Gate 3 OPEN· checkpoint ενσωμάτωσης.

## 27/09/2026 16:48 Ελλάδα — Gate 3 ΟΛΥΜΠΟΣ 26505: 13/13 ΠΡΟΣ ΕΛΕΓΧΟ, ΣΕΤ ×3

- [ ] Νέα LAB ανάγνωση στο ίδιο πρόχειρο μετά το #1417: 13 φυσικές, 57 / 69,88 € / 78,96 €, αλλά 13/13 αβέβαιες και επταψήφια barcode αντί πρώτων τριψήφιων κωδικών. **LAB FAIL ταυτότητας, αστάθεια ανάγνωσης**. Ο ιδιοκτήτης επιβεβαίωσε ότι κωδικοί 633 και 667 είναι έκαστος 2 ΣΕΤ × 3 = 6 τεμάχια αποθήκης. Η προηγούμενη αυτόματη μονάδα 1 είναι λάθος· απαιτούνται δύο ρητοί κανόνες `1 ΣΕΤ = 3 ΤΜΧ`. Στενή διόρθωση σε PR: κανένας μη επιβεβαιωμένος συντελεστής, κενό/ΠΡΟΣ ΕΛΕΓΧΟ μέχρι ακριβή κανόνα ίδιου προμηθευτή και κωδικού. Δεν έγινε εφαρμογή, stock ή νέα πληρωμή. Gate 3 OPEN.

## 27/09/2026 16:50 Ελλάδα — διευκρίνιση πλήρους κωδικού και αυτόματου ΣΕΤ

- [ ] Ο κωδικός προϊόντος είναι σύνθετος: π.χ. `633 1004931`, όχι μόνο το τριψήφιο ούτε μόνο το επταψήφιο. Το `3X250ML` δίνει αυτόματη **πρόταση** 3 τεμαχίων ανά ΣΕΤ· 2 ΣΕΤ = 6 τεμάχια ανά κωδικό 633/667. Χωρίς επιβεβαιωμένο κανόνα η πρόταση παραμένει ΠΡΟΣ ΕΛΕΓΧΟ και δεν αποθηκεύεται σιωπηρά ως μάθηση. Μελλοντική LAB σύγκριση πλήρων κωδικών/ονομασιών/οικονομικών και εφαρμογής στο ίδιο πρόχειρο AWAITING. Gate 3 OPEN.

## 27/09/2026 — Gate 3 ΟΛΥΜΠΟΣ 26505, δεύτερο ΣΕΤ 3X250

- [ ] Νέο LAB preview στο ίδιο πρόχειρο: 13 γραμμές, 11 ευκρινείς και 2 ΣΕΤ ΠΡΟΣ ΕΛΕΓΧΟ· 57 / 69,88 € / 9,08 € / 78,96 € τυπωμένο, UI +0,01 €. Το 633 `3X250ML` προτείνει 3, αλλά το 667 `3X250` αφήνει κενό. **LAB FAIL για τη δεύτερη μετατροπή**. Στενή διόρθωση αναγνωρίζει τελικό `3X250` χωρίς ML μόνο σε ΣΕΤ, με ανθρώπινη επιβεβαίωση. CI/DEPLOY/LAB AWAITING· εφαρμογή, stock και οριστικοποίηση NOT TESTED. Πλήρεις σύνθετοι κωδικοί χρειάζονται ονομαστικό readback. Gate 3 OPEN· λεπτομέρειες στο checkpoint ενσωμάτωσης.

## 27/09/2026 19:33 Ελλάδα — Gate 3 ΟΛΥΜΠΟΣ 26505, οπτική ολοκλήρωση γραμμών

- [ ] Περιορισμένο LAB PASS: στο ίδιο πρόχειρο εφαρμόστηκαν 13 γραμμές, 69,88 € καθαρό, 78,97 € UI έναντι 78,96 € έντυπο (+0,01 €), και οι σύνθετοι κωδικοί 633/667 φαίνονται με 6 τμχ αποθήκης έκαστος. Οριστικοποίηση, κίνηση stock/πληρωμής, όλοι οι κωδικοί έναντι εντύπου και άλλοι προμηθευτές NOT TESTED. Από τις πρώτες 8 σειρές 4 έχουν ήδη αντιστοιχιστεί σε προϊόν. Ζητήθηκε χρώμα μετά την αποθήκευση κάθε αντιστοίχισης: πράσινο φόντο και ✓ βάσει αποθηκευμένου `productId`, χωρίς νέα μεταβολή δεδομένων. CI/deploy/οπτικό LAB AWAITING. Gate 3 OPEN· checkpoint ενσωμάτωσης.

## 27/09/2026 19:46 Ελλάδα — Gate 3 26505, 13 πράσινες γραμμές και ασυμφωνία markup

- [ ] Στο Render `494c450` ο ιδιοκτήτης έδειξε πράσινες/✓ αντιστοιχισμένες γραμμές μέχρι τη 13, 13 είδη / 69,88 € / 78,97 € (+0,01 € από έντυπο), 633/667 από 6 τμχ. Περιορισμένο οπτικό LAB PASS ένδειξης· επαναφόρτωση και οριστικοποίηση NOT TESTED. Στη 633 τρέχουσα λιανική 1,10 €, προτεινόμενη 1,70 €, markup −33,18% υπολογίζεται λανθασμένα ανά 2 ΣΕΤ αντί 6 τεμαχίων. Στενή διόρθωση αριθμητικής και προβολής AWAITING CI/DEPLOY/LAB· καμία αυτόματη αλλαγή λιανικής ή stock. Gate 3 OPEN.

## 27/09/2026 20:11 Ελλάδα — Gate 3 26505, αποθήκευση 633 — περιορισμένο LAB PASS

- [x] Στο ίδιο LAB πρόχειρο, μετά το PR #1429 / CI #3626 / exact Render merge `ebc977c`, ο ιδιοκτήτης επιβεβαίωσε «είναι οκ». Η `image(20260927-171129).png` δείχνει 633 `633 1004931`: λιανική 1,10 €, 2 ΣΕΤ → 6 τμχ, καθαρό 4,50 €, μικτό 5,09 €, markup +29,71%. Η 667 παραμένει 6 τμχ/1,70 €. Σύνολο 13 είδη, 69,88 € καθαρό, 78,97 € έναντι εντύπου 78,96 € (+0,01 €). Το μπλοκάρισμα HTML αποθήκευσης έκλεισε για αυτή τη γραμμή. Δεν αποδεικνύονται από την εικόνα refresh, όλες οι φυσικές ταυτότητες, μοναδικότητα πληρωμής/job, άλλοι προμηθευτές ή οριστικοποίηση/stock. Gate 3 OPEN· checkpoint ενσωμάτωσης και manual τιμολογίων ενημερωμένα.

## 27/09/2026 20:03 Ελλάδα — Gate 3 26505, ιστορικό αποθήκευσης markup 633 μπλοκαρισμένη

- [ ] Πραγματικό LAB FAIL: το UI προτείνει markup 29,707% για λιανική 1,10 € επί 6 τμχ, αλλά το `step=0.001` με αρχική εξαψήφια τιμή επιτρέπει μόνο 29,706778/29,707778 και το browser μπλοκάρει «Καταχώρηση» πριν από API. Στενή διόρθωση `step=any` στα markup της φόρμας, χωρίς αλλαγή αριθμητικής/τιμής/stock. CI/DEPLOY/LAB AWAITING· επανάληψη μόνο της αποθήκευσης ίδιας γραμμής, όχι POS πληρωμής ή οριστικοποίησης. Gate 3 OPEN.


## 27/09/2026 21:00 Ελλάδα — TABLE_SERVICE δομημένα αλλεργιογόνα LAB PASS

- [x] PR #1434 / main `f1c4f7332f63bd16b4f25a0e2df334b07b151d30`, CI και Render deploy PASS. Το PR #1436 / main `101c2d87ff51dcfe2c84a05ae363c8697a92ea6a` κλείδωσε το production baseline πριν από μεταβολή.
- [x] Ένας μόνο Γύρος 2 στο `ΤΡΑΠΕΖΙ LAB 1`: 1× LAB καφές, δομημένο `ΓΑΛΑ` και χωριστή σημείωση `LAB ΔΟΜΗΜΕΝΟ · ΠΟΛΥ ΖΕΣΤΟ`. Η ουρά `ΚΑΦΕ` εμφάνισε `ΑΛΛΕΡΓΙΟΓΟΝΑ: ΓΑΛΑ`, ολοκληρώθηκε 1→0 και το τραπέζι έγινε `ΕΤΟΙΜΗ`, 2,00 € χωρίς πώληση.
- [x] Οικονομικά/stock αμετάβλητα: `MAIN` 0,00 € / 0, `LAB-POS-02` 0,00 € / 2, τοπική ουρά 0, stock καφέ -2. Δεν έγινε πληρωμή, Sale, ακύρωση ή φύρα.
- Το συγκεκριμένο scope κλειδώνει **LAB PASS**. Συνολικό TABLE_SERVICE παραμένει ενεργό για τα υπόλοιπα ανεξάρτητα scopes του roadmap.
## 27/09/2026 ~22:25 Ελλάδα — TABLE_SERVICE κινητός σερβιτόρος · υλοποίηση / LAB NOT TESTED

- [ ] Μετά το PASS κάτοψης #1445 και την τεκμηρίωση #1448, ξεκίνησε περιορισμένη οθόνη παραγγελίας κινητού στο υπάρχον Store Mode, με προσωπικό PIN/κάρτα, έλεγχο βάρδιας για POS, κατάστημα/module και server τιμές. Χωρίς πληρωμή ή φύρα από την οθόνη. Branch `feat/table-service-mobile-waiter-20260927`· CI/deploy/LAB AWAITING. `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md`.
- [ ] Στο συνολικό TABLE_SERVICE PASS απαιτείται πλήρες manual χρήσης ανά ρόλο: εργαζόμενος, ιδιοκτήτης, Super Admin. Δεν χαρακτηρίζονται ενδιάμεσα μη δοκιμασμένες λειτουργίες ως PASS.
## 28/09/2026 00:30 Ελλάδα — Super Admin AI Command Center ΦΑΣΗ 1 · CI PASS / AWAITING LAB

- [ ] Νέα ανεξάρτητη read-only οθόνη δίπλα στο σημερινό Super Admin, με βασική επισκόπηση από το υπάρχον `/api/platform/overview` και συνδέσμους προς τους υπάρχοντες Ελέγχους, Ταμεία, Πληρωμές, Τράπεζα και Συμβάντα. Καμία δεύτερη βάση/API/οικονομική ενέργεια και καμία αντικατάσταση υπάρχουσας λειτουργίας. Branch `feat/super-admin-ai-command-center-phase1-20260928`. Στοχευμένα 4/4, client build και πλήρης server suite 1.608/1.608 PASS (1 SKIP). CI, exact deploy και LAB οπτικό readback AWAITING. `CHECKPOINTS/CHANGES/2026-09-28-super-admin-ai-command-center-phase1.md`.
## 28/09/2026 01:01 Ελλάδα — Κουμπί Εκτέλεσης Ελέγχου responsive · AWAITING CI/READBACK

- [x] PR #1486 / CI #3742 και #3743 / deploy #1746 / exact production `f102089532cc1304e2a2b53df35dc2e45d069703`: το `image(3).png` δείχνει ολόκληρα τα `Εκτέλεση ελέγχου` και `Καθαρισμός` μέσα στο panel, χωρίς οριζόντια κύλιση. Ο χρήστης δήλωσε «ΕΙΝΑΙ ΟΚ». Περιορισμένο USER visual PASS μόνο της responsive διάταξης· καμία αλλαγή λειτουργίας/API/δεδομένων. `CHECKPOINTS/CHANGES/2026-09-28-super-admin-check-button-responsive.md`.

## 28/09/2026 — Super Admin AI Command Center ΦΑΣΗ 3 · Ρώτα το MyWorkStation

- [x] PR #1496, διορθώσεις #1498/#1500/#1502, CI #3784/#3786 και production `948bbaa406d1641e59d18a6d6d54005edf1852a8`. Η `image(8).png` δείχνει read-only απάντηση με 3 τραπεζικά σημεία, 0 ταμεία/πληρωμές, 2 εταιρείες/3 καταστήματα, πηγή και όρια. Περιορισμένο USER visual PASS· καμία επιχειρηματική μεταβολή. `CHECKPOINTS/CHANGES/2026-09-28-super-admin-ai-command-center-phase3-ask.md`.
## 28/09/2026 — Barcode: έλεγχος και μεταφορά μεταξύ προϊόντων · ΑΝΑΤΕΘΗΚΕ

- [ ] `agent/barcode-catalog-check-20260928`: πρώτη στενή υλοποίηση στην καρτέλα προϊόντος. Έλεγχος υπάρχουσας αντιστοίχισης, ρητή επιβεβαίωση προέλευσης/προορισμού, ατομική μεταφορά με επανέλεγχο και Audit. Δεν έγινε μεταφορά σε LAB, ούτε αλλαγή τιμής, stock ή πώλησης. PR #1495 / CI #3771 PASS / exact Render `450b1cfae0519706c6d79d0ddcea2dbf0d9bc4f9`. Πραγματική οπτική/λειτουργική αποδοχή LAB AWAITING. Αναζήτηση προσφορών/παραγγελίες παραμένουν OPEN χωριστά.
## 28/09/2026 — AI Command Center · ενεργό κουμπί «Ρώτα»

- [x] Το «Ρώτα» είναι ενεργό με κενό πεδίο και η `image(8).png` επιβεβαιώνει κανονική απάντηση μετά τις αντιστοιχίσεις του snapshot. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-ask-button.md`.
## 28/09/2026 19:32 Ελλάδα — AI Command Center · snapshot schema

- [x] Το validation error της `image(6).png` έκλεισε: η `image(8).png` δείχνει κανονική απάντηση μετά τη ρητή αντιστοίχιση εταιρειών. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-snapshot-schema.md`.
## 28/09/2026 19:41 Ελλάδα — AI Command Center · problem snapshot schema

- [x] Το δεύτερο validation error της `image(7).png` έκλεισε: η `image(8).png` επιβεβαιώνει σωστή απάντηση μετά την πλήρη ρητή αντιστοίχιση των μετρητών. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-problem-schema.md`.
## 28/09/2026 — AI Command Center ΦΑΣΗ 4 · Κατάσταση καταστημάτων

- [x] Κάθε κατάστημα εμφανίζεται ξεχωριστά ως 🟢 ΟΚ / 🟠 ΕΛΕΓΧΟΣ / 🔴 ΠΡΟΒΛΗΜΑ από τα υπάρχοντα read-only αποτελέσματα Ταμείων, Πληρωμών και Τράπεζας. Το πάτημα οδηγεί στην κανονική σχετική οθόνη. Κανένα νέο endpoint ή write. PR `#1506`, CI `#3793`/`#3794` PASS, deploy `#1766` PASS, exact production `22b91d7a009c3a89ef029aea982132b3f968bf25`. Η `image(9).png` επιβεβαιώνει `0 ΟΚ · 3 έλεγχος · 0 πρόβλημα`, σωστή ανάθεση των `3 τραπεζικών` και πορτοκαλί ένδειξη για απουσία κλεισίματος. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-store-status-phase4.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 5 · AI ημερήσια ανάλυση

- [x] Έως 5 σημερινές προτεραιότητες, με κόκκινα πριν από πορτοκαλί, πραγματική αιτία και σύνδεση στην υπάρχουσα κανονική οθόνη. Μόνο από τα υπάρχοντα read-only δεδομένα· κανένα νέο endpoint, write ή αυτόματη ενέργεια. PR `#1508`, CI `#3799` PASS, exact production `726808c49bc174ffd8ff824cf9ae77ed5e91bff4`. Τα `image(10).png` και `image(20260928-174514).png` επιβεβαιώνουν 4 προτεραιότητες σε συμφωνία με τα 4 καταστήματα προς έλεγχο, σωστή αιτία και ενεργό `Ρώτα`. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-daily-analysis-phase5.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 6 · Invoice & Supplier Detective

- [x] Read-only σύνοψη από το υπάρχον Invoice Learning workspace για πρόχειρα, γραμμές/εκπτώσεις προς έλεγχο, διαφορές συνόλου, πιθανά διπλά και μεταβολές τιμής. Έως 5 πραγματικά ευρήματα με μετάβαση στο κανονικό Invoice Learning Lab. Κανένα νέο endpoint, OCR, write, πληρωμή, stock ή οριστικοποίηση. PR `#1510`, CI `#3803` PASS, exact production `86f44b40b517dd538320bc35267ef5558388c994`. Η `image(20260928-180759).png` επιβεβαιώνει τους έξι μετρητές, δύο πραγματικές διαφορές συνόλου και το κουμπί μετάβασης. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-invoice-detective-phase6.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 7 · AI Ταμείων & Πληρωμών

- [x] Read-only εξήγηση των υπαρχόντων αποκλίσεων μετρητών, POS–EFTPOS, αποδεικτικών, πιθανών διπλών, πληρωμών προμηθευτών και τραπεζικών εγγραφών. Έως 5 πραγματικά ευρήματα με μετάβαση στις κανονικές οθόνες. Κανένα νέο endpoint, write, πληρωμή, χρέωση, συμψηφισμός ή stock. PR `#1512`, CI `#3808` PASS, exact production `385f02460f389aa1928c669168c691df3bc67879`. Η `image(20260928-183817).png` επιβεβαιώνει τους έξι μηδενικούς μετρητές, την κατάσταση συμφωνίας και τα τρία κουμπιά μετάβασης. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-cash-payments-phase7.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 8 · Stock Intelligence

- [x] Read-only εικόνα ενεργών ειδών, χαμηλού/μηδενικού/αρνητικού stock, slow movers και πρότασης κάλυψης από το υπάρχον stock/POS/ledger. Έως 5 ευρήματα με μετάβαση στο κανονικό Backoffice. Κανένα νέο endpoint, δεύτερο ledger, παραγγελία, παραλαβή, μεταφορά, φύρα ή stock write. PR `#1518`, CI `#3828` PASS, exact production `639944effe644d8709f5daefde18b33a428fa710`. Η `image(20260928-190513).png` επιβεβαιώνει 206 ενεργά, 125 μηδενικά, 15 αρνητικά, 65 slow movers και πέντε σωστά ιεραρχημένα ευρήματα. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-stock-intelligence-phase8.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 9 · Workforce Intelligence

- [x] Read-only σύνοψη από τα υπάρχοντα Workforce V2 δεδομένα για ενεργούς εργαζομένους, πρόγραμμα, κενά, παρουσίες, καθυστερήσεις, υπερωρίες και αιτήματα αδειών. Έως 5 ευρήματα με μετάβαση στην κανονική οθόνη `Προσωπικό & Πρόγραμμα`. Κανένα νέο endpoint, δεύτερο dataset, write, έγκριση, δημοσίευση ή Payroll αλλαγή. PR `#1521`, CI `#3835` PASS, exact production `878f2251d653acdb7e0f7c3595246d9ba1168fdc`. Η `image(20260928-193431).png` επιβεβαιώνει 10 ενεργούς εργαζομένους, όλους τους σημερινούς μετρητές στο 0 και δύο σωστά ευρήματα χωρίς δημοσιευμένο πρόγραμμα. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-workforce-intelligence-phase9.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 10 · Morning Briefing

- [x] Read-only πρωινή σύνοψη πέντε τομέων από τις ήδη ενεργές ενότητες του Command Center, με ώρα Ελλάδας και μετάβαση στις κανονικές οθόνες. Κανένα νέο endpoint, δεύτερο dataset, μήνυμα, προγραμματισμένη εργασία ή μεταβολή δεδομένων. PR `#1524`, CI `#3840` PASS, exact production `60ed1d1bfa9bda82bc293bab33492afc13888cdb`. Η `image(20260928-195513).png` επιβεβαιώνει τις πέντε κάρτες, ώρα Ελλάδας και πραγματικούς μετρητές. LIMITED USER VISUAL PASS · CLOSED. `CHECKPOINTS/CHANGES/2026-09-28-ai-command-morning-briefing-phase10.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 11 · Night Briefing

- [x] Read-only νυχτερινός απολογισμός πέντε τομέων από τις ήδη ενεργές ενότητες, με ώρα Ελλάδας και μετάβαση στις κανονικές οθόνες. Κανένα νέο endpoint, κλείσιμο ημέρας, μεταφορά υπολοίπου, μήνυμα, scheduler ή μεταβολή δεδομένων. PR `#1526`, CI `#3845` PASS, exact production `2d4f2e071d8f4c107a31a31f4e2ca8c0fef9083c`. Η `image(20260928-201005).png` επιβεβαιώνει τις πέντε κάρτες, τους πραγματικούς μετρητές και τις καταστάσεις `ΑΥΡΙΟ`, `ΚΛΕΙΣΤΟ` και `ΠΡΟΒΛΗΜΑ`. **LIMITED USER VISUAL PASS · CLOSED.** `CHECKPOINTS/CHANGES/2026-09-28-ai-command-night-briefing-phase11.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 12 · Digital Twin Lite

- [x] Read-only λειτουργική κάρτα ανά κατάστημα για POS, EFTPOS/ταμειακές, ταμείο, stock και προσωπικό, αποκλειστικά από τις υπάρχουσες πηγές και με μετάβαση στις κανονικές οθόνες. Κανένα νέο endpoint, device control, άνοιγμα βάρδιας, EFTPOS/RBS εντολή, write ή κάμερα/NVR. PR `#1529` / CI `#3851`, device-routing fix PR `#1530` / CI `#3853`, exact production `f58e19b946e1f3a05c5605a324c233605d14fb1c`. Η `image(20260928-203834).png` επιβεβαιώνει 4 κάρτες, 5 περιοχές και πραγματικούς POS/EFTPOS μετρητές: LAB `0/2` POS και `4 ενεργά · 2 ταμειακές`, ΚΑΤ `0/2` POS και `2 ενεργά · 1 ταμειακή`. Τα καταστήματα χωρίς ρυθμισμένες συσκευές δείχνουν σωστά μηδενικά, όχι `ΜΗ ΔΙΑΘΕΣΙΜΟ`. **LIMITED USER VISUAL PASS · CLOSED.** `CHECKPOINTS/CHANGES/2026-09-28-ai-command-digital-twin-lite-phase12.md`.

## 28/09/2026 — AI Command Center ΦΑΣΗ 13 · NVR / Cameras

- [x] Read-only κατάσταση υπάρχοντος NVR/connector και ενεργών καμερών μέσα στις κάρτες Digital Twin, με μετάβαση στην κανονική οθόνη Video Events. Κανένα νέο endpoint, snapshot/live/clip request, pairing, command ή έκθεση credentials. PR `#1532`, CI `#3857` PASS, exact production `9b8b0e0e00990fa19bf617fc17352af957c5a8f0`. Η `image(20260928-210335).png` επιβεβαιώνει τέσσερις περιοχές `Κάμερες`: LAB `OFFLINE · 1 κάμερα`, απομονωμένο LAB `Δεν έχει ρυθμιστεί` και δύο `ΜΗ ΔΙΑΘΕΣΙΜΟ`, χωρίς απώλεια των POS/EFTPOS μετρητών. Το κλικ μετάβασης δεν δοκιμάστηκε. **LIMITED USER VISUAL PASS · CLOSED.** `CHECKPOINTS/CHANGES/2026-09-28-ai-command-nvr-cameras-phase13.md`.

## 29/09/2026 — AI Command Center ΦΑΣΗ 14 · Full Digital Twin

- [x] Ενιαία read-only εικόνα επιλεγμένου καταστήματος με συνολική κατάσταση και τους έξι υπάρχοντες τομείς POS, EFTPOS, Ταμείο, Stock, Προσωπικό και Κάμερες. PR `#1536`, CI `#3870` PASS, exact production `22f1914b40d30ba9d087db1ed58349d734dab48f`. Η `image(20260929-180520).png` επιβεβαιώνει τέσσερις επιλογές καταστημάτων, τους έξι τομείς και στο Περίπτερο Διαδόχου Παύλου `0 ΟΚ · 6 έλεγχος · 0 πρόβλημα`. Τα κλικ μετάβασης δεν δοκιμάστηκαν. **LIMITED USER VISUAL PASS · CLOSED.** `CHECKPOINTS/CHANGES/2026-09-29-ai-command-full-digital-twin-phase14.md`.

## 29/09/2026 — Εργασία #18 · Backup, monitoring και restore dry-run

- [ ] **CI + EXACT DEPLOY PASS · AWAITING EXTERNAL SETUP / LIVE RUN:** υλοποιήθηκαν off-site PostgreSQL backup ανά 3 ώρες, κατάσταση `STARTED/SUCCEEDED/FAILED/OVERDUE`, fail-soft read-only Super Admin monitoring και archive dry-run μόνο με `pg_restore --list`, χωρίς σύνδεση σε βάση. Στοχευμένα tests 4/4, πλήρες server suite 1.641 PASS / 0 FAIL / 1 SKIP και production build PASS. PR `#1544`, CI `#3887` PASS, exact production `17c4735c54b9e66fdb90c45970e2171b48d20380`. Κανένα πραγματικό restore ή αλλαγή production δεδομένων. Εκκρεμούν ιδιωτικό S3 bucket, Render secrets/cron και πραγματικό upload + ανεξάρτητο dry-run πριν από LIVE PASS. `CHECKPOINTS/CHANGES/2026-09-29-task18-backup-monitoring-restore-dry-run.md`.

## 29/09/2026 — Εγκατάσταση Περιπτέρου Διαδόχου Παύλου · αρχείο ειδών

- [ ] Το αρχείο προέλευσης είχε 14.988 είδη. Εξαιρέθηκαν Τύπος και ποσότητες αποθήκης· με εντολή ιδιοκτήτη αφαιρέθηκαν όλες οι 1.249 γραμμές με συγκρουόμενο εσωτερικό κωδικό ή barcode. Το νέο αρχείο έχει 6.623 είδη με μοναδικούς μη κενούς κωδικούς και barcode. Το παλιό αρχείο παραμένει διαθέσιμο. Δεν έγινε καταχώρηση στο κατάστημα.
- [ ] PR `#1534` MERGED, CI `#3866` PASS, παραγωγή `51d65dc` live. Ο χρήστης εισήγαγε τα 6.623 είδη: readback στο ενεργό κατάστημα της «ΠΕΡΙΠΤΕΡΟ ΔΙΑΔΟΧΟΥ ΠΑΥΛΟΥ ΕΕ» 6.623 StoreProduct, stock 0 σε όλα, 8 τμήματα ΦΠΑ, 109 προμηθευτές και 5.780 συνδέσεις προμηθευτή. Η οθόνη δείχνει 100 ανά σελίδα, 67 σελίδες. Η στήλη βασικού προμηθευτή έδειχνε παύλα επειδή διάβαζε μόνο εγκεκριμένες αγορές· διόρθωση προβολής σε νέο PR. **OPEN:** αντιστοίχιση ταμειακής/εξαιρέσεων 0% και φυσική δοκιμή PC/scanner/RBS/EFTPOS. `CHECKPOINTS/CHANGES/2026-09-29-diadoxou-import-readback-supplier-display.md`.

## 29/09/2026 — Διαδόχου · τμήμα καπνικών 0%

- [ ] Η παλιά ρύθμιση δείχνει ΚΑΠΝΙΚΑ 0%, κωδικό ΦΠΑ 12 και τμήμα ταμειακής 1. Στην παραγωγή βρέθηκαν 565 είδη κατηγορίας ΚΑΠΝΙΚΑ ήδη με 0%, αλλά το τμήμα τους έχει 24% και περιέχει άλλα 20 είδη διαφορετικών κατηγοριών με 24%. PR `#1538`: στοχευμένη, ατομική και idempotent διόρθωση με έλεγχο ακριβών μετρητών, μεταφορά μόνο των 20 στο υπάρχον τμήμα 24%, διατήρηση των συντελεστών ειδών και ορισμό τμήματος ΚΑΠΝΙΚΑ 0%/12/1. **OPEN:** CI, merge, deploy, readback, υπόλοιπα τμήματα και πραγματική δοκιμή ταμειακής. `CHECKPOINTS/CHANGES/2026-09-29-diadoxou-tobacco-vat-repair.md`.

## 29/09/2026 — Διαδόχου · αντιστοίχιση ταμειακής και διαπιστευτήρια

- [ ] Το PR `#1538` πέρασε CI `#3875`, έγινε MERGED και είναι live (`64ab660`): readback 565 καπνικά 0% στο τμήμα 1/κωδικό 12 και τα 20 άλλα είδη 24% μεταφέρθηκαν στο ΕΙΔΗ 24. Νέα εργασία: τμήματα 3–9 από φωτογραφία παλιάς ταμειακής χωρίς αλλαγή ΦΠΑ προϊόντων. Το τμήμα 2 (Τύπος) εξαιρείται. Ο χρήστης διαθέτει κωδικούς myDATA και ελέγχου ΑΦΜ· **δεν τους ζητούμε στο chat**. Οι δύο διασυνδέσεις είναι μη ρυθμισμένες στο σωστό κατάστημα, η εταιρεία έχει καταχωρισμένο εννεαψήφιο ΑΦΜ. Εκκρεμούν ασφαλής καταχώριση, έλεγχος sandbox/παρόχου, τοπικός connector CapDriver/RBS και φυσική δοκιμή. `CHECKPOINTS/CHANGES/2026-09-29-diadoxou-register-mapping-and-credentials.md`.
## 29/09/2026 — Κεντρική αναζήτηση ΑΦΜ ΑΑΔΕ · AWAITING CI/DEPLOY/LAB

- [ ] Η σημερινή δοκιμή σε προμηθευτή επέστρεψε γενικό «δεν βρέθηκε» χωρίς απόδειξη ότι η ΑΑΔΕ έλεγξε το ΑΦΜ. Κοινή διόρθωση `commerce/vat-lookup`: ρητή επίσημη αναζήτηση ακόμη και για υπάρχουσα καρτέλα, διάκριση τεχνικής μη αναγνώσιμης απάντησης από απάντηση μητρώου, χωρίς αλλαγή εταιρικών διαπιστευτηρίων ή δεδομένων. Η παλιά κεντρική LAB ροή είχε επιβεβαιωθεί, αλλά το checkpoint της δεν τεκμηριώνει live επιτυχή ΑΑΔΕ απόκριση στη σημερινή εταιρεία. `CHECKPOINTS/CHANGES/2026-09-29-central-aade-lookup-diagnostics.md`.
## 30/09/2026 — Διαδόχου εισερχόμενα myDATA · πρώτη κλήση 0 / διάγνωση AWAITING CI

- [ ] Ο ιδιοκτήτης πάτησε χειροκίνητη λήψη σε PRODUCTION μετά το PR #1547 / CI #3894 / Render `f108004` και η UI επέστρεψε «Δεν βρέθηκαν νέα παραστατικά» με 0 πρόχειρα. Read-only βάση: σωστή εταιρεία/ΑΦΜ σε επιλεγμένο κατάστημα και 0 `MyDataInboundDocument`. Φυσικό τιμολόγιο προμηθευτή 28/09/2026 προς το ίδιο ΑΦΜ υπάρχει· η πρώτη απάντηση δεν εμφανίζει αν η ΑΑΔΕ επέστρεψε 0 ή αν γραμμές αγνοήθηκαν. Νέο diagnostic message με fetched/duplicates/VAT mismatch/missing MARK, χωρίς στοιχεία ή credentials. Δεν δηλώνεται PASS εισαγωγής. `CHECKPOINTS/CHANGES/2026-09-30-mydata-inbound-zero-diagnostics.md`.

## 29/09/2026 — Εισερχόμενα τιμολόγια προμηθευτών myDATA · PR #1547 / CI PASS / LIVE / AWAITING LAB

- [ ] Η παραγωγική λήψη RequestDocs προστέθηκε στη Θυρίδα Τιμολογίων ανά εταιρεία/κατάστημα, με έλεγχο ΑΦΜ παραλήπτη, σελιδοποίηση και χωριστό cursor ανά περιβάλλον. Τα ευρήματα μπαίνουν ως πρόχειρα χωρίς ενημέρωση stock· έκδοση εξερχομένων με ΜΑΡΚ/QR και πραγματικό PASS εισερχομένων παραμένουν OPEN. `CHECKPOINTS/CHANGES/2026-09-29-mydata-inbound-production.md`.
## 30/09/2026 — Ασφαλής εκκίνηση παραγωγής · AWAITING CI/DEPLOY

- [ ] Τα deploys μετά το #1548/#1549 σταμάτησαν στο `prisma db push`, καθώς προτάθηκε διαγραφή πολλών μη κενών πινάκων. Δεν επιτράπηκε απώλεια δεδομένων· το προηγούμενο revision παρέμεινε live. Αλλαγή στο `prisma:push` παραλείπει το schema push μόνο με `NODE_ENV=production`, διατηρώντας Prisma client generation και τη δοκιμαστική ροή. Απαιτείται CI και exact live deploy· η λήψη του τιμολογίου Διαδόχου παραμένει AWAITING LAB. `CHECKPOINTS/CHANGES/2026-09-30-production-safe-prisma-startup.md`.


## 30/09/2026 — Εργασία #18 · Backblaze B2

- [x] **LIVE PASS:** PR #1555 / merge `3868c16`, επιτυχές πραγματικό upload 161.286.652 bytes, ίδιο SHA-256 μετά από ανεξάρτητη λήψη, `pg_restore --list` PASS με 436 table entries και ενεργό 3ωρο cron/monitoring. Κανένα πραγματικό restore ή production data replacement. `CHECKPOINTS/CHANGES/2026-09-30-task18-backblaze-b2.md`.

## 30/09/2026 — Εργασία #19 · Περιορισμός περιττών GitHub/Render builds

- [x] **FINAL PASS:** PR #1557 / CI #3917–3918 / exact production `7ee5ca6` και PR #1558 / CI #3919–3920 / exact production `6d6384c`. Ένας guarded δρόμος production web deploy, Render build filters ανά service, ακύρωση superseded CI και documentation-only skip επιβεβαιώθηκαν πραγματικά χωρίς νέο web deploy ή cron rebuild. Καμία αλλαγή σε επιχειρησιακή λειτουργία ή δεδομένα. `CHECKPOINTS/CHANGES/2026-09-30-task19-build-efficiency.md`.

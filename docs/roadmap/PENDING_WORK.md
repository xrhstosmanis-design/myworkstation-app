**01/10/2026 — #14 BEFORE τελική margin query:** exact `/api/health` `35a52c4ef056453955b3764aefc8cf16e978f750`, #1586 / PR CI3985 / mainCI3986 / deploy1844 PASS, Node20.20.2 /1727PASS /0FAIL /0SKIP /build/invariants/E2E PASS. Φρέσκο LAB: SKU763/barcode5449000000996 stock0/αγορά0,81/λιανική1,30, control1LT9/1,74/2,60 και500ML0/0/1,60 ίδια. MAIN2/2,40 CASH CARD/IRIS0,POS02 2/0 όλα0,1057Audit ακριβώς ίδια. Ιστορικό14 μεlatest11:53:11. Σύνδεσηbarcode χωρίς query. Μία νέα query θα ελέγξει margin29,24% (κόστος0,814,λιανική1,30,ΦΠΑ13%) και συνεχιζόμενο unit/ambiguous guard. Μόνο νέα InternetProductSearch εγγραφή αναμένεται· καμία οικονομική/stock/τιμή/ΦΠΑ/proposal/order πράξη.

**01/10/2026 — #14 PARTIAL LAB PASS / MARGIN FAIL — `fix/task14-vat-margin`:** exact `386f5d7ee894dbb55469abbe539d31d4d17ebbc4`, #1585 / CI3982–3983 / deploy1843 PASS, Node20.20.2 /1720 tests PASS. Στις11:53:11 browser μία νέα query5449000000996 επέστρεψε10 αποτελέσματα, ιστορικό13→14. UNIT/AMBIGUOUS PRICE GUARD πραγματικό LAB PASS: kalestimes rate1627,20 €/λίτρο αποκλείεται με λόγο, mymarket/BestPrice/DailyMarket/Skroutz πολλαπλές τιμές κενές με λόγο· μόνο ασφαλή priced exact συμμετέχουν, φθηνότερη ένδειξη0,93 €. Matching5 exact/3 probable/2 non-comparable,0 manual confirmations. Stock/λιανική SKU763 0/1,30,1LT9/2,60,500ML0/1,60 ίδια, MAIN2/2,40 και POS02 2/0 ίδια,1057 Audit ακριβώς ίδια. Καμία proposal/order/payment/stock πράξη. Νέο πραγματικό FAIL: Internet margin37,38% έναντι αποθήκης29,24% για κόστος0,814, μικτή λιανική1,30,ΦΠΑ13%. Ο server συγκρίνει καθαρό κόστος με μικτή λιανική· canonical αποθήκη χρησιμοποιεί sale/(1+VAT/100). Μόνη επόμενη αλλαγή ο read-only margin υπολογισμός/σαφής ένδειξη, χωρίς αλλαγή τιμής ή ΦΠΑ δεδομένων. Συνολικό #14 OPEN· αναζήτηση μετά exact νέο deploy και νέο baseline. Latest StockMovement/independent SQL count, disabled provider live και proposal/approval/order write flows NOT TESTED.

**01/10/2026 — #14 BEFORE regression online query:** exact /api/health `386f5d7ee894dbb55469abbe539d31d4d17ebbc4`, PR #1585 / PR CI3982 / main CI3983 / guarded deploy1843 PASS, Node20.20.2 /1720 PASS /0FAIL /0SKIP /build/invariants/E2E PASS. Fresh signed support MYWORKSTATION LAB, ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. SKU763 /5449000000996 stock0, αγορά0,81 €, λιανική1,30 €· control1LT stock9 /αγορά1,74 /λιανική2,60,500ML stock0 /λιανική1,60. MAIN2/2,40 € και POS02 2/0 € ίδια, Audit1057 ακριβώς ίδιο. Φρέσκο ιστορικό13 (όχι αυθαίρετη υπόθεση12), latest barcode5449000000996 /11:24:22. Η5200040119037 /11:22:17 είναι ήδη υπάρχουσα, δεν εκτελέστηκε από αυτή τη σελίδα. Συνδέθηκε barcode χωρίς query. Επόμενη μία query μόνο για την αναπαραγωγή unit-rate/ambiguous price guard· μοναδική αναμενόμενη νέα εγγραφή ιστορικού, καμία τιμή/proposal/παραγγελία/πληρωμή/stock.

**01/10/2026 — #14 PARTIAL LAB PASS / PRICE FAIL — ίδια σελίδα, `fix/task14-market-item-price`:** exact `fb58bf9610bd1193dfe54355eb9393f2468d2338`, #1582 / CI3975–3976 / deploy1840 PASS. Signed support αποθήκη/σύνδεση barcode και λειτουργικός provider PASS. Μία online query SKU763 /5449000000996 επέστρεψε9 αποτελέσματα στις11:24:22 εμφανιζόμενη ώρα browser· ιστορικό11→12. Stock0→0 και λιανική1,30→1,30 €, control Coca1LT9/2,60 € και500ml0/1,60 € ίδια, MAIN2/2,40 € και POS02 2/0 € ίδια,1057 LAB Audit ακριβώς ίδια. Δεν δημιουργήθηκαν proposal/παραγγελία/πληρωμή ή stock πράξη. Πραγματικό FAIL: kalestimes αποτέλεσμα1627,20 € παρουσιάζεται ως τεμάχιο, ενώ η πρωτογενής σελίδα το ορίζει ανά λίτρο, διαφορετικά από την τιμή προϊόντος0,65 €. Ο υπάρχων parser παίρνει το πρώτο νόμισμα χωρίς μονάδα/αμφισημία. Επόμενη μοναδική αλλαγή: αποκλεισμός unit rates και αμφίσημων πολλαπλών ποσών από item price, σαφής έλεγχος πηγής, χωρίς αυτόματη τιμή/stock/παραγγελία. Συνολικό #14 OPEN· επόμενη νέα αναζήτηση μόνο μετά exact deploy και φρέσκο baseline. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md`.

**01/10/2026 — ASSIGNED `codex/store-report-recipients-20261001`:** Owner-requested installation settings: store address and two report-recipient emails. Existing store editor accepts only one email and omits address; new bounded support pending CI/exact deploy/configuration readback. Preserve company/store isolation, existing manual-send-after-review rule and all financial/stock/fiscal flows. No messages sent. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-store-report-recipients.md`.

**01/10/2026 — Εργασία #21 · USER/LAB PASS (read-only):** exact production `6d892277796e458c2d0ba2f16297189fe19d24cd`, /api/health και πραγματική αρχική πλοήγηση καταλόγου → «€ Ποσά / Πιστωτικά» PASS. PR #1578 αρχική υλοποίηση· PR #1580 ελάχιστη διόρθωση αρχικού κουμπιού, PR CI #3971 / main CI #3972 PASS, 1699 server PASS / 0 FAIL / 0 SKIP, build PASS. MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: 01/01–01/10/2026, όλοι οι προμηθευτές, κενή αναζήτηση, 58 γραμμές. Τιμολόγια 1.859,49 €, πιστωτικά −4,27 €, πληρωμές −4.914,70 €, διορθώσεις 0 €, κίνηση/τρέχον υπόλοιπο −3.059,49 €. Πραγματικό XLSX ανοίχθηκε: 58 ταυτότητες/348 τιμές συμφωνούν, μεταδεδομένα περιόδου και σύνολα ίδια. Εκτυπώσιμη HTML αναφορά PDF/Εκτύπωση ανοίχθηκε, 58 γραμμές και σύνολα ίδια, αρχή/τέλος οπτικά ελεγμένα. Φυσική εκτύπωση/αποθηκευμένο native PDF NOT TESTED. LAB Audit 1057→1057 ακριβώς ίδιο, MAIN 2/2,40 € και LAB-POS-02 2/0 € αμετάβλητα. Καμία νέα πληρωμή, συμψηφισμός, stock ή άλλη επιχειρησιακή εγγραφή εκτελέστηκε· ανεξάρτητος DB count NOT TESTED. Αφαιρείται από ενεργές εκκρεμότητες, δεν επαναλαμβάνεται. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task21-supplier-credit-exports-assignment.md`, manual `docs/manual/suppliers/PASS.md`.

**01/10 13:16 Greece — ASSIGNED `codex/backoffice-filter-visibility-20261001`:** Independent owner-requested BackOffice column-filter visibility follow-up: high-contrast active icon, visible summary and clear-all for this table only. User confirms persisted filter hid 99/100 rows; clearing restores rows. Existing filtering works; new visibility NOT TESTED / AWAITING USER. Preserve sorting, column widths, persisted rules, pagination, tenant boundaries and all financial/stock flows. Task21 remains with its assigned page. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-backoffice-filter-visibility.md`.

**01/10 12:08 Greece — #1574 exact LIVE / AWAITING USER quantity confirmation:** runtime `aace0e7b31c46e3375db81775f0e2dd81ae9bfc0`, Render `dep-dav24gp7lnhs73agb3b0` LIVE2026-10-01T09:08:08.178347Z; PR CI36839865731/main CI36840168237 PASS (Node20/server/build/invariants/isolated HTTP E2E). All-row selection plus explicit quantity confirmation deployed, no USER application/posting PASS yet. Original delivery scoped USER PASS recorded in all five surfaces by #1574. BEFORE acceptance2026-10-01T09:06:14.956515Z: existing document5d61d44f-4611-4c2c-9f1b-c4d31bdb0a55 DRAFT/ordera0094679-8a4b-4333-a77b-9a4b793b34ba NEW,0storedrows,1job,116.96header/issue01Oct,paymentnull,0StoreTransaction/0StockMovement,all-stock hash6fb0a432ecdef428ca5f1cb137189d40. Preview/apply next only on same draft; physicalPOSpayment/posting separate. Owner retained `codex/mydata-draft-pos-receipt-20260930`; Epsilon OPEN.

**01/10 11:47 Greece — TDA6538 limited USER PASS original delivery; quantity review FAIL / ASSIGNED `codex/mydata-draft-pos-receipt-20260930`:** owner confirms same original and editable draft. Screenshot11:43, runtimeca354a97; read-onlybefore/after +1PurchaseDocument,0transactions/0movements. 7rows63units versus printedfooter19 blocks apply. Bounded explicit all-row quantity confirmation implemented;22targeted/full1693PASS1SKIP/buildPASS, AWAITING CI/EXACT DEPLOY/USER, no line-application/posting PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-mydata-quantity-human-review.md`; original number-padding acceptance closed, Epsilon/POSarrival remain OPEN. Same owner retained.

**01/10 10:52 Greece — #1569 exact LIVE / AWAITING USER:** runtime `5e6bf57e7ae119066ec189e1bd8c4017f65e9422`, Render `dep-dav10tbncjis738o01h0` LIVE2026-10-01T07:52:00.015978Z; PR CI36832059077 and main CI36832327447 PASS (Node20/build/server/invariants/isolated HTTP E2E). Final local1690PASS/1SKIP. Search issue dates/from-to, Athens daily arrivals, grouped exports and 15minute server scheduler deployed, no actual first scheduled cycle or owner UI/export acceptance yet. Same owner ASSIGNED; Epsilon provider request pending. No additional runtime deploy from docs. `CHECKPOINTS/CHANGES/2026-10-01-mydata-date-range-daily-scheduler.md`.

**01/10 — ASSIGNED `codex/mydata-draft-pos-receipt-20260930`:** issue-date from/to + Search, independent Athens daily arrivals, grouped PDF/Excel, 15-minute production server receiving implemented; local1689PASS/1SKIP/buildPASS, AWAITING CI/EXACT DEPLOY/USER. Purchase draft already uses supplier issue date; removed receipt-date fallback from archive. Existing financial/POS/Gate3 PASS protected. Epsilon CAPTCHA failure and official API request emailed; Epsilon remains OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-mydata-date-range-daily-scheduler.md`. Same owner retained; no duplicate paid-invoice test.

**ΑΝΑΤΕΘΗΚΕ — `codex/owner-multi-company-20260928` (28/09/2026):** Διαδόχου Παύλου: κοινός ιδιοκτήτης Νίκη Ραζάτου με χωριστή εταιρεία/ΑΦΜ ανά κατάστημα, επιλογή BackOffice, Super Admin ομαδοποίηση και ασφαλής αφαίρεση λανθασμένης εγγραφής ΚΑΤ. CI PASS / AWAITING LAB, κανένα είδος εισαγμένο. `CHECKPOINTS/CHANGES/2026-09-28-diadochou-owner-multi-company.md`.

**Κεντρικό αριθμημένο μητρώο και εκτυπώσιμη λίστα (28/09):** `docs/roadmap/CENTRAL_NUMBERED_WORK_2026-09-28.md` · `output/pdf/MyWorkStation_Numbered_Work_2026-09-28.pdf`. Σταθεροί αριθμοί σε κάθε ανάθεση, checkpoint και τελικό PASS. Η παρούσα αναλυτική λίστα παραμένει πηγή τεκμηρίων· ιστορικά OPEN δεν αναιρούν νεότερα PASS. Κάθε υπεύθυνη σελίδα ενημερώνει αριθμό, υπεύθυνο, scope και κατάσταση στο ίδιο PR, μαζί με το PDF. Δεν επιτρέπεται δεύτερη ανάθεση ήδη δεσμευμένου αριθμού.

**Ολοκληρώθηκε 28/09 — Gate 3 / συμφωνημένη ροή βοηθού τιμολογίου: LAB PASS.** Μία POS υποβολή → ένα επεξεργάσιμο πρόχειρο με φωτογραφίες/υφιστάμενη πληρωμή → όλες οι φυσικές γραμμές από τον βοηθό → ανθρώπινος έλεγχος και εφαρμογή στο ίδιο πρόχειρο. Τεκμήρια διαφορετικών προμηθευτών ΣΙΓΜΑ 180557, ΓΕΩΡΓΙΑΔΟΥ Β 1970, ΜΑΓΑΚΗΣ 52244, ΜΑΝΤΖΙΛΑΣ 13234/13241 και ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ 053688· το 13241 22/22 και 410,15 €. #1490 CI #3755 / `fbba0eac`, #1491 CI #3757 / exact Render `628470dd`. Ο ιδιοκτήτης επιβεβαίωσε ότι δεν επαναλαμβάνονται οι ίδιες δοκιμές. Το Gate 3 αφαιρέθηκε από τον ενεργό πίνακα. Η πρώτη αυτόματη ανάγνωση, παλιό ατομικό FAIL ΑΛΦΑ, ανεξάρτητο DB count settlement/job και πλήρες πριν/μετά παραμένουν χωριστά NOT TESTED/μελλοντική εργασία, όχι PASS. Πηγή `CHECKPOINTS/CHANGES/2026-09-28-gate3-acceptance-reconciliation.md`, `docs/manual/invoices/PASS.md` και `output/pdf/MyWorkStation_Central_Gate3_Status_2026-09-28.pdf`. Οι παλιότερες χρονολογημένες OPEN καταγραφές παρακάτω είναι ιστορικές, όχι ενεργές αναθέσεις.

**28/09 — Gate 3 συγκεντρωτική συμφιλίωση / OPEN:** Επιβεβαιωμένες ροές βοηθού σε ΣΙΓΜΑ 180557, ΓΕΩΡΓΙΑΔΟΥ Β 1970, ΜΑΓΑΚΗΣ 52244, ΜΑΝΤΖΙΛΑΣ 13234/13241 και ορατή τελική καρτέλα ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ 053688. Το 13241 έχει πλέον ανεξάρτητη σύγκριση 22/22 με το έντυπο. Τα αρχικά OCR FAIL είναι ιστορικά και η ακρίβεια της πρώτης ανάγνωσης μετατέθηκε. Το #1490 διορθώνει τη στάσιμη ένδειξη πρόχειρου σε «Ανάγνωση από βοηθό»· CI/deploy/LAB readback εκκρεμούν. Μοναδικότητα settlement/job στη βάση και πλήρες πριν/μετά δεν αποδεικνύονται από εικόνες. Πλήρης πίνακας `CHECKPOINTS/CHANGES/2026-09-28-gate3-acceptance-reconciliation.md` και κεντρικό PDF `output/pdf/MyWorkStation_Central_Gate3_Status_2026-09-28.pdf`. Η ακόλουθη μακρά ιστορική καταγραφή διατηρεί ημερομηνίες των τότε OPEN/FAIL και δεν αντικαθιστά αυτή τη νεότερη κατάσταση.

**Ολοκληρώθηκε 28/09 — περιορισμένο Gate 3 ΜΑΝΤΖΙΛΑΣ 13241, εφαρμογή στο ίδιο πρόχειρο:** 22 γραμμές, 345,07 € καθαρό με ΕΦΚ και 410,15 € πληρωτέο μετά τον βοηθό, χωρίς δεύτερο POS ανέβασμα. Η εφαρμογή σειρών αυτού του δείγματος αφαιρείται από ενεργή εκκρεμότητα. Νεότερες εικόνες 081918/081942/081942-1/083429 επέτρεψαν πλήρη σύγκριση 22/22 φυσικών σειρών, κωδικών, περιγραφών και ποσοτήτων με το έντυπο, περιλαμβανομένης της γραμμής 15 (`60002`, 1 ΤΜΧ, 6,03 €). Η αλλαγή σειράς COCA COLA ZERO/ΛΟΥΞ δεν αφαιρεί είδος. Το δείγμα 13241 είναι περιορισμένο LAB PASS πλήρους πίνακα στο ίδιο πρόχειρο. Τελική καταχώριση, ανεξάρτητη μοναδικότητα settlement/job και readback πληρωμής/stock του 13241 είναι NOT TESTED· το συνολικό Gate 3 OPEN κατά τη συμφιλίωση διαφορετικών προμηθευτών. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

**27/09 — Ετικέτα EAN-13: συνολικό scope PASS / αφαιρέθηκε από τις εκκρεμότητες.** USER PASS φυσικής εκτύπωσης→σάρωσης, LAB PASS προεπισκόπησης/Audit και αποκλεισμού άκυρου EAN, δεύτερο LAB readback με διαφορετικές ρυθμίσεις, HTTP E2E 200/403/403 (#1459, CI #3690). Production εχθρικό API αίτημα με LAB token NOT TESTED. ΚΑΤ αμετάβλητο. Checkpoint `CHECKPOINTS/CHANGES/2026-09-27-ean13-label-isolation-final.md`.


**ASSIGNED - `codex/mydata-draft-pos-receipt-20260930` (same installation page, owner 30/09 22:46):** Automatic supplier original PDF from downloadingInvoiceUrl → same inbox attachment → one AI review job → durable editable PurchaseOrder draft with existing invoice assistant → human approval through existing workflow. Remaining ASSIGNED same installation page:137177 multipage PDF incorrectly counts as1 photograph and inline native thumbnail pane prevents readable zoom. Physical-page counter, inline wheel/hand canvas viewer and per-row printed-net rounding AWAITING CI/DEPLOY/USER; no manual price/discount workaround. Previous HTTP400 absent in latest137177 observation; no complete reading/apply PASS,0.11 economic difference/unknown package factors still require review. Draft handoff/original display completed limited USER/LIVE PASS01/10 00:24, checkpoint/manual; no repeat creation/payment. Impact adapter first; no mass historic posting. Cursor/replay and other providers remain OPEN (Papadopoulou Epsilon35158/35000 confirmed unsupported; viewer timeout, no original PDF verified). Later POS photograph/payment linkage implemented AWAITING CI/DEPLOY/USER: first physical receipt only, strict identity, preserve original job/order and reviewed rows, block second submission before payment. Approved purchases get receipt/payment metadata only; no new stock. Existing settlement allocations refuse duplicate payment. Non-Premium legacy POS linkage, credit-note arrival and POS-first original acquisition remain OPEN. Full-archive owner export cancelled as unnecessary. PDF readability USER PASS 22:40 (194012/194043), identifiers/amounts intact. `CHECKPOINTS/CHANGES/2026-09-30-mydata-provider-original.md`. Exact #1562 ae8fa98b live01/10 00:07 Greece, PR/main CI PASS; physical receipt USER acceptance pending, PDF AI review FAIL awaiting bounded fix. Before135848 draft-only baseline recorded01/10 00:09–00:10; no production payment/finalization test.

# MyWorkStation - Κεντρική λίστα εκκρεμοτήτων και σειρά υλοποίησης

**01/10 13:00 — Εργασία 20 / ΤΕΛΙΚΟ LAB PASS:** Μία μόνο LAB πώληση 1,20 € με TEST 1 και TEST 2 ως δώρο επιβεβαίωσε stock 12→11 / −1→−2, μία SALE ανά γραμμή, «Δώρο» στη δεύτερη, MAIN 1/1,20 €→2/2,40 € και LAB-POS-02 αμετάβλητο 2/0 €. Exact deployed `aace0e7b…` περιέχει το fix `a50aa6b…`. Η εργασία αφαιρείται από τις ενεργές εκκρεμότητες και η πώληση δεν επαναλαμβάνεται. `CHECKPOINTS/CHANGES/2026-10-01-task20-pos-gift-stock-ledger.md`.

**01/10/2026 11:18 — Εργασία 20 / ΑΝΑΤΕΘΗΚΕ `fix/promotion-stock-ledger`:** Η μία εγκεκριμένη LAB πώληση αγορά 1 × LAB EXCEL TEST 1 / δώρο 1 × LAB EXCEL TEST 2 καταγράφηκε μία φορά σε βάρδια και Audit, αλλά χωρίς SALE εγγραφές στο StockMovement. Τα τρέχοντα stock ενημερώθηκαν. Διορθώνεται μόνο η ledger εγγραφή ανά tracked-stock γραμμή, μέσα στην ίδια transaction και με idempotency key. Δεν γίνεται δεύτερη πληρωμή ούτε αναδρομικό production backfill. LAB retest μόνο μετά CI/merge/exact deploy και νέο πλήρες baseline. `CHECKPOINTS/CHANGES/2026-10-01-task20-pos-gift-stock-ledger.md`.

**27/09 21:47 Ελλάδα — checksum EAN-13 UI LAB PASS, απομόνωση OPEN:** Στο LAB POS 2, το δοκιμαστικό `4006381333932` αποθηκεύτηκε στο LAB EXCEL TEST 2 χωρίς αλλαγή τιμής. Μετά από πλήρη ανανέωση εμφανίζεται στη λίστα barcode αλλά όχι στις εκτυπώσιμες ετικέτες· το έγκυρο `2900000000025` διατηρεί κουμπί. Stock 0, καλάθι 0,00 €, κανένα νέο εκτυπώσιμο tab. Κινήσεις/βάρδια/Audit χωρίς πλήρες πριν/μετά NOT TESTED. Απομόνωση δεύτερου δοκιμαστικού καταστήματος **OPEN**, συνολικό scope OPEN· πραγματικό ΚΑΤ εκτός δοκιμής.
**Ημερομηνία βάσης:** 23/09/2026

**Ολοκληρώθηκε 27/09 — περιορισμένο Gate 3 ΜΑΓΑΚΗΣ 52244:** ένα POS upload δύο αρίθμητων φύλλων, ίδιο πρόχειρο σωστού προμηθευτή/ΑΦΜ, βοηθός 30 γραμμές/110 τμχ. Ο ιδιοκτήτης επιβεβαίωσε τη γραμμή 8 και εφάρμοσε 30/30· readback πρόχειρου 153,74 € καθαρό / 173,70 € πληρωτέο έναντι 153,70 / 173,68 € τυπωμένων (+0,04/+0,02 εντός ±0,05). PR #1449 / CI #3675 / exact Render `af0fcbfd`. Οριστικοποίηση/stock για αυτό το LAB δείγμα εξαιρέθηκαν ρητά από επανάληψη, καθώς ελέγχθηκαν με άλλα τιμολόγια. Δεν έγινε δεύτερη POS πληρωμή. Το συγκεκριμένο δίφυλλο αφαιρείται από τις ενεργές εκκρεμότητες· Gate 3 OPEN για άλλα διαφορετικά σενάρια. `CHECKPOINTS/CHANGES/2026-09-27-gate3-magakis-52244-unnumbered-pages.md`.

**27/09 — Ετικέτα EAN-13, περιορισμένο LAB PASS Audit:** Μετά το #1435 / CI #3644 / exact Render `05af8875`, μία προεπισκόπηση ΝΕΡΟ 500ML / `5201219000118` από LAB POS 2 εμφανίστηκε στα κεντρικά Συμβάντα ως προεπισκόπηση, Καρτέλα Barcode, 0,00 €, χωρίς βεβαίωση φυσικής εκτύπωσης. Τότε ο έλεγχος μη έγκυρου EAN στο UI και η απομόνωση δεύτερου δοκιμαστικού καταστήματος έμεναν OPEN· ο νεότερος UI έλεγχος checksum καταγράφεται επάνω. Το USER PASS χαρτί→σάρωση διατηρείται. Συνολικό scope OPEN.

**27/09 — αρνητικό δείγμα EAN:** Το LAB POS 2 δεν προσέφερε ετικέτα για το ήδη καταχωρισμένο 8ψήφιο `54491069` του SPRITE 500ML / SKU 992. Τοπικά 3/3 tests απορρίπτουν άκυρο 13ψήφιο checksum χωρίς εκτυπώσιμο έγγραφο. Τότε ο UI έλεγχος λάθους checksum 13 ψηφίων και η απομόνωση δεύτερου δοκιμαστικού καταστήματος έμεναν OPEN· ο νεότερος UI έλεγχος checksum καταγράφεται επάνω. Δεν χρησιμοποιείται το πραγματικό ΚΑΤ ως δοκιμαστικό.

**Ολοκληρώθηκε 27/09 — περιορισμένο Gate 3 053688:** Οριστική καρτέλα 5 γραμμών / 185,99 € με ΑΦΜ 800760691, μία αγορά 185,99 € στον προμηθευτή, πέντε stock ποσότητες 30/80/40/40/30 με ορατές κινήσεις και χωρίς διαφορά ή πιθανά διπλά. Το PR #1396 / CI #3556 / Render `2a88b553` διόρθωσε την προβολή κόστους πίτσας σε 1,05 €/τμχ. Αυτό το συγκεκριμένο readback δεν επαναλαμβάνεται· δεν αποτελεί ολικό Gate 3 PASS. Ιστορικό πριν/μετά POS1/POS2 και τα ανοιχτά FAIL άλλων τιμολογίων παραμένουν εκκρεμή. Αναλυτικό `CHECKPOINTS/CHANGES/2026-09-27-gate3-inventory-archive-pack-cost.md`.


**Ολοκληρώθηκε 27/09 — περιορισμένο Gate 3 ΓΕΩΡΓΙΑΔΟΥ Β 1970:** μία υποβολή LAB POS 2 με πίστωση παρέδωσε ίδιο πρόχειρο 6 γραμμών / 20 τεμαχίων / 27,44 € καθαρό / 31,01 € πληρωτέο. Ο βοηθός βρήκε 6/6 χωρίς διορθώσεις και η οριστική καρτέλα έδειξε έξι συνδεδεμένα είδη, σωστό ΑΦΜ 174696914. Ο ιδιοκτήτης επιβεβαίωσε τον κωδικό της τρίτης γραμμής. Το ολοκληρωμένο readback πρώτου πρόχειρου/βοηθού αφαιρείται από την ενεργή εκκρεμότητα· νεότερο readback έδειξε μία ορατή λογιστική PURCHASE 31,01 € και τωρινό stock 8/6/1/1/2/2. Τα ιστορικά και των έξι ειδών έδειξαν από μία ορατή PURCHASE Β 1970, +8/+6/+1/+1/+2/+2, stock 8/6/1/1/2/2, διαφορά/πιθανά διπλά 0. POS/stock πριν/μετά, μοναδικότητα settlement/job στη βάση και άλλα σενάρια παραμένουν NOT TESTED. Gate 3 OPEN. `CHECKPOINTS/CHANGES/2026-09-27-gate3-georgiadou-b1970-scoped-lab-pass.md`.

**Κατάσταση:** Ενεργή πηγή αλήθειας για όσα δεν έχουν ακόμη πραγματικό PASS

**TABLE_SERVICE — ανάθεση `agent/table-service-layout-takeover-20260927` / OPEN:** Δομημένα αλλεργιογόνα LAB PASS (#1439), κάτοψη LAB PASS (#1445). **Ολοκληρώθηκε** η επιμέρους φυσική αποστολή νέου γύρου από Android κινητό με προσωπικό PIN, δωρεάν product-specific modifier και readback πόστου ΚΑΦΕ στις 27/09 23:41· δεν επαναλαμβάνεται για τεκμηρίωση. Η εμφάνιση του `TABLE_ORDER_ROUND_SENT` στο κεντρικό Audit ολοκληρώθηκε (#1471/#1472). Η εγκατάσταση και εκκίνηση Android PWA από εικονίδιο στο LAB επιβεβαιώθηκαν ως περιορισμένο USER PASS 28/09 ~00:52. Το οπτικό offline/reconnect USER PASS έγινε 19:19–19:20· η ανάκτηση προϊόντων, PIN login και γύρος μέσα από το εγκατεστημένο εικονίδιο, αρνητικό cross-store, χρεώσιμοι modifiers/εισφορά, μεταφορά/ένωση/split και πλήρες KDS/ειδοποιήσεις παραμένουν OPEN/NOT TESTED. Συνολικό TABLE_SERVICE OPEN.
**Εκτυπώσιμο συνοπτικό στιγμιότυπο 27/09:** `output/pdf/MyWorkStation_Central_Status_2026-09-27.pdf` (Gate, αναθέσεις efood/τραπεζιών, εγκατάσταση). Σε μεταγενέστερη αλλαγή υπερισχύει πάντα το παρόν αρχείο και απαιτείται ενημέρωση του PDF στο ίδιο τελικό PASS PR.
**Εξαιρέσεις από αυτή τη σελίδα:** Τιμολόγια/OCR και η εξωτερική διασύνδεση efood/Pelican εκτελούνται από τις αντίστοιχες εξειδικευμένες σελίδες. Το γενικό Online Ordering/Delivery του MyWorkStation ολοκληρώθηκε ως Gate 6 και παραμένει ανεξάρτητο από efood/Pelican.

## Μητρώο αναθέσεων μεταξύ σελίδων — 27/09/2026

| Εργασία | Υπεύθυνη σελίδα / τεκμήριο | Τρέχουσα κατάσταση | Κανόνας για άλλες σελίδες |
| --- | --- | --- | --- |
| efood / Pelican Indirect POS | Εξειδικευμένη σελίδα efood/Pelican · `CHECKPOINTS/CHANGES/2026-09-13-efood-pelican-phase-a-foundation.md` και `CHECKPOINTS/CHANGES/2026-09-23-efood-lab-schema-bootstrap.md` | **ΑΝΑΤΕΘΗΚΕ ΑΛΛΟΥ · OPEN**. Phase A και φόρμα LAB έχουν επιμέρους PASS· test-vendor/sandbox, πραγματική διαδρομή παραγγελίας και παραγωγική πιστοποίηση δεν έχουν συνολικό PASS. | Δεν αναλαμβάνεται από γενική σελίδα Online/Delivery ή άλλη σελίδα. Το Gate 6 PASS δεν κλείνει την εξωτερική διασύνδεση. |
| Εστίαση / TABLE_SERVICE — τραπέζια, σερβιτόροι, ασύρματη παραγγελιοληψία, πόστα κουζίνας/καφέ/μπαρ, λογαριασμός/πληρωμή | `agent/table-service-layout-takeover-20260927` · `CHECKPOINTS/CHANGES/2026-09-27-table-service-mobile-waiter.md` | **OPEN**. Φυσική κινητή αποστολή Γ3 27/09 PASS μόνο για το συγκεκριμένο σενάριο· τα υπόλοιπα παραπάνω OPEN. | Δεν επαναλαμβάνεται το ολοκληρωμένο σενάριο για τεκμηρίωση. Τα υπόλοιπα ανήκουν στη δεσμευμένη σελίδα μέχρι συγχωνευμένο handoff. |

**Υποχρεωτικός κύκλος για κάθε τωρινή και μελλοντική σελίδα:** Πριν αρχίσει, διαβάζει το σημερινό `main`, την παρούσα λίστα και το σχετικό checkpoint/manual. Αναλαμβάνει μόνο `OPEN` μη ανατεθειμένη εργασία, καταγράφοντας εδώ `ΑΝΑΤΕΘΗΚΕ — <σελίδα/branch>` και το ακριβές scope. Όσο η ανάθεση είναι ενεργή, καμία δεύτερη σελίδα δεν την παίρνει. Για κάθε πραγματικό επιμέρους PASS δημοσιεύει αμέσως τεκμήριο, ακριβές όριο και τα εναπομένοντα· αφαιρεί μόνο την επιμέρους ολοκληρωμένη γραμμή. Για τελικό PASS, **η ίδια υπεύθυνη σελίδα**, στο ίδιο PR και μετά από πραγματική LAB/USER αποδοχή, ενημερώνει checkpoint, `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`, `docs/manual/<module>/PASS.md`, την παρούσα λίστα και το κεντρικό PDF. Η ολοκληρωμένη εκκρεμότητα διαγράφεται από την ενεργή λίστα και σημειώνεται PASS/κλειδωμένη στο ιστορικό· δεν μένει δεύτερο `OPEN` που θα μπορούσε να ξανααναληφθεί. CI ή merge μόνο του δεν κλείνει εργασία. Αν η σελίδα σταματήσει πριν από PASS, παραδίδει με συγχωνευμένο checkpoint και κρατά την ανάθεση έως τη ρητή ανάληψη της επόμενης σελίδας.

**Κοινός κανόνας δοκιμών από 24/09/2026:** Πριν από **κάθε** νέα δοκιμαστική κίνηση, η υπεύθυνη σελίδα αποθηκεύει στο checkpoint ανανεωμένα ποσά και πλήθος κινήσεων ανά εμπλεκόμενη βάρδια/terminal, ποσότητα και τελευταία κίνηση κάθε εμπλεκόμενου SKU, καθώς και σχετικό Audit/report. Μετά από **μία** ταυτοποιημένη ενέργεια διαβάζει ξανά ακριβώς τα ίδια στοιχεία και καταγράφει τη διαφορά και το μη εμπλεκόμενο POS ως μάρτυρα. Χωρίς πριν/μετά, το αντίστοιχο σκέλος μένει `NOT TESTED`, ακόμη κι αν υπάρχει εικόνα μόνο του τελικού αποτελέσματος. Ισχύει για κάθε Gate και κάθε σελίδα, συμπεριλαμβανομένων των ειδικών σελίδων τιμολογίων και delivery.

**Τελική διόρθωση Gate 4 — 25/09/2026:** Το Gate 4 έχει **PASS / ΟΛΟΚΛΗΡΩΜΕΝΟ**. Στο φυσικό LAB POS 2 η τοπική ουρά εμφανίστηκε `0` μετά την επανασύνδεση, ενώ η offline πώληση καταχωρίστηκε ακριβώς μία φορά σε βάρδια, stock και Audit. Τα δύο παλιά `PENDING` με 0 προσπάθειες διατηρούνται μόνο ως ιστορικό Audit exception και δεν αποτελούν ενεργή ουρά. Η τελική καταγραφή βρίσκεται στο `CHECKPOINTS/CHANGES/2026-09-25-gate4-offline-local-queue-readback-awaiting-lab.md`. Οι παλιότερες αναφορές `OPEN`/`PENDING` του Gate 4 στο ιστορικό του παρόντος αρχείου έχουν αντικατασταθεί και δεν δημιουργούν νέα εργασία ή επανάληψη δοκιμών.

> **Δεσμευτική προθεσμία:** εγκατάσταση και βασική επιχειρησιακή δοκιμή σε κατάστημα έως την **Κυριακή 27/09/2026**. Μέχρι να ολοκληρωθεί το παρακάτω go-live checklist, προηγείται από την ανάπτυξη μεγάλων νέων modules.

## 25/09/2026 — Gate 4 έκπτωση δικαιούχου: Audit και POS εφαρμογή — ASSIGNED `agent/gate4-master-bulk-audience-20260925`

Η ατομική αποθήκευση 10% / Ιατροί / LAB στο ΝΕΡΟ 500ML έχει USER PASS 09:15. Η μαζική επιλογή και απάντηση αποθήκευσης 10% σε 2 ενεργά προϊόντα ΝΕΡΟ 1,5LT / EVIAN 500ML έχουν USER PASS 10:01 (PR #1215, CI #3078, deploy `558cc179`). Το καλάθι φυσικού LAB POS 2 / Ιατρός είχε USER PASS 10:28: 1,00→0,90 € και 1,50→1,40 €, σύνολο 2,30 € με υφιστάμενη στρογγυλοποίηση γραμμής προς το επόμενο 0,10 €. Η **μία πώληση 10:49:31 έχει μετρημένο LAB PASS**: μετρητά 2,30 €, POS02 14→15 κινήσεις και 5,20→7,50 €, POS01 αμετάβλητο, stock 2270 −6→−7 και EVIAN 0→−1, Sale/Audit «Ιατρός» με ίδιο ποσό/ώρα. **Τα ολοκληρωμένα σκέλη αποθήκευσης, καλαθιού και αυτής της πώλησης αφαιρέθηκαν από τις εκκρεμότητες και δεν επαναλαμβάνονται.** Εκκρεμούν μόνο ανεξάρτητος έλεγχος του παλιού before/after κανόνα, ιστορική αμεταβλητότητα μη επιλεγμένων/εφαρμογή τρίτου είδους, άλλοι δικαιούχοι/καταστήματα και λοιπά σκέλη Gate 4. Δεν επαναλαμβάνεται πώληση ή αποθήκευση μόνο για να καλυφθεί απουσία παλιού baseline. Συνολικό Gate 4 PENDING.

**Ολοκληρώθηκε 25/09 — ανάγνωση ιστορικού Audit έκπτωσης:** PR #1229, CI #3113 και ακριβές Render `2c1e4b3f`· στο LAB/Ιατροί ανακτήθηκε η παλιά εγγραφή 10:00:45, 10%, δύο IDs, Audit `e5073b16…`, και οι προηγούμενες μονές 09:52:30/09:15:15. Περιορισμένο LAB PASS ανάγνωσης και ύπαρξης συμβάντος, χωρίς νέα αποθήκευση. Η υποεργασία αφαιρέθηκε από τις εκκρεμότητες. Το παλιό πλήρες before/after του κανόνα και η προστασία μη επιλεγμένων προϊόντων παραμένουν NOT TESTED, συνολικό Gate 4 PENDING.

**Ολοκληρώθηκε 25/09 — ανάγνωση τωρινών LAB/Ιατροί κανόνων:** PR #1231, CI #3117, exact Render `baf5d0b7`· τρία ενεργά προϊόντα ΝΕΡΟ 500ML, ΝΕΡΟ 1,5LT και EVIAN 500ML, όλα 10%, με IDs που συμφωνούν με τα ιστορικά Audit και την ένδειξη τριών προϊόντων στο φυσικό POS. Περιορισμένο LAB PASS του σημερινού στιγμιότυπου, χωρίς αποθήκευση/πώληση. Η υποεργασία αφαιρέθηκε από τις εκκρεμότητες. Πλήρες παλιό before/after, διαχρονική προστασία μη επιλεγμένων και ολικό Gate 4 PENDING.

**Ολοκληρώθηκε 25/09 — ένα μη επιλεγμένο SKU στο φυσικό POS:** στις 11:46–11:47, το ΝΕΡΟ ΠΙΠΙΛΑ 750ML / SKU 2273 παρέμεινε **0,80→0,80 €** στο ίδιο καλάθι από «Κανονική τιμή» σε «Ιατρός» με 3 ενεργούς άλλους κανόνες. Περιορισμένο USER PASS καλαθιού, χωρίς πώληση. Stock −3→−3, POS1/POS2 ποσά/κινήσεις ίδια, exact Render `0a292fff` πριν/μετά. Το συγκεκριμένο σκέλος αφαιρέθηκε από τις εκκρεμότητες· η παλιά συνολική αμεταβλητότητα κανόνων, άλλες περιπτώσεις/checkout και πλήρες Gate 4 παραμένουν OPEN.

**Ολοκληρώθηκε 25/09 — ένας κανόνας Νοσηλευτών στο LAB:** στις 12:27:17 μία αποθήκευση 20% στο ενεργό ΝΕΡΟ ΠΙΠΙΛΑ 750ML (SKU 2273) άλλαξε 0→1 ενεργό κανόνα με νέα εγγραφή Audit `f63d7b2e…`, ενώ οι 3 κανόνες Ιατρών έμειναν ίδιοι, exact Render `db38b4de`. Περιορισμένο LAB PASS μόνο της αποθήκευσης/ανάγνωσης. **Αυτό το σκέλος αφαιρέθηκε από τις εκκρεμότητες**· φυσικό POS/checkout και άλλοι δικαιούχοι ή καταστήματα παραμένουν OPEN. Δεν επαναλαμβάνεται η αποθήκευση.

**Ολοκληρώθηκε 25/09 — καλάθι Νοσηλευτών στο φυσικό LAB POS 1:** μετά τη νέα βάρδια, ο ιδιοκτήτης επιβεβαίωσε χωρίς διαθέσιμη εικόνα ότι 1 × ΝΕΡΟ ΠΙΠΙΛΑ 750ML / 2273 με 20% εμφανίζει **0,70 €** αντί βασικής 0,80 €. POS1 0→0 κινήσεις / 0,00 € και POS2 16→16 / 7,50 € μετά από ανανέωση, χωρίς πώληση. Περιορισμένο **USER PASS της αναφερόμενης τιμής καλαθιού**· αυτό το σκέλος αφαιρέθηκε από τα pending και δεν επαναλαμβάνεται για εικόνα. Checkout/stock/Audit, άλλοι δικαιούχοι/καταστήματα και συνολικό Gate 4 OPEN.

**Ολοκληρώθηκε 25/09 — μία πώληση Νοσηλευτών στο φυσικό LAB POS 1:** στις 13:15:08 ο ιδιοκτήτης ολοκλήρωσε μία πώληση ΜΕΤΡΗΤΑ 1 × SKU 2273 / 0,70 €. POS1 0→1 κινήσεις / 0,00→0,70 € μετρητά, POS2 16→16 / 7,50 € αμετάβλητο, stock −3→−4, τελευταία πώληση ενημερώθηκε· κεντρικό Audit sale `a98ef87c-f076-47fb-aace-86e22252447d` και ολοκλήρωση με «Νοσηλευτής / Νοσοκόμος» / CASH / 0,70 €. **Περιορισμένο LAB PASS** αυτής της πώλησης και οι έλεγχοι ταμείου, stock και Audit αφαιρούνται από τα pending για το συγκεκριμένο σενάριο. Φυσική απόδειξη/fiscal, άλλα σενάρια και συνολικό Gate 4 OPEN. Δεν ξαναγίνεται η ίδια πώληση.

**Ολοκληρώθηκε 25/09 — τωρινή ανάγνωση κανόνων τεσσάρων ομάδων LAB:** Ιατροί 3 ενεργοί κανόνες 10%, Νοσηλευτές 1 ενεργός κανόνας 20% για SKU 2273, Προσωπικό 0, Πελάτες 0. Τα IDs και Audit των ενεργών κανόνων δεν άλλαξαν από τις καταγεγραμμένες αποθηκεύσεις. PASS read-only snapshot σε ένα κατάστημα· η επανάγνωση των ίδιων κανόνων αφαιρείται από τα pending. Ιστορική αμεταβλητότητα, απομόνωση άλλου καταστήματος και συνολικό Gate 4 OPEN. Χωρίς νέα πώληση ή αποθήκευση.

**Ολοκληρώθηκε 25/09 — τιμές καλαθιού Προσωπικού και Πελάτη στο φυσικό LAB POS 2:** εικόνες ιδιοκτήτη 14:04 με 1 × SKU 2273, Προσωπικό 0 ενεργές εκπτώσεις / **0,80 €** και Πελάτης 0 / **0,80 €**. Τα δύο POS έμειναν 1/0,70 € και 16/7,50 € αντίστοιχα, απόθεμα 2273 −4 και τελευταία πώληση 13:15:08 αμετάβλητα. **PASS αυτού του καλαθιού**, αφαιρέθηκε η συγκεκριμένη υποεργασία από τα pending και δεν επαναλαμβάνεται. Checkout αυτών των δύο ομάδων, κάρτα δικαιούχου, άλλο κατάστημα και το συνολικό Gate 4 παραμένουν OPEN.

## Επίσημη σειρά Gate 1-8

Η συμφωνημένη σειρά του `UNIFIED_LAB_FIRST_PRINT_CHECKLIST_2026-09-09.md` παραμένει υποχρεωτική. Η αναλυτική λίστα ιδεών πιο κάτω είναι backlog και δεν αλλάζει τη σειρά των Gates.

| Gate | Αντικείμενο | Τρέχουσα κεντρική κατάσταση | Ιδιοκτησία/επόμενη ενέργεια |
| --- | --- | --- | --- |
| 1 | Προϊόντα και εισαγωγή στα LAB | **PASS** | Καταγεγραμμένο στο `docs/manual/products-master-catalog/PASS.md`. Δεν επαναλαμβάνεται. |
| 2 | Αποθήκη και κινήσεις αποθέματος | **PASS** | Επιβεβαιωμένο από τον ιδιοκτήτη. Καταγράφεται στο `docs/manual/inventory/PASS.md` και δεν επαναλαμβάνεται. |

Περιορισμένο LAB PASS 26/09: ΣΙΓΜΑ/ΛΕΒΕΝΤΟΠΟΥΛΟΣ 180557, πρώτο αυτόματο πρόχειρο 10/35/41,22 €/46,58 € ακριβές. Το Gate 3 παραμένει ανατεθειμένο και OPEN λόγω ΑΛΦΑ 110Μ/5532 0 γραμμές, ΦΟΡΤΙΣ 0 γραμμές και άλλων FAIL. Δεν επαναλαμβάνουμε την ίδια POS συναλλαγή· οι εκκρεμότητες αποθήκης/πληρωμής/οριστικοποίησης δεν κλείνουν από αυτό το PASS. Αναλυτικό κοινό checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

Ο διαδραστικός έλεγχος του ίδιου ΣΙΓΜΑ επέστρεψε 10/10 σωστές σειρές, 0 διορθώσεις/ελλείπουσες/διαγραφές και τυπωμένο 46,58 €. Ο πίνακας προεπισκόπησης επανυπολόγισε 46,59 € (+0,01 € εντός ανοχής)· δεν εφαρμόστηκε αλλαγή στο ακριβές πρόχειρο. Το συγκεκριμένο σκέλος ανάγνωσης βοηθού ολοκληρώθηκε, ενώ τα FAIL άλλων προμηθευτών και οι εκκρεμότητες καταχώρισης διατηρούνται.

Νέο LAB FAIL ΜΑΝΤΖΗΛΑΣ 13234: πρώτο αυτόματο πρόχειρο 0/0,00 € αντί 17 τυπωμένων γραμμών / 116 / 369,36 €. Η διαδραστική ανάγνωση βρήκε 17 και +0,02 € εντός ανοχής, αλλά ο μετρητής ελλειπουσών γράφει 2. Ανοιχτή διερεύνηση της πρώτης ανάγνωσης και του μετρητή, και readback του ίδιου πρόχειρου μετά από κανόνα `09000` 1 ΚΒ = 24 ΤΜ. Η διάταξη εκμάθησης τύπου Mini είναι τοπικά έτοιμη, **AWAITING CI/DEPLOY/LAB**· δεν κλείνει τα FAIL ούτε πιστοποιεί αποθήκη/οριστικοποίηση.

Νεότερη οδηγία ιδιοκτήτη 26/09: προτεραιότητα είναι **πληρωμή POS → ένα ανθεκτικό επεξεργάσιμο πρόχειρο με φωτογραφίες και ένδειξη «Ανάγνωση από βοηθό» → πλήρης ανάγνωση/διόρθωση από βοηθό → έλεγχος και καταχώριση**. Η ακρίβεια της πρώτης αυτόματης ανάγνωσης γραμμών μετατίθεται σε μελλοντική αναβάθμιση. Το μηδενικό αρχικό αποτέλεσμα 13234 παραμένει ιστορικό FAIL αυτής της χωριστής λειτουργίας, αλλά δεν μπλοκάρει τη δοκιμή του βοηθού στο υπάρχον πρόχειρο. Το κόκκινο OCR διαγνωστικό σε ήδη δημιουργημένο πρόχειρο αντικαθίσταται από σαφή ένδειξη βοηθού· πραγματική αποτυχία παράδοσης πρόχειρου συνεχίζει να εμφανίζεται ως σφάλμα. Εκκρεμούν CI/deploy/LAB, πλήρεις 17 γραμμές στο ίδιο πρόχειρο, οικονομικός έλεγχος και έλεγχος τελικής ασφαλούς καταχώρισης.

**Νεότερο περιορισμένο LAB PASS 27/09 — ΟΛΥΜΠΟΣ 26505:** 13 γραμμές εφαρμόστηκαν στο ίδιο πρόχειρο, 69,88 € καθαρό και +0,01 € μικτή απόκλιση εντός ανοχής· οι δύο ΣΕΤ 633/667 φαίνονται με 6 τεμάχια αποθήκης ανά κωδικό. Ο ιδιοκτήτης είδε πράσινο ✓ στις αντιστοιχισμένες γραμμές. Μετά το PR #1429, η 633 αποθηκεύτηκε με λιανική 1,10 €, 2 ΣΕΤ → 6 τμχ και markup +29,71%· το προηγούμενο μπλοκάρισμα της φόρμας λύθηκε στο παρατηρημένο δείγμα. Το επιμέρους readback αφαιρείται από τις εκκρεμότητες. Refresh, οριστικοποίηση, stock/πληρωμή, πλήρης διαπρομηθευτικός έλεγχος και ατομική αντιπαραβολή όλων των φυσικών γραμμών παραμένουν ανοιχτά. Gate 3 OPEN. Αναλυτικό checkpoint `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

**ΑΝΑΤΕΘΗΚΕ — `agent/gate3-photo-rotate-packaging-ui-20260927` (27/09/2026):** ανεξάρτητη οπτική υποεργασία βοηθού: περιστροφή φωτογραφίας μόνο για προβολή και προαιρετικές επιλογές 1/6/12/24 ή άλλου ακέραιου για κανόνα συσκευασίας. Το 26505 παραμένει προς ανάγνωση από βοηθό· PR #1380, CI #3518 PASS, exact Render `a16623a`, οπτικό LAB AWAITING, Gate 3 OPEN.

**ΑΝΑΤΕΘΗΚΕ — `agent/gate3-known-rules-20260927` (27/09/2026):** ανεξάρτητο στενό σκέλος του ήδη ανατεθειμένου βοηθού: ανάγνωση ρητά επιβεβαιωμένων κανόνων συσκευασίας ίδιου ΑΦΜ/κωδικού στην προεπισκόπηση. Το #1373 / CI #3507 / exact Render `78fa74e` έδειξε 3 «ΠΡΟΣ ΕΛΕΓΧΟ» στο 13234, δύο για ήδη αποθηκευμένους κανόνες 046/045 και ένα για περιγραφή 00211· ο ιδιοκτήτης αποθήκευσε και 043 1 ΚΒ=6 ΤΜ. CI #3509 PASS, PR #1374 merged, exact Render `470d740`; νέα LAB ανάγνωση AWAITING, Gate 3 OPEN. Η ευρύτερη διαπρομηθευτική αποδοχή και το πρώτο αυτόματο πρόχειρο δεν μεταβιβάζονται σε αυτό το σκέλος.

Στενή διόρθωση υπό CI: ο μετρητής του βοηθού εμφανίζει όλες τις φυσικές γραμμές που λείπουν (17 στο 13234) και χωριστά τις ήδη πλήρως συμπληρωμένες (2 στο πρώτο αποτέλεσμα). Οι υπόλοιπες απαιτούν συμπλήρωση/επιβεβαίωση πριν εφαρμοστούν. Δεν αποτελεί PASS ανάγνωσης, εφαρμογής ή τελικής καταχώρισης.
| 4 | POS 1 και POS 2 στα LAB | **PASS — ΟΛΟΚΛΗΡΩΜΕΝΟ** | Επιβεβαιώθηκαν δύο POS, ανεξάρτητες βάρδιες/χειριστές, κοινό stock, πωλήσεις, πληρωμές, ακυρώσεις/επιστροφές, εκπτώσεις, αντίγραφο NON_FISCAL και offline συγχρονισμός με ορατή τοπική ουρά `0`. Δεν επαναλαμβάνεται. |
| 6 | Online παραγγελίες και Delivery | **PASS — ΟΛΟΚΛΗΡΩΜΕΝΟ / ΚΛΕΙΔΩΜΕΝΟ** | Πραγματικό LAB PASS με `ONL-002`: σωστό `LAB-POS-02`, μία πώληση/πληρωμή 0,50 €, `NON_FISCAL · LAB-FISCAL-02`, μία αφαίρεση stock `−64 → −65`, σωστή βάρδια/Audit, 0 duplicates και αμετάβλητο `MAIN`. PR #1377, CI #3513, production `1704865d`. Δεν επαναλαμβάνεται. efood/Pelican παραμένει ξεχωριστό. |

### Κανόνας ανάθεσης

1. Κάθε νέα σελίδα διαβάζει πρώτα αυτό το αρχείο και μπορεί να αναλάβει οποιοδήποτε Gate ή ανεξάρτητη υποεργασία έχει κατάσταση `OPEN` και δεν έχει ήδη ιδιοκτήτη.
2. Η ανάληψη καταγράφεται πριν από αλλαγή κώδικα ως `ΑΝΑΤΕΘΗΚΕ - <σελίδα/branch>`, με ημερομηνία και σαφές scope.
3. Gate ή υποεργασία με κατάσταση `ΑΝΑΤΕΘΗΚΕ` δεν επιτρέπεται να δουλευτεί από δεύτερη σελίδα. Αν η πρώτη σελίδα σταματήσει, πρέπει πρώτα να κάνει ρητή αποδέσμευση.
4. Διαφορετικές σελίδες μπορούν να δουλεύουν παράλληλα διαφορετικά Gate ή ανεξάρτητες υποεργασίες, ώστε να προχωρά γρηγορότερα το πρόγραμμα.
5. Η σελίδα που έχει την ανάθεση είναι αποκλειστικά υπεύθυνη για checkpoint, CI, merge, exact deploy, πραγματικό LAB/USER test και κλείσιμο της εργασίας.
6. Με πραγματικό PASS, η ολοκληρωμένη υποεργασία **διαγράφεται** από την ενεργή pending λίστα στο ίδιο PR. Δεν παραμένει ως `[x]`, ιστορικό `AWAITING LAB` ή διπλή εργασία.
7. Όταν διαγραφούν όλες οι υποεργασίες ενός Gate, το Gate μεταφέρεται στα ολοκληρωμένα/PASS και δεν ξανανοίγει χωρίς νεότερο πραγματικό FAIL ή νέα απαίτηση ιδιοκτήτη.
8. Η σελίδα που κλείνει το PASS ενημερώνει ταυτόχρονα checkpoint, active list, `docs/manual/<module>/PASS.md`, αυτό το roadmap και το κεντρικό PDF.

## Υποχρεωτικός κανόνας κλεισίματος

Κάθε εργασία της παρούσας λίστας αφαιρείται υποχρεωτικά από τις ενεργές εκκρεμότητες όταν λάβει πραγματικό `LAB PASS`, `LIVE PASS` ή `USER PASS`.

Το ίδιο PR που κλείνει την εργασία πρέπει υποχρεωτικά να:

1. καταγράψει το πραγματικό αποτέλεσμα και το ακριβές production revision στο σχετικό checkpoint,
2. αφαιρέσει την εργασία από αυτό το αρχείο - όχι απλώς να προσθέσει ένα checkbox ή μια νεότερη αντικρουόμενη σημείωση,
3. κλείσει ή χαρακτηρίσει ως superseded τις παλιές εγγραφές της κεντρικής ενεργής λίστας,
4. δημιουργήσει ή ενημερώσει το `docs/manual/<module>/PASS.md` με οδηγίες χρήσης,
5. ενημερώσει το παραγόμενο κεντρικό PDF όταν αλλάζει ουσιαστικά η λίστα.

Το `CI PASS`, το local test, το merge ή το deploy δεν κλείνουν από μόνα τους μια εργασία. Μέχρι την πραγματική δοκιμή η κατάσταση παραμένει `AWAITING LAB`.

## 28/09/2026 — Super Admin AI Command Center · ΦΑΣΗ 1 — ASSIGNED `feat/super-admin-ai-command-center-phase1-20260928`

- Προσθήκη νέας, ανεξάρτητης οθόνης `AI Command Center` δίπλα στο σημερινό Super Admin, χωρίς μετακίνηση ή αντικατάσταση υπάρχουσας λειτουργίας.
- Η ΦΑΣΗ 1 είναι μόνο ανάγνωσης: χρησιμοποιεί το υπάρχον `/api/platform/overview` και ανοίγει τους ήδη υπάρχοντες ελέγχους. Δεν δημιουργεί δεύτερα δεδομένα, νέο οικονομικό endpoint, αυτόματη ενέργεια ή μεταβολή POS/BackOffice.
- Απαιτούνται στοχευμένα tests, πλήρες client build, πράσινο CI, merge, exact deploy και οπτικό LAB/USER PASS. Μέχρι τότε: `AWAITING LAB`.

## Ήδη ολοκληρωμένα - δεν επαναλαμβάνονται

- Workforce: εβδομαδιαίο πρόγραμμα, προβολή ανά ημέρα και ανά εργαζόμενο, ημερομηνίες/ώρες/ΡΕΠΟ, δημοσίευση στο Store Chat, εκτύπωση κάρτας εργασίας, PIN, QR/κάμερα, Code 128/scanner, ελληνικό και αγγλικό πληκτρολόγιο, προσέλευση/αποχώρηση, προστασία διπλής σάρωσης και Audit.
- Video Audit/Dahua: σύνδεση POS με κάμερα, πραγματικό clip, μετατροπή MP4, αποθήκευση και browser playback.
- Master Catalog: εισαγωγή Excel, κεντρικός κατάλογος, επιλογή προϊόντων καταστήματος και τιμή καταστήματος.
- Super Admin: οι καταγεγραμμένοι Complete/Premium έλεγχοι.
- AI Command Center ΦΑΣΗ 11 Night Briefing: LIMITED USER VISUAL PASS, PR #1526 / CI #3845 / exact production `2d4f2e071d8f4c107a31a31f4e2ca8c0fef9083c`. Δεν επαναλαμβάνεται.
- AI Command Center ΦΑΣΗ 12 Digital Twin Lite: LIMITED USER VISUAL PASS στην `image(20260928-203834).png`, PR #1529 / CI #3851, device-routing fix PR #1530 / CI #3853 / exact production `f58e19b946e1f3a05c5605a324c233605d14fb1c`. Τέσσερις κάρτες καταστημάτων με πραγματικούς μετρητές POS, EFTPOS/ταμειακών, ταμείου, stock και προσωπικού. Δεν επαναλαμβάνεται.
- AI Command Center ΦΑΣΗ 13 NVR / Cameras: LIMITED USER VISUAL PASS στην `image(20260928-210335).png`, PR #1532 / CI #3857 / exact production `9b8b0e0e00990fa19bf617fc17352af957c5a8f0`. Τέσσερις read-only περιοχές καμερών με LAB `OFFLINE · 1 κάμερα`, μη ρυθμισμένη και μη διαθέσιμες πηγές χωρίς απώλεια των υπόλοιπων μετρητών. Δεν επαναλαμβάνεται.
- AI Command Center ΦΑΣΗ 14 Full Digital Twin: LIMITED USER VISUAL PASS στην `image(20260929-180520).png`, PR #1536 / CI #3870 / exact production `22f1914b40d30ba9d087db1ed58349d734dab48f`. Επιλογή τεσσάρων καταστημάτων και ενιαία read-only εικόνα έξι τομέων· τα κλικ μετάβασης δεν δοκιμάστηκαν. **CLOSED · το αρχικό πλάνο Φάσεων 1–14 ολοκληρώθηκε.**
- Store Chat: βασική συνομιλία, αποστολή/ανανέωση και αναζήτηση.
- Mobile: responsive χρήση και Android PWA.
- POS: η καταγεγραμμένη δοκιμή εγγραφής οθόνης. Δεν αποτελεί συνολικό POS PASS.

## Κοινή διευκρίνιση προς όλες τις σελίδες — LAB και νέο κατάστημα

Το MYWORKSTATION LAB είναι **εικονικό κατάστημα δοκιμών**. Ελέγχουμε εκεί λειτουργίες και αποτελέσματα για να εντοπίζουμε λάθη πριν δημιουργηθούν πραγματικά καταστήματα. Είδη, υπάλληλοι, αποθήκη, βάρδιες, εισπράξεις και διαφορές του LAB είναι δοκιμαστικά δεδομένα. Το νέο κατάστημα εγκατάστασης δημιουργείται ως **διαφορετικό κατάστημα, από την αρχή**, με δικό του κατάλογο, αρχικό απόθεμα, προσωπικό, ρόλους, τερματικά και βάρδιες. Κάθε επιβεβαιωμένη LAB λειτουργία περνά στην κεντρική λίστα PASS και στον κοινό κώδικα που θα χρησιμοποιούν τα επόμενα καταστήματα. Δεν εισάγεται κανένα LAB υπόλοιπο ή ιστορική κίνηση. Οι παλιές αρνητικές ποσότητες LAB και η ιστορική εικονική διαφορά `MAIN` τεκμηριώνονται ως Audit και **δεν εμποδίζουν από μόνες τους το Gate 4 PASS**. Η δημιουργία και αποδοχή του νέου καταστήματος παρακολουθείται χωριστά από το LAB Gate 4.

## 0. Εγκατάσταση καταστήματος έως Κυριακή 27/09/2026

**Νεότερη οδηγία ιδιοκτήτη 26/09 — πιλοτική εγκατάσταση Δευτέρα 28/09:** ένα πραγματικό POS, BackOffice στο laptop ιδιοκτήτη, υπάρχον RBS με συνδεδεμένο EFTPOS. Κάθε κατάστημα μπορεί να έχει 1 ή περισσότερα POS χωρίς ανώτατο όριο. Η στενή υποεργασία αλλαγής του offline readiness checker από υποχρεωτικά δύο σε μεταβλητό πλήθος αναλήφθηκε με ρητή οδηγία σε `agent/pilot-variable-pos-20260926`· local tests PASS, CI και πραγματική εγκατάσταση AWAITING. Η γενική ετοιμότητα παραμένει στον αρχικό ανάδοχο. `CHECKPOINTS/CHANGES/2026-09-26-pilot-variable-pos-readiness.md`.

**ΑΝΑΤΕΘΗΚΕ — `agent/gate4-install-readiness` (24/09/2026, διευκρίνιση ιδιοκτήτη):** Gate 4 POS 1/POS 2 και πακέτο ετοιμότητας εγκατάστασης. Περιλαμβάνει καρτέλα πραγματικού καταστήματος χωρίς μυστικά, αυτόματο έλεγχο `READY/NOT READY`, πραγματικούς ελέγχους δύο POS και checkpoint. Δεν περιλαμβάνει Gate 3, τιμολόγια/OCR ή efood/Pelican.

**Νεότερο LAB PASS κλεισίματος 24/09 (ολοκληρωμένο σκέλος):** τα `LAB-POS-01` και `LAB-POS-02` έκλεισαν στις 15:33 και 15:39 αντίστοιχα με 0,00 € διαφορά / ΣΥΜΦΩΝΙΑ, μετά από επανακαταμέτρηση του εικονικού ελλείμματος 1,50 € στο POS02. Το Backoffice δεν εμφανίζει πλέον ανοιχτή βάρδια. **Τα δύο κλεισίματα αφαιρούνται από τις ενεργές εκκρεμότητες και δεν επαναλαμβάνονται.** Το παλιό `MAIN` και η ιστορική cross-terminal επιστροφή 12:44 παραμένουν μόνο ως LAB Audit· η αρνητική LAB απογραφή δεν μεταφέρεται σε νέο κατάστημα. **Gate 4 PENDING μόνο για τις υπόλοιπες μη επαληθευμένες λειτουργικές δοκιμές του §4**, όχι για συμφωνία εικονικών ιστορικών ποσών ή preflight νέου καταστήματος.

**Προηγούμενο LAB PASS μερικής επιστροφής 24/09 (ολοκληρωμένο σκέλος):** στο `LAB-POS-02` επιστράφηκε μόνο 1 × ΝΕΡΟ 1,5LT αξίας 1,00 € από τη δική του πώληση 1,50 € (11:47). Στις 14:50 το POS02 πήγε 3→4 κινήσεις και 1,50→0,50 €· το POS01 έμεινε 3 κινήσεις / 0,50 €. Στο κοινό stock το SKU 2270 πήγε −3→−2 και το συνολικό 44.946→44.947 μετά από ανανέωση. **Η μερική επιστροφή αφαιρέθηκε από τις ενεργές εκκρεμότητες και δεν επαναλαμβάνεται.** Τα μεταγενέστερα κλεισίματα καταγράφονται στη νεότερη εγγραφή παραπάνω. **Gate 4 PENDING**.

**Προηγούμενο LAB PASS κοινής αποθήκης 24/09 (περιορισμένο):** μία NON_FISCAL πώληση 0,50 € στο `LAB-POS-02` στις 14:35 αύξησε μόνο τη δική του βάρδια (2→3 κινήσεις, 1,00→1,50 €), άφησε POS01 αμετάβλητο (3 κινήσεις, 0,50 €) και μείωσε το κοινό stock ΝΕΡΟ 500ML **−53→−54** και το συνολικό stock 44.947→44.946. Αυτή η συγκεκριμένη δοκιμή ολοκληρώθηκε και **δεν επαναλαμβάνεται**. Η αρνητική αρχική ποσότητα δεν θεωρείται αποδεκτή απογραφή πιλοτικού καταστήματος. Τα υπόλοιπα ενεργά σκέλη καταγράφονται στη νεότερη εγγραφή παραπάνω. **Gate 4 PENDING**.

**Προηγούμενο LAB PASS πλήρους επιστροφής 24/09 (περιορισμένο):** η νέα πλήρης επιστροφή 0,50 € στις 14:02 καταχωρίστηκε στο `LAB-POS-01`, με 3 κινήσεις και καθαρό 0,50 €· το `LAB-POS-02` έμεινε στις 2 κινήσεις και 1,00 €. Η συγκεκριμένη δοκιμή πλήρους επιστροφής στο σωστό terminal ολοκληρώθηκε και **δεν επαναλαμβάνεται**. Τα υπόλοιπα ενεργά σκέλη καταγράφονται στη νεότερη εγγραφή παραπάνω. **Gate 4 PENDING**.

**Ιστορικό LAB FAIL 24/09:** στην παλιά έκδοση, επιστροφή POS01 χρεώθηκε στη βάρδια POS02 στις 12:44 (**πραγματικό cross-terminal FAIL**). Η διόρθωση PR #1156 αναπτύχθηκε ως `c54011e`. Η μεταγενέστερη νέα επιστροφή POS01, η πώληση/stock POS02 και η μερική επιστροφή έχουν χωριστά επιβεβαιωθεί στη νεότερη εγγραφή παραπάνω. Η παλιά λανθασμένη κίνηση εξακολουθεί να απαιτεί ειδική συμφωνία. **Gate 4 PENDING**.

**Νεότερο LAB 24/09:** χωριστές βάρδιες και μία πώληση ανά `LAB-POS-01`/`LAB-POS-02` επιβεβαιώθηκαν. Η επιστροφή στο Εργαστήριο 1 πρότεινε πώληση του POS02 (**FAIL**). Διόρθωση φίλτρου session και server terminal σε εξέλιξη. Κοινό stock, επιστροφή, κλείσιμο δύο βαρδιών και πλήρης ετοιμότητα παραμένουν pending. Το παρακάτω παλιότερο στιγμιότυπο αφορά την αρχική βάρδια `MAIN`.

**Νεότερη πραγματική LAB παρατήρηση 24/09:** η μία δοκιμαστική NON_FISCAL πώληση 0,50 € καταχωρίστηκε στο ταμείο `MAIN`, παρότι έγινε από τον χειριστή «LAB POS 2». Το browser δεν έχει δέσμευση `LAB-POS-02`. Παραμένουν pending η ενεργοποίηση δύο διακριτών terminal/browser profiles, οι ανεξάρτητες βάρδιες, η κοινή αποθήκη, οι επιστροφές και η πραγματική ετοιμότητα εγκατάστασης. Δεν διαγράφεται κανένα μη επαληθευμένο σκέλος.

Επειδή η αρχική συμφωνία τοποθετεί την πλήρη παραγωγική εγκατάσταση μετά το PASS των Gate 1-8, η εγκατάσταση της Κυριακής είναι **ελεγχόμενη πιλοτική εγκατάσταση** όσο υπάρχει οποιοδήποτε ανοικτό Gate. Παραμένει NON_FISCAL όπου δεν υπάρχει πιστοποιημένη πραγματική σύνδεση και δεν παρακάμπτεται κανένα RBS/CapDriver/EFTPOS gate.

### Προετοιμασία πριν την επίσκεψη

- Επιβεβαίωση καταστήματος, POS 1/POS 2, συσκευών και υπεύθυνου παραλαβής.
- Τελευταίο πράσινο CI και καταγραφή του ακριβούς Render production revision.
- Έλεγχος χρηστών, PIN/καρτών, ρόλων και πρόσβασης ιδιοκτήτη.
- Έλεγχος καταλόγου, τιμών, ΦΠΑ, QuickKeys και βασικών κατηγοριών του καταστήματος.
- Έτοιμες οδηγίες ανάκτησης και στοιχεία υποστήριξης χωρίς αποθήκευση μυστικών στο checkpoint.
- Εκτέλεση του υπάρχοντος `PRECHECK_KAT.cmd` και αποτέλεσμα `SOFTWARE PREFLIGHT READY`.
- Δημιουργία ξεχωριστού one-time activation link για κάθε πραγματικό POS terminal.
- Διατήρηση των reports Preflight, Installation και Recovery στην Επιφάνεια Εργασίας.

### Εξοπλισμός και σύνδεση στο κατάστημα

- Internet και εναλλακτικός τρόπος σύνδεσης για δοκιμή.
- POS PC/tablet, δεύτερο POS όπου προβλέπεται και σωστή αντιστοίχιση terminal.
- Barcode scanner σε ENG και ΕΛ.
- Θερμικός εκτυπωτής, χαρτί και δοκιμαστική εκτύπωση.
- EFTPOS/RBS μόνο μέσω των υπαρχόντων ασφαλών fiscal gates.
- Κάμερα/Dahua όπου ανήκει στο συγκεκριμένο κατάστημα.
- Τουλάχιστον 2 GB ελεύθερος χώρος, PowerShell 5+ και Chrome ή Edge.
- Καταγραφή των υπαρχόντων fiscal folders/services χωρίς μεταβολή τους.

### Ελάχιστο go-live test

- Login σωστού χειριστή και επιβεβαίωση ότι δεν μπαίνει ταυτόχρονα σε δεύτερο POS.
- Άνοιγμα χωριστής ταμειακής βάρδιας ανά terminal.
- Αναζήτηση και scanner πραγματικού προϊόντος με σωστή τιμή/ΦΠΑ.
- Δοκιμή μετρητών, κάρτας και - όπου είναι έτοιμο - μικτής πληρωμής, χωρίς επικίνδυνη επανάληψη fiscal συναλλαγής.
- Εκτύπωση παραστατικού, ακύρωση/επιστροφή μόνο με το εγκεκριμένο ασφαλές σενάριο.
- Έλεγχος κοινής αποθήκης/τζίρου για τα δύο POS.
- Κάρτα εργασίας: μία προσέλευση και μία αποχώρηση με πραγματικό εργαζόμενο.
- Κλείσιμο βάρδιας, αναμενόμενο/πραγματικό ταμείο και έλεγχος Audit.
- Store Chat και βασική ειδοποίηση.
- Επιβεβαίωση ότι backup/monitoring δεν εμφανίζουν αποτυχία.
- Offline δοκιμή μόνο για μετρητά: ασφαλής ουρά, επανασύνδεση και ακριβώς ένας συγχρονισμός.
- Επιβεβαίωση ότι offline κάρτα, IRIS, μικτή πληρωμή και επιστροφή μπλοκάρονται.
- Recovery dry-run με αποτέλεσμα `DRY_RUN_PASSED`, checksum και revision πριν από οποιαδήποτε πραγματική ανάκτηση.

### Αποδοχή εγκατάστασης

- Καταγράφονται συσκευές, terminal IDs, χρήστες, πραγματικά αποτελέσματα και ακριβές revision.
- Κάθε μη δοκιμασμένο σημείο σημειώνεται `NOT TESTED` - όχι PASS.
- Δημιουργείται ξεχωριστό checkpoint εγκατάστασης και σύντομο manual λειτουργίας καταστήματος.
- Κρίσιμη αποτυχία σε login, πώληση, εκτύπωση, πληρωμή, απόθεμα ή κλείσιμο βάρδιας μπλοκάρει το go-live μέχρι ασφαλή διόρθωση.
- Μετά την εγκατάσταση ακολουθεί παρακολούθηση πιλοτικής λειτουργίας 48 ωρών.

### Όσα χρειάζονται ακόμη να συγκεντρωθούν πριν την Κυριακή

- Ακριβές κατάστημα εγκατάστασης, διεύθυνση, ώρα και υπεύθυνος παραλαβής.
- Πραγματικά PC/tablet που θα είναι POS 1 και POS 2 και τα οριστικά Terminal IDs.
- Αντιστοίχιση scanner, printer, RBS και EFTPOS ανά terminal.
- Επιβεβαίωση ποια ροή θα παραμείνει NON_FISCAL και ποια έχει πιστοποιημένη παραγωγική σύνδεση.
- Πραγματικοί χειριστές, PIN/κάρτες και τελικά δικαιώματα.
- Εγκεκριμένος κατάλογος/τιμές/ΦΠΑ και αρχικό stock για το συγκεκριμένο κατάστημα.
- Επιβεβαιωμένο backup πριν την εγκατάσταση και υπεύθυνος απόφασης rollback.
- Maintenance window για recovery ή αλλαγές, αν χρειαστεί.
- Μικρό, προκαθορισμένο test basket και εγκεκριμένα ποσά δοκιμής.
- Καταγραφή των ανοικτών Gates που δεν επιτρέπεται να παρουσιαστούν ως παραγωγικά έτοιμα.

## 1. Workforce - μισθοδοσία

**26/09 τελικό LAB της περιόδου:** Render `bdaf98cb`, υπάρχον DRAFT 313,00 € μετά από επανυπολογισμό, μερική/τελική εικονική πληρωμή `LAB-POS-02` 20,00 € + 100,00 €, εσωτερική τράπεζα 173,33 €, συνολικά πληρωμένα 313,00 €, υπόλοιπο 0,00 €, CLOSED. Ο αναλυτικός οδηγός μέσα στο πρόγραμμα επιβεβαιώθηκε στο LAB με Render `327c06e8` και αφαιρέθηκε από τις εκκρεμότητες. Ανεξάρτητη συμφωνία cash shift, τραπεζικό αποδεικτικό και πραγματικό κατάστημα OPEN/NOT TESTED.

**ΑΝΑΤΕΘΗΚΕ — `agent/workforce-payroll-20260925` (25/09/2026):** read-only απογραφή υπάρχοντος Workforce, παρουσιών, ωρομισθίων, ταμείου/τράπεζας και Audit πριν από οποιαδήποτε αλλαγή. Scope: ωρομίσθιο/ημερομίσθιο/σταθερός μισθός, κανονικές ώρες, εγκεκριμένες υπερωρίες άνω των 8 ωρών, καθυστερήσεις/πρόωρες αποχωρήσεις/απουσίες/πληρωμένες άδειες, πλήρης ή μερική πληρωμή και ασφαλής συμφωνία. Δεν αγγίζει Gate 3 ή Gate 6.

Οι προηγούμενες ενδιάμεσες απογραφές, εγκρίσεις και αναθεωρήσεις βρίσκονται στο `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`. Οι δύο LAB βάρδιες `MAIN` / `LAB-POS-02` εντοπίστηκαν, οι τραπεζικές εγγραφές 5,00 € + 14,67 € είναι σε αναμονή αποδεικτικού. Ανοιχτά: ανεξάρτητο πριν/μετά του ταμειακού ledger και αποδεικτικό τράπεζας.

- Μισθός ανά ώρα, ημερομίσθιο ή σταθερός μηνιαίος μισθός.
- Υπολογισμός από προγραμματισμένες και πραγματικές ώρες.
- Κανονικές ώρες, εγκεκριμένες υπερωρίες, καθυστερήσεις, πρόωρες αποχωρήσεις, απουσίες και πληρωμένες άδειες.
- Έγκριση υπερωρίας άνω των οκτώ ωρών.
- Κλείδωμα περιόδου και επανυπολογισμός μόνο με δικαίωμα και Audit.
- Αναλυτικό εκκαθαριστικό εργαζομένου και συνολικό κόστος ανά κατάστημα.
- Ιστορικό περιόδων και εξαγωγή PDF/Excel.

## 2. Workforce - πληρωμές εργαζομένων

- Πλήρης ή μερική πληρωμή μισθού.
- Μετρητά, τράπεζα, κάρτα ή άλλη εγκεκριμένη μέθοδος.
- Ημερομηνία, ποσό, αποδεικτικό και υπόλοιπο εργαζομένου.
- Ιστορικό, ακύρωση/διόρθωση με αιτιολογία και προστασία διπλής πληρωμής.
- Σύνδεση με μισθοδοσία, ταμείο, τράπεζα και Audit.

## 3. Workforce - απόδοση, άδειες και προχωρημένοι κανόνες

- Πωλήσεις, συναλλαγές, μέση απόδειξη, εκπτώσεις, ακυρώσεις, επιστροφές και διαφορές ταμείου ανά εργαζόμενο.
- Πραγματικές έναντι προγραμματισμένων ωρών, καθυστερήσεις και απουσίες.
- Στόχοι, αξιολόγηση περιόδου και παρατηρήσεις ιδιοκτήτη.
- Αίτημα/έγκριση άδειας, κατηγορίες, υπόλοιπο, αναρρωτική άδεια, δικαιολογητικά και αντικατάσταση.
- Ελάχιστη ανάπαυση, συνεχόμενες ημέρες, δίκαιη κατανομή νυχτερινών/Σαββατοκύριακων και διαθεσιμότητα.
- Κανόνες μεταξύ εργαζομένων και υποχρεωτική παρουσία υπεύθυνου.
- Αλλαγή βάρδιας με έγκριση και πλήρες ιστορικό.

## 4. Πλήρες end-to-end POS PASS

**Κανόνας τελικής καταγραφής Gate 4 (25/09):** οι υπόλοιπες δοκιμές γίνονται συγκεντρωτικά, με άμεση φύλαξη μετρήσεων κατά τη δοκιμή και **ένα τελικό συνολικό checkpoint/ενιαία ενημέρωση των πέντε κεντρικών αρχείων μετά την ολοκλήρωσή τους**. Δεν περιμένουμε ξεχωριστό PR/CI για κάθε περιορισμένο PASS. Οι διορθώσεις κώδικα μπορούν να περνούν CI ανεξάρτητα και παραμένουν `AWAITING LAB` μέχρι πραγματικό έλεγχο. Προηγούμενα PASS δεν επαναλαμβάνονται.

- **ΑΝΑΤΕΘΗΚΕ — `agent/gate4-void-history-fix` (24/09/2026):** Μένει μόνο τεκμηρίωση stock SKU 2269 και audit για το ήδη καταχωρισμένο IRIS VOID του LAB-POS-02, χωρίς επανάληψη συναλλαγής. Η λανθασμένη ετικέτα «Επιστροφή» διορθώθηκε και επιβεβαιώθηκε στο LAB ως μία «ΑΚΥΡΩΣΗ / VOID» −0,50 € στο ακριβές Render `cdcc8b71db0059e5844d8078cce9272b0914182e` (PASS· αφαιρέθηκε από τις εκκρεμότητες). Checkpoint: `CHECKPOINTS/CHANGES/2026-09-24-gate4-void-iris-history-awaiting-lab.md`.
- Μετρητά, κάρτα, IRIS και μικτή πληρωμή.
- **Ολοκληρώθηκε 25/09 — ποσό γραμμής και κάτω σύνολο με έκπτωση δικαιούχου σε ποσότητα 2:** η διόρθωση PR #1206 συγχωνεύτηκε, το αριθμητικό regression πέρασε, και στο φυσικό LAB POS 2 στις 14:34 ο «Ιατρός» / 2 × SKU 2269 / 0,50 € / 10% έδειξε **0,90 € γραμμή και 0,90 € σύνολο**. Οι βάρδιες POS1 1/0,70 € και POS2 16/7,50 € έμειναν ίδιες. Το συγκεκριμένο σκέλος Issue #1202 αφαιρέθηκε από τα pending και δεν επαναλαμβάνεται. **Checkout αυτής της ποσότητας, ρέστα με εισπραχθέν ποσό, άλλη ποσότητα/κατάστημα και συνολικό Gate 4 OPEN**, στην κύρια ανάθεση `agent/gate4-install-readiness`.
- Ρέστα: ήδη δοκιμασμένα κατά ρητή επιβεβαίωση ιδιοκτήτη· λείπει από το κεντρικό αρχείο το αριθμητικό τεκμήριο πριν/μετά, οπότε δεν δηλώνεται ανεξάρτητο LAB PASS και δεν ζητείται επανάληψη πώλησης. Το ειδικό καλάθι έκπτωσης ποσότητας 2 απέκτησε ορατό LAB PASS 0,90 € στη γραμμή και στο σύνολο στις 25/09 14:34, χωρίς πληρωμή· η γενική παλαιότερη δοκιμή έκπτωσης έχει γίνει κατά επιβεβαίωση ιδιοκτήτη και δεν επαναλαμβάνεται. Η επανεκτύπωση της συγκεκριμένης NON_FISCAL πώλησης 23:22:35 ολοκληρώθηκε με LAB PASS: σωστό αντίγραφο στην προεπισκόπηση, ρητή επιβεβαίωση ιδιοκτήτη «ΒΓΗΚΕ» για το φυσικό χαρτί στις 25/09 περίπου 07:59 ώρα Ελλάδας, και μία υπάρχουσα εγγραφή Audit 25/09 00:55, LAB POS 2, ίδιο sale ID, 0,00 €. Οι δύο βάρδιες και το SKU 2269 −57 παρέμειναν αμετάβλητα. Η φυσική έξοδος τεκμηριώνεται από δήλωση ιδιοκτήτη, χωρίς φωτογραφία· **το ολοκληρωμένο σκέλος αφαιρέθηκε από τα εκκρεμή και δεν επαναλαμβάνεται**. Η νεότερη πώληση POS02 0,50 € στις 23:22:35 έχει ήδη συγκριθεί (9→10 κινήσεις, μετρητά 3,30→3,80 €, σύνολο 3,80→4,30 €, SKU 2269 −56→−57, POS01 αμετάβλητο) και δεν επαναλαμβάνεται· βλ. `CHECKPOINTS/CHANGES/2026-09-24-gate4-before-after-test-protocol.md`. **Η ακύρωση καλαθιού πριν από πληρωμή αφαιρέθηκε μετά από πραγματικό LAB PASS με πριν/μετά στις 24/09**, όπως και οι χωριστά καταγεγραμμένες πλήρης/μερική επιστροφή. Στο μεταγενέστερο νέο VOID μετρητών POS02, το ποσό βάρδιας 4,30→3,80 € και το SKU 2269 −57→−56 είναι LAB PASS· το ιστορικό έδειξε μία σωστή «ΑΚΥΡΩΣΗ / VOID» στις 22:42:01 (PASS). Η ανεξάρτητη εικόνα Audit δείχνει `CANCEL` −0,50 €, LAB POS 2, 22:42:01 με ID `0fa74ea2…`. Δεύτερη προβολή δείχνει μετρητά +0,50 € πώλησης στις 22:38:39 και −0,50 € ακύρωσης στις 22:42:01 (PASS διασταύρωσης ώρας/ποσού/βάρδιας). Ρητό `relatedSaleId` των δύο sale IDs και μεταβολή πλήθους Audit παραμένουν NOT TESTED, χωρίς δεύτερο VOID.
- Μία και μόνο κίνηση αποθέματος σε όλες τις υπόλοιπες δοκιμαστικές ροές, σωστά reports και Audit. Η ξεχωριστή νέα πώληση POS02 μετρητών στις 22:38:39 απέδειξε μία μόνο μείωση SKU 2269 (−56→−57) και PASS του συγκεκριμένου σκέλους· δεν επαναλαμβάνεται.
- Δύο POS στο ίδιο κατάστημα με κοινό απόθεμα/τζίρο και χωριστές ταμειακές βάρδιες.
- **ΑΝΑΤΕΘΗΚΕ — `agent/gate4-operator-dual-session-20260925`:** απαγόρευση ταυτόχρονης συνεδρίας του ίδιου χειριστή σε δύο POS. Η παλιά φραγή έλεγχε μόνο ανοιχτή βάρδια άλλου terminal. Περιορισμένη διόρθωση κλειδώνει τον χειριστή και ελέγχει ενεργές δεσμευμένες συνεδρίες στην είσοδο PIN/κάρτας. Τοπικοί έλεγχοι κώδικα PASS· CI, exact deploy και φυσικό LAB στα δύο POS **PENDING**. Δεν αποτελεί συνολικό Gate 4 PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate4-operator-dual-session.md`.
- Ανάκτηση από προσωρινή απώλεια δικτύου χωρίς διπλή συναλλαγή.

## 5. Ταμειακή βάρδια, παράδοση και ασφάλεια POS

- Αρχικό ταμείο, καταμέτρηση χαρτονομισμάτων/κερμάτων και εισαγωγή/εξαγωγή χρημάτων.
- Παράδοση βάρδιας, αναμενόμενο/πραγματικό ποσό και αιτιολογία διαφοράς.
- Έγκριση ιδιοκτήτη, αναγκαστικό κλείσιμο Super Admin και EFTPOS settlement.
- Φωτογραφία/αποδεικτικό κλεισίματος και πλήρες Audit.
- Δικαιώματα για πώληση, έκπτωση, ακύρωση, επιστροφή, άνοιγμα συρταριού και αλλαγή τιμής.
- Κλείδωμα αποτυχημένων προσπαθειών και διακοπή συνεδριών απενεργοποιημένου χρήστη.

## 6. Μελλοντικές επεκτάσεις αποθέματος πέρα από το PASS του Gate 2

Το Gate 2 έχει PASS. Τα παρακάτω δεν αποτελούν επανάληψή του· είναι ξεχωριστές μελλοντικές επεκτάσεις και θα αναληφθούν μόνο με νέα ρητή ανάθεση:

- Αρχικό απόθεμα, παραλαβές, πωλήσεις, επιστροφές, καταστροφές/ληγμένα και ιδιοκατανάλωση.
- Μεταφορές μεταξύ καταστημάτων και πραγματική απογραφή.
- Διαφορά λογιστικού/πραγματικού αποθέματος με υποχρεωτική αιτιολογία.
- Αρνητικό απόθεμα, ελάχιστα όρια και προτάσεις παραγγελίας.
- Κινήσεις προϊόντος, ιστορικό/μέση τιμή αγοράς, κερδοφορία και exports.
- Ταυτόχρονη πώληση του ίδιου προϊόντος από δύο POS χωρίς λάθος υπόλοιπο.

## 7. Barcode και αναζήτηση προϊόντων

**ΑΝΑΤΕΘΗΚΕ — `agent/barcode-catalog-check-20260928` (28/09/2026):** ανεξάρτητο σκέλος ασφαλούς ελέγχου και μεταφοράς υπάρχοντος barcode μεταξύ προϊόντων της ίδιας εταιρείας. Πρώτα διαβάζουμε τον σημερινό κατάλογο και τις τωρινές οθόνες, έπειτα υλοποιούμε ρητή ανθρώπινη επιβεβαίωση, μία ατομική αλλαγή και Audit, χωρίς μεταβολή ιστορικών πωλήσεων, τιμών ή stock. Η αναζήτηση προσφορών/παραγγελίες παραμένουν χωριστό OPEN σκέλος. PR #1495 / CI #3771 PASS / exact Render `450b1cfae0519706c6d79d0ddcea2dbf0d9bc4f9`. Καμία LAB ή παραγωγική μεταφορά δεν έχει γίνει· κατάσταση AWAITING LAB.


- Προϊόντα χωρίς barcode και πολλαπλά barcode ανά προϊόν/συσκευασία/τιμή.
- Έλεγχος διπλοεγγραφής και ασφαλής μεταφορά barcode σε άλλο προϊόν.
- Εκτύπωση ετικετών.
- Αναζήτηση προϊόντων σε internet, χονδρεμπόρους και σούπερ μάρκετ.
- Σύγκριση τιμών, πρόταση φθηνότερης αγοράς και δημιουργία παραγγελίας.
- Σύνδεση πρότασης με Master Catalog και απόθεμα χωρίς αυτόματη επικίνδυνη αντιστοίχιση.

## 10. Chat και ειδοποιήσεις

- Πραγματικό PASS για push στο παρασκήνιο και ήχο.
- Read receipts ανά χρήστη, μετρητής και πρώτο μη αναγνωσμένο.
- Φωτογραφίες/PDF, σημαντικό μήνυμα και δημιουργία/ανάθεση εκκρεμότητας.
- Επιλογή καταστήματος για ιδιοκτήτη/Super Admin με πλήρη tenant isolation.
- Διατήρηση ιστορικού μετά από logout/login και push σε mobile/PWA.

## 11. Mobile και εξοπλισμός

- iPhone/Safari και εγκατάσταση iOS PWA.
- Push και QR camera σε iPhone/iPad.
- Ασταθές/offline δίκτυο και ασφαλής επανασύνδεση.
- Μικρές οθόνες, landscape και Surface/tablet.
- Θερμικός εκτυπωτής, συρτάρι, customer display και διαφορετικά scanner.

## 12. Backup, monitoring και επαναφορά

**LIVE PASS (30/09/2026):** Εργασία #18. Αυτόματο off-site PostgreSQL backup ανά 3 ώρες σε ιδιωτικό Backblaze B2, καταγραφή επιτυχίας/αποτυχίας/καθυστέρησης και archive dry-run μόνο με `pg_restore --list`, χωρίς σύνδεση σε βάση. Το πραγματικό upload ήταν 161.286.652 bytes. Ανεξάρτητη λήψη έδωσε ίδιο SHA-256 και 436 table entries. PR `#1555`, merge `3868c16`. Καμία πραγματική επαναφορά ή αντικατάσταση δεδομένων. `CHECKPOINTS/CHANGES/2026-09-30-task18-backblaze-b2.md`.

**FINAL PASS (30/09/2026):** Εργασία #19. PR #1557 / CI #3917–3918 / exact production `7ee5ca6` και PR #1558 / CI #3919–3920 / exact production `6d6384c`. Ενεργά: ένας guarded δρόμος production web deploy, web ignored paths, cron include μόνο `ops/backup/**`, ακύρωση superseded CI και πραγματικά επιβεβαιωμένο documentation-only skip χωρίς νέο web deploy ή cron rebuild. Καμία αλλαγή σε POS, OCR, πληρωμές, stock, fiscal ή production δεδομένα. `CHECKPOINTS/CHANGES/2026-09-30-task19-build-efficiency.md`.

- Αυτόματο backup ανά τρεις ώρες.
- Πραγματική δοκιμή επαναφοράς βάσης και αρχείων.
- Ειδοποίηση αποτυχημένου backup.
- Ανάκτηση από διακοπή ρεύματος/internet και επανεκκίνηση services.
- Monitoring εφαρμογής, βάσης, ουρών και αποθηκευτικού χώρου.
- Κεντρικά logs, διατήρηση Audit και δοκιμασμένο disaster recovery.
- Σταθερό staging/preview πριν από production.

## 13. Ρόλοι, καταστήματα και άδειες modules

- Πραγματικά σενάρια Super Admin, ιδιοκτήτη, manager, υπεύθυνου βάρδιας, ταμία, εργαζομένου, λογιστηρίου και συνεργάτη.
- Ιδιοκτήτης μόνο στα δικά του καταστήματα και εργαζόμενος μόνο στα αναγκαία στοιχεία.
- Προστασία οικονομικών και προσωπικών δεδομένων.
- Audit αλλαγής δικαιωμάτων και ανάκληση ενεργών συνεδριών.
- Ρητή πρόσβαση πολλών καταστημάτων.
- Ενεργοποίηση πληρωμένων/Premium modules μόνο από Super Admin.

## 14. Online παραγγελίες και delivery — PASS

Το Gate 6 ολοκληρώθηκε και κλειδώθηκε στις 27/09/2026. Το πραγματικό LAB readback της `ONL-002` επιβεβαίωσε σωστό online/delivery POS, μία μοναδική εμπορική πώληση και πληρωμή, σωστή φορολογική διαδρομή, άμεση και μοναδική αφαίρεση κοινού stock, σωστή βάρδια/Audit και μηδενικά duplicates. Το `MAIN` έμεινε αμετάβλητο. Η εξωτερική σύνδεση efood/Pelican είναι διαφορετικό αντικείμενο και δεν αλλάζει το PASS του Gate 6. Οδηγίες: `docs/manual/online-delivery/PASS.md`.

## 15. Εστίαση — τραπέζια, σερβιτόροι και παραγωγή

**ΜΕΤΑΦΕΡΘΗΚΕ — `agent/table-service-layout-takeover-20260927` (27/09/2026, 21:53 Ελλάδα):** το scope εστίασης παραμένει ανεξάρτητο από το Gate 6 Online Delivery. Υπάρχουν πραγματικά επιμέρους LAB PASS για βασικά τραπέζια, έναν λογαριασμό με πολλούς γύρους, χωριστά πόστα, READY, μία τελική πληρωμή, product-specific modifiers και ελεύθερη σημείωση είδους. Το συνολικό scope παραμένει OPEN μόνο για τις παρακάτω ανεξάρτητες επεκτάσεις.

**Δεσμευτικό handoff:** αν η παρούσα σελίδα ολοκληρωθεί πριν από το συνολικό LAB PASS, παραδίδει υποχρεωτικά το scope σε ονομασμένη νέα σελίδα/branch με συγχωνευμένο checkpoint. Η παλιά ανάθεση παραμένει κλειδωμένη μέχρι να καταγραφεί στο `main` η νέα ανάληψη, ώστε να μην υπάρξει ούτε απώλεια ούτε παράλληλη διπλή εργασία.

- **Φάση A1 — επιμέρους LAB PASS:** σάλα/τραπέζι δημιουργήθηκαν στο LAB και εμφανίστηκαν σε BackOffice/POS/Audit (#1405). Η οπτική μετακίνηση στην κάτοψη έχει περιορισμένο production LAB PASS (#1445).
- **PASS 27/09:** οπτική μετακίνηση ενός τραπεζιού στην κάτοψη, επαναφόρτωση και κεντρικό Audit. Μαζική διαχείριση παραμένει OPEN.
- Mobile/PWA παραγγελιοληψία σερβιτόρου με προσωπικό PIN/κάρτα και tenant/store isolation.
- Στο συνολικό TABLE_SERVICE PASS: πλήρες manual χρήσης χωριστά για εργαζόμενο, ιδιοκτήτη και Super Admin (ρητό αίτημα 27/09/2026). Ενδιάμεσα manual μόνο για επαληθευμένα επιμέρους PASS.
- **PASS 27/09/2026:** ένας ανοικτός λογαριασμός ανά τραπέζι με πολλούς αριθμημένους γύρους, χωριστή παραγωγή ανά γύρο και μία τελική πληρωμή. Product-specific modifiers και ελεύθερη σημείωση είδους έχουν επίσης production LAB PASS. Τα δομημένα αλλεργιογόνα έχουν επίσης production LAB PASS ως ξεχωριστή ένδειξη από την ελεύθερη σημείωση. Παραμένουν OPEN μόνο τα λοιπά ανεξάρτητα σκέλη της ενότητας.
- Μεταφορά/ένωση/split τραπεζιών και λογαριασμών, αλλαγή σερβιτόρου και μερικές πληρωμές.
- Παραμετρικά πόστα κουζίνας, καφέ, μπαρ ή άλλα· ξεχωριστό KDS/εκτυπωτής, ουρά, χρόνοι και καταστάσεις ανά πόστο.
- Stage-aware ακύρωση/φύρα, live ειδοποίηση έτοιμης παραγγελίας και πλήρης συμφωνία Sale/Payment/fiscal/stock/βάρδιας/Audit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.

## 16. Προηγμένα και εμπορικά modules

- Oxygen με Super Admin activation, sandbox/production gates, όρια χρήσης, licensing και cost control.
- Online Radio στο background με διαχείριση σταθμών.
- Εξωτερικό εργαλείο ανάλυσης προωθητικών ενεργειών και ομάδων καταστημάτων.
- Μελλοντικά reservations/tourism panels μόνο μετά από σαφή εμπορική απόφαση.
- Ενιαία αδειοδότηση και χρέωση ανά module.

## Δεσμευτική σειρά συνέχειας

0. Ετοιμότητα και ελεγχόμενη πιλοτική εγκατάσταση έως Κυριακή 27/09/2026, χωρίς να βαφτίζονται PASS τα ανοικτά Gates.
1. Gate 3 ανατέθηκε στις 25/09 στη νέα σελίδα / `agent/gate3-explicit-conversion-priority-20260925`, μετά την παράδοση #1239. Scope: σύγκριση πρωτοτύπων και αποθηκευμένων σταδίων, απομονωμένη αξιολόγηση ανάγνωσης πολλών προμηθευτών, τεκμηριωμένη διόρθωση και νέα POS αποδοχή. Διατηρείται KG→GR (1 kg = 1.000 g) χωρίς μεταβολή καθαρής αξίας. Gate 3 OPEN· checkpoint `CHECKPOINTS/CHANGES/2026-09-25-gate3-evidence-recovery-takeover.md`.
2. Τα Gate 4, Gate 6, Gate 7 και Gate 8 έχουν PASS, είναι κλειδωμένα και δεν επαναλαμβάνονται χωρίς νέο πραγματικό FAIL ή νέα απαίτηση.
4. Επόμενο διαθέσιμο μεγάλο σκέλος: Workforce μισθοδοσία.
5. Πληρωμές εργαζομένων.
6. Workforce απόδοση, άδειες και προχωρημένοι κανόνες.
7. Barcode και internet αναζήτηση προϊόντων.
8. Advanced Chat και iPhone/PWA.
9. Backup/recovery/staging ολοκληρωμένη αποδοχή.
10. Oxygen, Radio, αναλύσεις προσφορών και υπόλοιπα προαιρετικά modules.
11. Εστίαση / TABLE_SERVICE παραμένει στη δεσμευμένη σελίδα `agent/table-service-layout-takeover-20260927` μέχρι πλήρη υλοποίηση και LAB PASS.

## Αποδοχή κάθε επόμενου βήματος

Κάθε βήμα ακολουθεί υποχρεωτικά: bounded υλοποίηση -> tests -> πράσινο CI -> merge -> exact Render revision -> πραγματικό LAB/USER test -> PASS manual -> αφαίρεση από αυτή τη λίστα.

- TABLE_SERVICE κεντρικό Audit: περιορισμένο PASS PR #1471 / CI #3711 / exact Render `755c976`. Ο ήδη σταλμένος Γύρος 3 και η ολοκλήρωση ΚΑΦΕ εμφανίστηκαν στα κεντρικά Συμβάντα με ελληνική περιγραφή, χειριστή και ποσό Audit 0,00 €, χωρίς νέα συναλλαγή. Το συνολικό TABLE_SERVICE και οι λοιποί έλεγχοι παραμένουν OPEN.

- TABLE_SERVICE Store Mode PWA: το παλιό κοινό manifest άνοιγε `/`. Νέο store-specific manifest δείχνει το ίδιο `/store/<id>` με ξεχωριστό app id· PR #1474 / CI #3717 / exact Render `edf44d9`. Ο ιδιοκτήτης επιβεβαίωσε εγκατάσταση και επανεκκίνηση από εικονίδιο σε Android με LAB Store Mode/PIN (USER PASS). Οπτικό offline/reconnect PASS 19:19–19:20· ανάκτηση προϊόντων και αποστολή μέσα από το εικονίδιο NOT TESTED· καμία offline αποστολή τραπεζιού.

- TABLE_SERVICE κινητό offline/reconnect UX: ένδειξη offline, ανάκτηση τραπεζιών/προϊόντων στην επανασύνδεση και αποστολή ανενεργή μέχρι τον συγχρονισμό. PR #1482 / CI #3732 / exact Render `ce6c6cc`· φυσικό Android οπτικό USER PASS 19:19–19:20 για ένδειξη και διατήρηση READY 3,00 €. Η ανάκτηση προϊόντων, η ενεργοποίηση κουμπιού και server POST παραμένουν NOT TESTED. Δεν υπάρχει offline ουρά ή αυτόματο retry POST· το συνολικό TABLE_SERVICE OPEN. `CHECKPOINTS/CHANGES/2026-09-28-table-service-mobile-reconnect.md`.

- TABLE_SERVICE ασφαλής επανάληψη γύρου: νέο mobile key ανά payload και server replay του ίδιου αποτελέσματος μέσα σε transaction, με 409 για αλλαγμένο περιεχόμενο/χειριστή. 11 tests και build PASS· PR #1501 / CI #3782 / merge και exact Render `675ee74` PASS· απομονωμένο LAB E2E AWAITING. Δεν εκτελέστηκε νέα παραγγελία. `CHECKPOINTS/CHANGES/2026-09-28-table-service-round-idempotency.md`.

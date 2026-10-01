# #27 — μικτά έξοδα / τεκμηριωμένο καθαρό και ΦΠΑ

Ίδια σελίδα, ASSIGNED `codex/task27-expense-vat-20261001`, βάση origin/main. Προηγούμενα bounded PASS κόστους/Ελλάδας/επιστροφών προστατεύονται. Τελευταίες εκκρεμότητες/manual διαβάστηκαν. Η αναφορά έδειχνε μικτό ποσό ως χωρίς ΦΠΑ και άθροιζε ολόκληρο VAT παραστατικού ανά πληρωμή, ακόμη και draft/μερική/πολλαπλή σύνδεση.

Scope μόνο report: gross έξοδα παραμένουν ορατά. Καθαρά/VAT/netprofit/expense ratio NULL όταν λείπει τεκμηρίωση. Γνωστό VAT μόνο από μία ενεργή πλήρη OTHER_EXPENSE πληρωμή με εγκεκριμένο παραστατικό της ίδιας εταιρείας/καταστήματος και συνεπή net+VAT=gross. Πιστωτικά με αντίστοιχο αρνητικό πρόσημο και εγκεκριμένο zeroVAT επιτρέπονται. Μερικές/πολλαπλές/φωτογραφίες δεν αποκτούν αυθαίρετη κατανομή ή μηδενικό VAT. Οι υπολογισμοί είναι ταμειακή εικόνα, όχι φορολογική έκπτωση ή λογιστικό αποτέλεσμα. Χωριστό paid PROFITABILITY παραμένει locked.

Απομονωμένα SQL/HTTP fixtures μόνο CI. Main CI/exact runtime πριν read-only LAB με δύο fresh baselines, ίδια οικονομικά σύνολα gross/πωλήσεων/πληρωμών. Καμία νέα παραγωγική πληρωμή/παραστατικό/stock ή migration. Πλήρης λογιστική συμφωνία, partial allocation, Owner/live positive και ιστορικό κόστος OPEN.

Local Node20: 1783 server PASS / 0 FAIL / 1 optional PG SKIP χωρίς DATABASE_URL, 15 targeted PASS, production build PASS, diff check PASS. Isolated actual SQL/HTTP AWAITING CI: full124→net100/VAT24, explicitzeroVAT, credit−124→net−100/VAT−24, partial/split acrossdays/draft/inconsistent/unlinked/duplicate unknown8, reversed exclusion, aggregate NULL propagation and no report ledger mutation.

PR1618 / CI4063 PASS, actual SQL/HTTP18:25:33.072Z: gross124/net100/VAT24, zeroVAT known, credit net−100, eight unknown payments / partial and duplicate NULL, reversed excluded and snapshots unchanged. Merge `bca05c98ff8928ca41e6635dad8cd9903b4812dd`. MainCI/exactdeploy/read-onlyLAB pending.

## Runtime / fresh baseline before read-only LAB
- CI4066 SUCCESS at 06fc1e237e99ecc725c708370d435f0e60862910; CI4068 SUCCESS and Render1878 SUCCESS at 282dbb63e71bbd44fd18c6a8a6537a36f8ecd28c. Browser /api/health confirms exact 282dbb63 revision.
- Fresh BackOffice reload before opening report: MAIN opened 27/09 20:24 by LAB POS 2; transactions 2, cash 2.40, cards/IRIS 0, total 2.40, last 01/10 12:51. LAB-POS-02 opened 26/09 01:33 by LAB POS 2; transactions 2, cash/cards/IRIS/total 0, last —.
- Read-only report/CSV only; no production payment, invoice, return or stock writes.

## Actual read-only LAB / CSV result
- Runtime exact282dbb63, report default01Aug–01Oct: gross expenses313.20, missing VAT7/7; September and total net expenses/VAT/net profit/expense ratio —. October zero expense gross/net/VAT known0. Sales54.60; purchase gross1863.76/net1622.06, payment5227.90, missing cost8/75, returns5/cancels2 preserved.
- Actual downloaded file `eikona-epixeiriseis-2026-08-01-2026-10-01 (1).csv` verified despite browser event timeout; 21 headers/2 months. September gross313.2, missing7, net/VAT/net profit/ratio blank; October0. Evidence copied as expense-vat-lab.csv.
- Custom date fills and month expansion did not persist in this browser session; no new daily live PASS claimed. Screenshot shows default report/unknown-VAT warning. Existing calendar CI coverage retained; this observation remains separate follow-up.
- Fresh final reload: MAIN2 transactions/cash2.40/card+IRIS0/total2.40/last01Oct12:51; LAB-POS-02 2transactions/all0/last—. Open times unchanged. No production writes. Live DB counts/hash/stock not tested; SKU/qty/payment/physical POS N/A.
- LIMITED UI/CSV unknown-VAT PASS only. Positive documented full payment100+24, zeroVAT, credit−100/−24 and conservative partial/duplicate handling SQL/HTTP CI-only; independent live positive VAT, partial allocation, historical cost, Owner/print/full module OPEN. Same owner retained.

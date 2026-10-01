# #27 — μικτά έξοδα / τεκμηριωμένο καθαρό και ΦΠΑ

Ίδια σελίδα, ASSIGNED `codex/task27-expense-vat-20261001`, βάση origin/main. Προηγούμενα bounded PASS κόστους/Ελλάδας/επιστροφών προστατεύονται. Τελευταίες εκκρεμότητες/manual διαβάστηκαν. Η αναφορά έδειχνε μικτό ποσό ως χωρίς ΦΠΑ και άθροιζε ολόκληρο VAT παραστατικού ανά πληρωμή, ακόμη και draft/μερική/πολλαπλή σύνδεση.

Scope μόνο report: gross έξοδα παραμένουν ορατά. Καθαρά/VAT/netprofit/expense ratio NULL όταν λείπει τεκμηρίωση. Γνωστό VAT μόνο από μία ενεργή πλήρη OTHER_EXPENSE πληρωμή με εγκεκριμένο παραστατικό της ίδιας εταιρείας/καταστήματος και συνεπή net+VAT=gross. Πιστωτικά με αντίστοιχο αρνητικό πρόσημο και εγκεκριμένο zeroVAT επιτρέπονται. Μερικές/πολλαπλές/φωτογραφίες δεν αποκτούν αυθαίρετη κατανομή ή μηδενικό VAT. Οι υπολογισμοί είναι ταμειακή εικόνα, όχι φορολογική έκπτωση ή λογιστικό αποτέλεσμα. Χωριστό paid PROFITABILITY παραμένει locked.

Απομονωμένα SQL/HTTP fixtures μόνο CI. Main CI/exact runtime πριν read-only LAB με δύο fresh baselines, ίδια οικονομικά σύνολα gross/πωλήσεων/πληρωμών. Καμία νέα παραγωγική πληρωμή/παραστατικό/stock ή migration. Πλήρης λογιστική συμφωνία, partial allocation, Owner/live positive και ιστορικό κόστος OPEN.

Local Node20: 1783 server PASS / 0 FAIL / 1 optional PG SKIP χωρίς DATABASE_URL, 15 targeted PASS, production build PASS, diff check PASS. Isolated actual SQL/HTTP AWAITING CI: full124→net100/VAT24, explicitzeroVAT, credit−124→net−100/VAT−24, partial/split acrossdays/draft/inconsistent/unlinked/duplicate unknown8, reversed exclusion, aggregate NULL propagation and no report ledger mutation.

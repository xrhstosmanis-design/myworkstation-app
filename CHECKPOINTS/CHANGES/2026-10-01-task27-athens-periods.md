# #27 — ημερολογιακές περίοδοι ώρας Ελλάδας

Συνέχεια ίδιας υπεύθυνης σελίδας, branch `codex/task27-athens-periods-20261001`, βάση f88174b. Προηγούμενο missing-cost LAB PASS προστατεύεται σύμφωνα με checkpoint task27-profitability και manualprofitability. Η πραγματική οθόνη της01/10 έδειχνε αρχή31/07 αντί01/08: localmidnight→UTC→slice μετακινεί την ημερομηνία. Ο server ομαδοποιεί UTCtimestamp χωρίς μετατροπή Ελλάδας.

Scope: ημερολογιακά from/to με έγκυρες ημέρες, ελληνικά midnight όρια με DST, ελληνική ημέρα/μήνας για πωλήσεις/αγορές/έξοδα. Παλιό ISO from/to διατηρείται. Προστατεύονται counts/unknownprofits, auth/company/store/CASH_CONTROL και locked PROFITABILITY. Καμία production DB mutation ή νέα πώληση/πληρωμή/stock. Περίοδοι UI και απομονωμένο boundary SQL/HTTP test, έπειτα exact deploy/read-only LAB. Υπόλοιπα επιστροφών/ΦΠΑ εξόδων/ιστορικού κόστους/Owner παραμένουν ανατεθειμένα στο#27.

## Τοπικοί έλεγχοι

Node20:13targetedPASS,1773serverPASS/0FAIL/1optionalPostgreSQLSKIP, frontendbuildPASS. Χειμώνας/καλοκαίρι,23/25ωρα DST, leapday/invalidday/partial/inverted, current/default/previousquarter/yearrollover επαληθεύθηκαν. ΝέοactualisolatedHTTP/SQL test AWAITINGCI: Greekday01Oct2030, πωλήσεις πριν/start/last/end, αγορά και έξοδο στοUTC21της30Sep ομαδοποιούνται01Oct. Sales5/purchases7/expenses11, snapshotsledgerίδια. ΚαθαρισμόςfixturesfinallyμόνοCI. Sale/PurchaseDocument είναιUTC TIMESTAMP, StoreTransactionTIMESTAMPTZ: διαφορετικέςσωστέςμετατροπές. ΤοπαλιόISOAPI συνεχίζειμείδιαinstantbounds.

## CI και merge

PR #1606, head451f0014, CI4033PASS μαζί μεactualSQL/HTTPcalendarperiods17:14:31.935Z. Merge `16b1f76f1c6f0e6da1b7e25022127f1809960da7`. Boundarysales5/purchases7/expenses11 στοGreek01Oct2030, noledgermutation. ΠαλιόISOκαιmissingcostE2E επίσηςPASS. MainCI/exactdeploy/LAB AWAITING· όχιLABPASS.

## Πρόσθετο όριο ακρίβειας — AWAITING CI/LAB

Η StoreTransaction TIMESTAMPTZ διατηρεί μικροδευτερόλεπτα. Calendar query πλέον χρησιμοποιεί αποκλειστικό επόμενο midnight αντί inclusive23:59:59.999. Το παλιό ISO endpoint παραμένει inclusive. Απομονωμένο E2E περιλαμβάνει έξοδο στο23:59:59.9995 και αναμένει expenses12. Δεν έγιναν production writes.

Local verification: Node20 npm test from server cwd1777PASS/0FAIL/1optionalPGSKIP;13targetedPASS;productionbuildPASS. Initial root-cwd direct glob invoked tests from incorrect cwd and failed ENOENT; correct npm workspace invocation passed. Extra100 expense exactly at next midnight must be excluded. Required CI actual isolated SQL/HTTP remains pending.

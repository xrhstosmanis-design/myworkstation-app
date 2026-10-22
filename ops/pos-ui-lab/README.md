# POS UI V2 — οπτικό LAB

Ανοίγει το πραγματικό `StorePosPanel` της υποψήφιας έκδοσης
`253792dbf6a4481d6fab7a06a4b6b61eab83870b`, με αποκλειστικά συνθετικό
κατάλογο. Δεν αποτελεί εγκατάσταση του πλήρους backend ούτε δοκιμή συσκευών.

Η ξεχωριστή υπηρεσία δεν χρησιμοποιεί βάση, λογαριασμούς ή διαπιστευτήρια
παραγωγής. Δεν εισάγει το production server, routers, jobs ή providers.
Ο HTTP server απορρίπτει κάθε POST/PUT/PATCH/DELETE και κάθε επιχειρησιακό API.
Η πολιτική CSP αποκλείει εξωτερικά scripts/συνδέσεις και frames.
Ο browser κρατά μόνο τοπική δοκιμαστική κατάσταση στο δικό του origin.

## Τοπική εκτέλεση

Με Node 20 και τις εξαρτήσεις του repository:

```sh
node ops/pos-ui-lab/build.mjs
node --test server/test/pos-ui-v2-visual-lab.test.js
node ops/pos-ui-lab/runtime.mjs
```

Άνοιξε `http://localhost:8080`. Η υπηρεσία δημοσιεύει μόνο το UI και
`/api/health`, όπου διακρίνονται το sourceRevision και το revision φιλοξενίας.

## Αποδοχή και όρια

Ελέγχουμε μέγεθος κειμένων, γρήγορα προϊόντα, κατηγορίες, καλάθι,
αναλύσεις/zoom, ορατά κουμπιά και άνοιγμα/κλείσιμο παραθύρων όπου δεν
απαιτείται backend. Η αποτυχία καταχώρησης είναι αναμενόμενη και ορατή.
Δεν ισχυριζόμαστε PASS πληρωμής, αποθήκης, τιμολογίου, επιστροφής,
ταμειακής, EFTPOS, QR/camera ή πραγματικού δεύτερου πελάτη.

Για πλήρες LAB χρειάζεται πρόσθετο, ελεγμένο runtime με απομονωμένη βάση,
πραγματικά POS APIs, συνθετικό seed και μετρήσεις πριν/μετά. Δεν χρησιμοποιούμε
το υπάρχον παραγωγικό κατάστημα LAB για να παρακάμψουμε αυτόν τον διαχωρισμό.

Render: νέο `myworkstation-pos-ui-v2-lab`, Node 20, δωρεάν πλάνο,
branch `lab/pos-ui-v2-preview-3012`, auto-deploy off, χωρίς env groups.
Build: `npm install --ignore-scripts --no-audit --no-fund && node ops/pos-ui-lab/build.mjs`.
Start: `node ops/pos-ui-lab/runtime.mjs`.
Το δωρεάν περιβάλλον μπορεί να καθυστερήσει στην πρώτη εκκίνηση.

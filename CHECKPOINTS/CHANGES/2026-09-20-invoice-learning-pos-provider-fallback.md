# Invoice Learning — ίδια provider fallback ροή με το POS

## Πραγματικό LAB αποτέλεσμα

- Η έκδοση `55bb5c90c6ea13db073ae37a6d1351f22166f866` επιβεβαίωσε ότι το Invoice Learning χρησιμοποιεί την ίδια Azure μεταφορά με το POS.
- Το ίδιο παραστατικό συνέχισε να λαμβάνει `ACCESS_403` από το Azure.
- Η υπολειπόμενη διαφορά ήταν μετά την Azure κλήση: το POS συνέχιζε στον επόμενο configured provider, ενώ το Invoice Learning επέστρεφε άμεσα `503`.

## Περιορισμένη αλλαγή

- Σε Azure request failure, το Invoice Learning κρατά την ασφαλή κατάσταση και τον δημόσιο διαγνωστικό κωδικό, αλλά συνεχίζει στο ήδη ρυθμισμένο OpenAI fallback με το αρχικό PDF/εικόνα.
- Αν δεν υπάρχει `OPENAI_API_KEY`, η ροή παραμένει `503` και αναφέρει ασφαλώς τον Azure diagnostic code.
- Τα transient Azure retries παραμένουν bounded και αμετάβλητα.

## Fail-closed invariants

- Το OpenAI αποτέλεσμα περνά από τον ίδιο πλήρη έλεγχο γραμμών και οικονομικής συμφωνίας.
- Κενό αποτέλεσμα απορρίπτεται με `422`.
- Μερικό αποτέλεσμα που δεν συμφωνεί με το σύνολο απορρίπτεται με `422`.
- Δεν δημιουργείται ή οριστικοποιείται παραστατικό, πληρωμή ή stock από αυτή τη route.
- Καμία αλλαγή σε POS, credentials, approval/finalization, fiscal, accounting ή myDATA.

## Έλεγχοι και κατάσταση

- Regression tests καλύπτουν την κοινή Azure μεταφορά, τη συνέχεια προς fallback και τη διατήρηση του οικονομικού fail-closed guard.
- **AWAITING CI / DEPLOY / LAB — δεν χαρακτηρίζεται fixed.**

LAB PASS απαιτεί πλήρες, οικονομικά συμφωνημένο αποτέλεσμα από το ίδιο αρχικό παραστατικό μετά το exact deploy.

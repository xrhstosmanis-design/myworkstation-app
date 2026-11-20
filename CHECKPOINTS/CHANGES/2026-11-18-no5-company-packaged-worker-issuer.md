# Νο5 — Πραγματικός issuer και πακεταρισμένος backup worker

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · ίδιο Draft PR #4007, βάση remote2f2fb4ab. Δικαιώματα source53STORE+7COMPANY, πλήρης κάλυψη OPEN, καμία παραγωγική πράξη.

## Διορθώσεις πραγματικών ορίων

- Ο πραγματικός issueSession υπογράφει την κανονική προσωπική SuperAdmin σύνδεση ως role OWNER με platformRole SUPER_ADMIN και isSuperAdmin true. Ο installer απαιτεί πλέον αυτή την ακριβή issuer μορφή, μαζί με πραγματικό DB SUPER_ADMIN/live session και απουσία support/store/staff context. Δεν άλλαξε ο issuer ούτε παραχωρήθηκαν Owner/SA ρόλοι σε προσωπικό. Νέο regression χρησιμοποιεί την πραγματική issueSession και JWT verification, αντί να υποθέτει claims που ο issuer δεν εκδίδει.
- Το πραγματικό backup image μεταφέρει lifecycle scripts στο /backup/lifecycle, όπου το προηγούμενο HERE.parents[2] και τα repo paths δεν λειτουργούν. Προστέθηκε αυστηρός κοινός resolver με έμπιστο absolute MWS_COMPANY_SOURCE_ROOT, repo-shaped source copies στο image και byte-equivalence του εκτελούμενου κώδικα. Πακετάρονται τα20 δεσμευμένα αρχεία, περιλαμβανομένου του native COPY auditor και του resolver. Path traversal/symlink escape ή runtime-copy tampering απορρίπτονται. Το Dockerfile δεν ενεργοποιεί COMPANY profile και δεν εκτελεί Node ή backup κατά το build/import.
- Το στενό Docker build whitelist περιλαμβάνει τα απαιτούμενα reviewed source files και τα υπάρχοντα history assets που ήδη αντιγράφει το Dockerfile. Τα παλιά default profiles δεν αλλάζουν.
- Το AI-wallet job απέτυχε πριν τις δοκιμές επειδή το ubuntu-latest έγινε ubuntu26.04 και δεν είχε PG16 binary/package. Ευθυγραμμίστηκε με το ήδη δοκιμασμένο ubuntu24.04 του κύριου native CI, διατηρώντας τον υπάρχοντα περιορισμένο PG16 fallback. Δεν προστέθηκε repository, secret, job ή permission.

## Επαλήθευση

Τελική στοχευμένη εκτέλεση7αρχείων, Node24:20PASS/4SKIP/0FAIL (24σύνολο). Τα skips είναι3nativePG και1actualDocker. Πραγματικό relocated-runtime regression εκτελεί τον Python resolver/producer, ελέγχει20hashes, auditor import, signed request parsing και parity των6profiles χωρίς DB/S3. Το επιπλέον actualDocker regression χρησιμοποιεί το υπάρχον CI image με network none/no credentials· δεν παρουσιάζεται ως τοπικό PASS. YAML parse και diffcheck PASS. Client αμετάβλητος από το προηγούμενο163PASS/5PGSKIP/buildPASS batch· τα επιμέρους overlap counts δεν αθροίζονται.

Το προηγούμενο κύριο CI44272740169 πέρασε wholesale startup/browser/offline και όλα τα υπόλοιπα security tests, αλλά απέτυχε στα2native installer fixtures πριν από backup επειδή το setup δημιουργούσε ξανά υπάρχον StoreLifecycleRuntime. Το fixture χρησιμοποιεί πλέον IF NOT EXISTS, με διατήρηση του native exact control-schema validation. Καμία πραγματική πλήρης λήψη/επαναφορά/εγκατάσταση δεν είχε πιστοποιηθεί από εκείνο το run. Το AI-wallet44272740083 απέτυχε μόνο στο PG16 prerequisite όπως παραπάνω. ΝέοCI στο ακριβές source απαιτείται.

Παραμένουν υποχρεωτικά actualBASE/CAPTURE full-backup/private-restore/install/7grant acceptance και actualimage packaging CI, ελεγχόμενη paired εγκατάσταση/readback και οι υπόλοιπες εταιρικές οικογένειες. Όλες οι ανθρώπινες δοκιμές λογαριασμών/POS παραμένουν στο τέλος, στο υπάρχον LAB, χωρίς επανάληψη ήδη επιβεβαιωμένων τελικών οικονομικών πράξεων.

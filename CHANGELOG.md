# Changelog

## GO LIVE 14.7.0C-HF1 — Pairing Code PostgreSQL Fix
- Διορθώθηκε το PostgreSQL σφάλμα `make_interval(mins => bigint)`.
- Η διάρκεια pairing code μετατρέπεται ρητά σε `integer`.
- Ο 15λεπτος κωδικός μπορεί να δημιουργηθεί χωρίς αλλαγή στη δομή της βάσης.
- Η έκδοση του Cloud Store Connector health endpoint έγινε `14.7.0C-HF1`.

## GO LIVE 14.7.0C — Cloud Store Connector
- Ενεργή σελίδα λεπτομερειών καταστήματος.
- Pairing code μίας χρήσης με λήξη και SHA-256 hash.
- Ξεχωριστό STORE_DEVICE JWT token ανά συσκευή.
- Online/offline κατάσταση, heartbeat και απομακρυσμένη ανάκληση.
- Demo cloud catalog με ουρά αλλαγών και BIGINT cursor.
- Device bootstrap, pull/ack αλλαγών και idempotent inbound events.
- Additive raw-SQL cloud tables και audit ενεργειών.

## 0.6.0
- Smart Shift Engine 2.0.
- Κανόνας ανάπαυσης μετά από νύχτα.
- Έλεγχος μέγιστων ωρών και ημερών.
- Έλεγχος συνεχόμενων ημερών.
- Βελτιωμένη βαθμολόγηση υποψηφίων.
- Δίκαιη κατανομή Σαββατοκύριακων.
- Ελάχιστη χρήση έκτακτων.
- Δείκτης ποιότητας 0–100%.
- Αναφορά ωρών και βαρδιών ανά εργαζόμενο.
- Εξηγήσεις και προτάσεις κάλυψης.

## 0.5.0
- Άδειες, ασθένειες και μη διαθεσιμότητα.
- Χειροκίνητες αντικαταστάσεις.

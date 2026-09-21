# Invoice Learning — mathematical discount recovery

- Το τιμολόγιο ΔΕΛΤΑ έδινε ποσότητα `6`, τιμή `1,74 €` και καθαρή αξία `9,40 €`, αλλά η έκπτωση έμενε κενή.
- Το σύστημα πλέον υπολογίζει την έκπτωση μόνο όταν η πράξη συμφωνεί με την καθαρή αξία.
- Στο συγκεκριμένο παράδειγμα αποθηκεύεται έκπτωση `10%`.
- Γραμμή που δεν επιστρέφεται καθόλου από OCR δεν συμπληρώνεται αυτόματα· προστίθεται χειροκίνητα στο εποπτευόμενο πρόχειρο.
- Επόμενο: πράσινο CI, merge/deploy και νέα δοκιμή του ίδιου τιμολογίου.
## Same-image candidate selection

The Learning Lab no longer accepts the first stochastic provider response for
the same uploaded image. It keeps up to three candidates keyed by the original
file fingerprint, scores them by footer reconciliation, mathematical line
validation, completeness and line coverage, then reuses the strongest winner.
This addresses repeated tests where the third read was materially better than
the first without copying quantities, prices or discounts from another invoice.

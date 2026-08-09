# MyWorkStation — Touch Keyboard Policy

Όλα τα πεδία κειμένου/αριθμών που προσθέτει το MyWorkStation στο BackOffice πρέπει να είναι touch-friendly.

## Κανόνας
- Σε touch interaction σε `input`, `textarea` ή contenteditable ανοίγει το in-app touch keyboard.
- Σε mouse/physical keyboard δεν ανοίγει αυτόματα.
- `type=date`, `type=time`, checkbox/radio, select και file inputs εξαιρούνται και χρησιμοποιούν το native control.
- Numeric fields ανοίγουν αριθμητικό layout.
- Email/tel/text/search/password ανοίγουν κατάλληλο text layout.
- Enter ολοκληρώνει την εισαγωγή, Backspace διαγράφει, Space εισάγει κενό, Shift αλλάζει πεζά/κεφαλαία.
- Το keyboard δεν πρέπει να αλλάζει μόνο του τιμές, να υποβάλει φόρμες ή να προκαλεί render loops.

Ο κανόνας ισχύει για Παραγγελίες & Αγορές, Προμηθευτές, Έξοδα & Πληρωμές, Βάρδιες & Διαφορές και κάθε νέο BackOffice module.

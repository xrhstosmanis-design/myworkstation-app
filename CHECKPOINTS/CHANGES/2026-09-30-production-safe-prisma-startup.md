# 30/09/2026 — Ασφαλής εκκίνηση Prisma στην παραγωγή

Τα Render deploys `dep-dau2kunf3r2c73eekl0g` και `dep-dau2l1ibpuus73bci7e0` του revision `5f38566` απέτυχαν: η εντολή `prisma db push` προειδοποίησε για διαγραφή υφιστάμενων μη κενών πινάκων και αρνήθηκε χωρίς `--accept-data-loss`. Το live revision παρέμεινε `53b3055`. Δεν εγκρίνεται καταστροφικός συγχρονισμός σχήματος.

Το production startup εκτελεί `prisma generate` και παραλείπει το `db push`. Στο τοπικό/CI περιβάλλον το `db push` παραμένει διαθέσιμο. Κάθε πραγματική αλλαγή σχήματος στην παραγωγή χρειάζεται χωριστή ελεγμένη μεταφορά. Έλεγχος: `NODE_ENV=production node server/scripts/safe-prisma-push.js` ολοκληρώθηκε χωρίς πρόσβαση στη βάση. CI, νέο exact live deploy και νέα λήψη myDATA παραμένουν AWAITING.

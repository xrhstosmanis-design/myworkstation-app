import {readFile,writeFile} from "node:fs/promises";

const path="CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md";
const startMarker="## 2026-09-23 — efood / Pelican LAB schema bootstrap";
const nextMarker="## 2026-09-23 — Workforce προσωπικό PIN συναδέλφου από POS";
const replacement=`## 2026-09-23 — efood / Pelican LAB schema bootstrap — LAB PASS / FORM LOAD COMPLETE

- [x] Το αρχικό LAB FAIL ήταν «Παρουσιάστηκε εσωτερικό σφάλμα» πριν φορτωθεί η φόρμα efood.
- [x] Η διόρθωση του legacy CHECK constraint έγινε στο PR #1110 και ενσωματώθηκε στο κεντρικό \`main\`, revision \`195a2a27c6c7a8a61d577682215ac432d1d4b582\`.
- [x] Main CI #2838 PASS και Render deploy #1397 PASS με επιβεβαίωση της ακριβούς revision.
- [x] Πραγματικό LAB PASS: η φόρμα \`efood / Pelican — Indirect POS\` ανοίγει στο σωστό \`MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ\` χωρίς εσωτερικό σφάλμα και εμφανίζει τα SANDBOX πεδία Chain ID, Vendor / Store ID, Client ID, Client Secret και Authorization webhook.
- [x] Η ένδειξη \`LAB — ΔΕΝ ΕΧΕΙ ΠΡΟΕΤΟΙΜΑΣΤΕΙ\` είναι αναμενόμενη επειδή δεν έχουν ακόμη αποθηκευτεί credentials· δεν αποτελεί αποτυχία του schema bootstrap.
- [x] Δεν καταχωρήθηκε ή εκτέθηκε credential, δεν πατήθηκε αποθήκευση και δεν έγινε εξωτερική κλήση, παραγγελία, πώληση, stock, πληρωμή, fiscal ή myDATA μεταβολή.
- [ ] Επόμενο ξεχωριστό βήμα: έλεγχος του κάτω μέρους της φόρμας, τοπική συμπλήρωση των test credentials χωρίς κοινοποίηση μυστικών και αποθήκευση με όλους τους fail-closed διακόπτες ανενεργούς.
- Checkpoint: \`CHECKPOINTS/CHANGES/2026-09-23-efood-lab-schema-bootstrap.md\`.

`;

const current=await readFile(path,"utf8");
const start=current.indexOf(startMarker);
const next=current.indexOf(nextMarker);
if(start<0||next<0||next<=start)throw new Error("Could not locate the efood active-list section");
await writeFile(path,current.slice(0,start)+replacement+current.slice(next),"utf8");

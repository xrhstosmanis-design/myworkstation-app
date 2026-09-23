import {readFile,writeFile} from "node:fs/promises";

const path="CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md";
const marker="## 2026-09-23 — efood / Pelican LAB schema bootstrap";
const entry=`## 2026-09-23 — efood / Pelican LAB schema bootstrap — LAB FAIL / AWAITING CI

- [x] Πραγματικό LAB FAIL: στο \`MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ\` η ασφαλής οθόνη έδειξε «Παρουσιάστηκε εσωτερικό σφάλμα» και δεν φόρτωσε τη φόρμα efood.
- [x] Αιτία: παλαιός CHECK constraint του \`StoreIntegrationCredential.kind\` δεν εντοπιζόταν αξιόπιστα και η επαναδημιουργία του canonical constraint μπορούσε να αποτύχει με duplicate constraint πριν φορτωθεί το LAB endpoint.
- [x] Η διόρθωση αφαιρεί idempotently κάθε παλαιό CHECK που αφορά ακριβώς τη στήλη \`kind\` και επαναφέρει έναν canonical constraint με \`MYDATA\`, \`VAT_LOOKUP\`, \`EFOOD\`.
- [x] Διατηρούνται αυστηρά LAB-only, SANDBOX, \`enabled=false\`, \`externalCallsEnabled=false\` και μηδενικές μεταβολές σε παραγγελίες, πωλήσεις, stock, πληρωμές, RBS/EFTPOS, fiscal ή myDATA.
- [ ] Green CI → merge → exact deploy → Ctrl+F5 και εκ νέου άνοιγμα «Ασφαλείς διασυνδέσεις καταστήματος».
- [ ] LAB PASS μόνο όταν φορτωθεί η φόρμα \`efood / Pelican — Indirect POS\` στο σωστό LAB χωρίς εσωτερικό σφάλμα. Η αποθήκευση credentials και οποιαδήποτε επόμενη δοκιμή είναι ξεχωριστό βήμα.
- Checkpoint: \`CHECKPOINTS/CHANGES/2026-09-23-efood-lab-schema-bootstrap.md\`.

`;

const current=await readFile(path,"utf8");
if(!current.includes(marker))await writeFile(path,entry+current,"utf8");

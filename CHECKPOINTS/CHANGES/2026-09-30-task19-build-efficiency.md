# Εργασία #19 — Περιορισμός περιττών GitHub/Render builds

## Checkpoint πριν από την αλλαγή

- Βάση: σημερινό `origin/main` `d2f2cba`.
- Branch: `fix/task19-build-filters`.
- Το production web είχε ταυτόχρονα `autoDeployTrigger: checksPass` στο Render και guarded deploy hook στο GitHub, άρα υπήρχαν δύο πιθανοί δρόμοι deploy για το ίδιο commit.
- Το backup cron δεν είχε build filter και μπορούσε να ξαναχτιστεί για άσχετες αλλαγές εφαρμογής ή τεκμηρίωσης.
- Το CI δεν ακύρωνε παλαιότερη εκτέλεση όταν ερχόταν νεότερο commit στο ίδιο PR.

## Στενό scope

1. Το web auto-deploy του Render απενεργοποιείται. Παραμένει ο υπάρχων guarded GitHub deploy, ο οποίος κρατά rollback checkpoint και περιμένει το ακριβές revision.
2. Αλλαγές μόνο σε docs/checkpoints, GitHub workflow, backup image ή Windows installer δεν προκαλούν αυτόματο web build.
3. Το backup cron ξαναχτίζεται μόνο για αλλαγές στο `ops/backup/**`. Το `render.yaml` εξακολουθεί να συγχρονίζεται πάντα από το Blueprint.
4. Νεότερο CI commit στο ίδιο PR/branch ακυρώνει την παλαιότερη εκτέλεση.

## Όρια ασφαλείας

- Καμία αλλαγή σε POS, OCR, τιμολόγια, πληρωμές, stock, myDATA, fiscal ή production δεδομένα.
- Καμία αλλαγή στο 3ωρο πρόγραμμα backup, στα secrets ή στο restore dry-run.
- Manual deploy και Blueprint configuration updates παραμένουν διαθέσιμα.

## Αποδοχή

- Targeted source tests: 10/10 PASS.
- Πλήρες server suite: 1.653 PASS / 0 FAIL / 1 SKIP.
- Production client/server build: PASS.
- Εκκρεμούν πράσινο CI, merge και επιβεβαίωση ότι τα Render Build Filters συγχρονίστηκαν.

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
5. Documentation-only commits ολοκληρώνουν μόνο τον ελαφρύ ταξινομητή και δεν ξεκινούν πλήρες test/build ή production deploy.

## Όρια ασφαλείας

- Καμία αλλαγή σε POS, OCR, τιμολόγια, πληρωμές, stock, myDATA, fiscal ή production δεδομένα.
- Καμία αλλαγή στο 3ωρο πρόγραμμα backup, στα secrets ή στο restore dry-run.
- Manual deploy και Blueprint configuration updates παραμένουν διαθέσιμα.

## Αποδοχή

- Targeted source tests: 12/12 PASS.
- Πλήρες server suite: 1.653 PASS / 0 FAIL / 1 SKIP.
- Production client/server build: PASS.
- PR #1557 / CI #3917 και main CI #3918 PASS, merge/exact production `7ee5ca6`.
- Render readback: web Auto-Deploy `Off`, πέντε ignored paths ενεργά, cron included path `ops/backup/**`, και κανένα νέο cron build για το web-only commit.
- PR #1558 / CI #3919 και main CI #3920 PASS, merge/exact production `6d6384c`.
- Τελικό documentation-only proof: ο classifier ολοκλήρωσε επιτυχώς χωρίς το βαρύ `build-and-test`, χωρίς production deploy και χωρίς cron rebuild.
- **FINAL PASS 30/09/2026.**

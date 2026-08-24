# CHECKPOINT — NETLINK_PREPAID_MODULE

Ημερομηνία: 2026-08-24
Branch: `agent/netlink-staging-current-main`
Legacy PR: #210

## Σταθεροί κανόνες
- Το Netlink είναι πληρωμένο πρόσθετο module: `NETLINK_PREPAID`.
- Δεν είναι ξεχωριστό ταμείο.
- Κάθε ολοκληρωμένη Netlink πώληση συνδέεται με κανονική `Sale` του ίδιου καταστήματος/εταιρείας.
- Ο τζίρος μετράει μία φορά στην κανονική POS πώληση.
- Κάρτα κινητής και παροχή υπηρεσίας είναι δύο ξεχωριστές γραμμές στην ίδια πώληση.
- Παράδειγμα: κάρτα 20,00€ + παροχή υπηρεσίας 0,50€ = σύνολο πελάτη 20,50€.
- Η προμήθεια MyWorkStation είναι 1% πάνω στην αξία της κάρτας, όχι πάνω στην παροχή υπηρεσίας.
- Στην παραγωγή η κάρτα/PIN εκδίδεται μόνο μετά από επιβεβαιωμένη φορολογική απόδειξη.
- Πριν συνδεθεί η ταμειακή επιτρέπεται staging TEST MODE, αυστηρά εκτός production.
- Τα πραγματικά Netlink credentials δεν αποθηκεύονται στο repository. Μόνο environment secrets.

## Staging στοιχεία που απαιτεί ο connector
- `NETLINK_TOKEN_URL`
- `NETLINK_API_BASE`
- `NETLINK_CLIENT_ID`
- `NETLINK_CLIENT_SECRET`
- `NETLINK_USERNAME`
- `NETLINK_PASSWORD`
- `NETLINK_STATION_ID`
- `NETLINK_TEST_MODE=true` μόνο στο staging
- `NETLINK_ENABLE_EXECUTE=false` μέχρι να επιβεβαιωθεί authentication/menu και να ολοκληρωθεί η ασφαλής δοκιμή

## Επόμενο checkpoint
Καθαρή μεταφορά του legacy PR #210 πάνω στο σημερινό main, CI και μετά Render staging: authentication -> /menu -> prepare/execute test.
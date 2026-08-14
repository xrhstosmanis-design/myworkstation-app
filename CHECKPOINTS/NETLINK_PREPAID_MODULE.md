# CHECKPOINT — NETLINK_PREPAID_MODULE

Ημερομηνία: 2026-08-14
Branch: `feature/netlink-prepaid-module`
PR: #210

## Σταθεροί κανόνες
- Το Netlink είναι πληρωμένο πρόσθετο module: `NETLINK_PREPAID`.
- Δεν είναι ξεχωριστό ταμείο.
- Κάθε ολοκληρωμένη Netlink πώληση συνδέεται με κανονική `Sale` του ίδιου καταστήματος/εταιρείας.
- Ο τζίρος μετράει μία φορά στην κανονική POS πώληση.
- ΚΡΙΣΙΜΟΣ ΚΑΝΟΝΑΣ: η κάρτα/PIN Netlink εκδίδεται ΜΟΝΟ αφού η ταμειακή/φορολογικός connector επιβεβαιώσει επιτυχή έκδοση απόδειξης.
- Αν αποτύχει η φορολογική απόδειξη, δεν καλείται Netlink execute.
- Αν η απόδειξη έχει εκδοθεί αλλά αποτύχει το Netlink execute, δημιουργείται κρίσιμη εκκρεμότητα/reconciliation και δεν κρύβεται η αποτυχία.
- Το `NetlinkTransaction` είναι provider/audit/settlement ledger.
- Η εμπορική προμήθεια MyWorkStation καταγράφεται με rate 1% πάνω στο ποσό Netlink.
- Τα πραγματικά Netlink credentials δεν αποθηκεύονται στο repository. Μόνο environment secrets.

## Ολοκληρωμένα
- Netlink token client + refresh, `/menu`, one-step execute, two-step prepare/execute.
- CompanyModule gate `NETLINK_PREPAID` και paid add-on στον Super Admin χωρίς default ενεργοποίηση.
- Transaction ledger με request/provider/sale/operator/payment/commission στοιχεία.
- Duplicate request protection και σωστή μετάβαση PREPARED -> EXECUTING για two-step flow.
- Per-store `NetlinkStoreConfig` mapping σε ενεργό POS product.
- Mapping safety: το mapped προϊόν δεν επιτρέπεται να είναι stock-tracked.
- Store Mode launcher μόνο όταν περνά το server-side module gate.
- Δυναμικό StoreNetlinkModal και payment/fiscal-gate UI.
- Settlement summary ανά εταιρεία/κατάστημα/περίοδο.

## Σε εξέλιξη
1. Σύνδεση με πραγματικό fiscal confirmation event του RBS/CapDriver connector.
2. Κανονικό POS checkout -> fiscal receipt success -> Netlink execute.
3. Reconciliation state για receipt-success / Netlink-failure.
4. E2E tests για tenant isolation, duplicate request, fiscal gate και settlement.
5. Staging test με τα Netlink credentials.

## Production safety
Το `NETLINK_ENABLE_EXECUTE` παραμένει `false` μέχρι να υπάρχει επιβεβαιωμένη φορολογική απόδειξη και να περάσουν CI/E2E οι παραπάνω ροές.
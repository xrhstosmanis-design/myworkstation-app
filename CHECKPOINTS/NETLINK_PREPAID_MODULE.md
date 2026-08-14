# CHECKPOINT — NETLINK_PREPAID_MODULE

Ημερομηνία: 2026-08-14
Branch: `feature/netlink-prepaid-module`
PR: #210

## Σταθεροί κανόνες
- Το Netlink είναι πληρωμένο πρόσθετο module: `NETLINK_PREPAID`.
- Δεν είναι ξεχωριστό ταμείο.
- Κάθε ολοκληρωμένη Netlink πώληση πρέπει να συνδέεται με κανονική `Sale` του ίδιου καταστήματος/εταιρείας.
- Ο τζίρος μετράει μία φορά στην κανονική POS πώληση.
- Το `NetlinkTransaction` είναι μόνο provider/audit/settlement ledger.
- Η εμπορική προμήθεια MyWorkStation καταγράφεται με rate 1% πάνω στο ποσό Netlink.
- Τα πραγματικά Netlink credentials δεν αποθηκεύονται στο repository. Μόνο environment secrets.

## Ολοκληρωμένα
- Netlink OpenID/OIDC password-grant token client + refresh.
- `/menu` product discovery.
- One-step `execute` client.
- Two-step `prepare` + `execute` client.
- CompanyModule gate `NETLINK_PREPAID`.
- Transaction ledger με requestId/provider transaction/reference/amount/operator/payment/commission.
- Duplicate request protection.
- Execute lock με `NETLINK_ENABLE_EXECUTE`.
- Execute επιτρέπεται μόνο για υπάρχουσα `Sale` με status `COMPLETED`.
- Amount review αν provider amount υπερβεί το συνολικό POS sale.
- Settlement summary ανά εταιρεία/κατάστημα/περίοδο.
- Δυναμικό `StoreNetlinkModal` που διαβάζει product groups και JSON payload schema από το Netlink menu.
- Per-store `NetlinkStoreConfig` για mapping σε ενεργό POS product ώστε VAT/accounting να μην είναι hard-coded στον connector.
- Super Admin module catalog registration ως paid add-on, χωρίς default ενεργοποίηση σε κανένα plan.

## Σε εξέλιξη
1. Store Mode entry point / κουμπί Netlink μόνο όταν το module είναι ενεργό.
2. Mapping UI για επιλογή του POS product ανά κατάστημα.
3. Checkout binding: provider item -> mapped POS product -> normal Sale -> Netlink execute.
4. Staging test με credentials Netlink.
5. E2E tests για tenant isolation, duplicate request και settlement.

## Production safety
Το `NETLINK_ENABLE_EXECUTE` παραμένει `false` μέχρι να ολοκληρωθεί και να περάσει CI/E2E το checkout binding.

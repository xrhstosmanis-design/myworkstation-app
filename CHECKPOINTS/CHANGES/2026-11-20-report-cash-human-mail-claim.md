# 7–9 · Προ-source ανάληψη αναγνώσιμου CASH email

ASSIGNED /root, ίδια ανάληψη αυτόματων αναφορών 7–9. Συνέχεια fix/report-cash-human-mail-20261120 μετά τη ρητή επισήμανση ιδιοκτήτη ότι το ημερήσιο email είναι δυσανάγνωστο. Η προηγούμενη απόδειξη scheduler/ACCEPTED/Message-ID/inbox και bounded duplicate παραμένει αληθής, αλλά δεν πιστοποιεί καλή παρουσίαση.

Ο root διάβασε το πραγματικό παραδομένο email. Το MIME text/plain περιέχει RAW JSON του canonical CASH payload και το θέμα εμφανίζει DAILY/UTC ISO αντί αναγνώσιμης περιόδου. Συγκεκριμένη πηγή: automatic-report-mail-adapter.js χρησιμοποιεί args.payload.body ως cashText fallback όταν δεν υπάρχει reviewedCash. Πραγματικό presentation FAIL, όχι βλάβη μεταφοράς ή encoding χωρίς τεκμήριο. Δεν αλλάζει το ιστορικό παραλαβής και δεν γίνεται επανάληψη ίδιας αποστολής.

Περιορισμένο source scope μόνο μετά το green merge της παρούσας ανάληψης

- Νέος pure CASH email formatter, automatic-report-mail-adapter.js και οι υφιστάμενοι mail-adapter/στοχευμένοι formatter tests. Ο /root/daily κατέχει αυτά τα source/test paths σε ξεχωριστό worktree. Ο /root/reports κατέχει μόνο τεκμηρίωση και δημοσίευση, ο root ανασκόπηση/ιδιωτική προεπισκόπηση.
- Plain ελληνικό κείμενο και αναγνώσιμο θέμα με κατάστημα, ημερομηνία/περίοδο ώρας Ελλάδας και σαφή προσωρινό χαρακτήρα. Αρχικές διαφορές ανά καταγεγραμμένο χειριστή, χωρίς επινόηση φυσικών ποσών, ερμηνειών ή τελικής χρέωσης. Διατήρηση διακριτών περιορισμών POS/EFTPOS/Netlink/χειρογράφων.
- Ίδια immutable payload bytes/fingerprint/proof, ίδιο authorization, lifecycle, grants/consent και send-once driver. Μόνο rendering στο όριο mail, χωρίς αλλαγή cash policy/source, ποσών, χρηματοοικονομικών writers, mail transport ή γενικής υποδομής αποστολής. HTML μόνο αν ήδη υποστηρίζεται κανονικά από τον transport, όχι προϋπόθεση.

Απαιτούνται focused formatter/adapter tests που καλύπτουν πραγματικό μη reviewed CASH shape, ελληνικό subject/date και απουσία raw payload JSON, μαζί με διατήρηση reviewed/supplier/promotion/inventory ροών και send-once συμπεριφοράς. Η ιδιωτική αναπαράσταση του ήδη παραδομένου payload είναι preview, όχι νέα αποστολή ή inbox PASS. Κατάσταση BEFORE SOURCE / NOT TESTED.

Δεν περιλαμβάνονται αλλαγή οικονομικών/stock/shift, διόρθωση ιστορικών στοιχείων, ρυθμίσεις παραληπτών, retry/reset accepted slots, schema/profile ή environment/backup/restore. Τα Draft #4084/#4092 παραμένουν χωριστή τεκμηρίωση με τα όριά τους. Το συνολικό 7–9 παραμένει OPEN.

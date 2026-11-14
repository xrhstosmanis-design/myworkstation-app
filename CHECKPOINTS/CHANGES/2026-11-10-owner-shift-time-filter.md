# OWNER-SHIFT-TIME-FILTER
Owner /root. Implementation branch: feat/owner-shift-time-filter.
Add optional time to From/To in the shift report. On opening, prefill From with the current Europe/Athens time. Blank times and calendar presets retain whole-day bounds. Verify in existing LAB. Source and LAB pending.

14/11/2026: Reapplied identical source from 319dd8e9 onto main 5827d729. Syntax and three local Athens-time tests passed. Hosted Super Admin Cash Audit hour filter passed separately. Owner «Βάρδιες & Διαφορές» acceptance remains pending after CI and release.

14/11/2026 20:35 Ελλάδας · #3872 · Render live f1eaf025, CI #9881 PASS. Hosted LAB PASS στην οθόνη «Βάρδιες & Διαφορές» ως Super Admin. Για 12/11, 00:00–23:59 επέστρεψε 3 βάρδιες, 22:00–23:59 επέστρεψε 1 με έναρξη 22:12. Το άνοιγμα συμπλήρωσε την τρέχουσα ώρα Αθήνας. Η δοκιμή ήταν μόνο ανάγνωση. Εκκρεμεί ανεξάρτητη δοκιμή με λογαριασμό Ιδιοκτήτη.

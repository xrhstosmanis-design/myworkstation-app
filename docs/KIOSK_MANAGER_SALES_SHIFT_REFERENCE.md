# Kiosk Manager — Sales & Shift reference for MyWorkStation

## Source screenshots supplied by user — 08/08/2026

These screenshots are the approved behavioral reference for the MyWorkStation Admin/Backoffice sales dashboard. The goal is familiarity for customers migrating from Kiosk Manager, while keeping MyWorkStation visual styling and adding MyWorkStation extras.

## Main Sales screen

Top navigation concepts to preserve in familiar positions/flow:
- Το Κατάστημα μου
- Παραγγελίες
- Προμηθευτές
- Πελάτες
- Τιμοκατάλογος
- Ταμείο
- Αναφορές
- Χειριστές
- Διαχείριση
- Υποστήριξη

Sales workspace concepts:
- Πωλήσεις
- Εικόνα επιχείρησης
- Ανάλυση πωλήσεων
- Ανάλυση αγορών
- Έξοδα
- Βάρδιες
- Συμβάντα

## Βάρδιες σε εξέλιξη

The active-shifts table should expose at a glance:
- Χειριστής
- Έναρξη βάρδιας
- Διάρκεια
- Μετρητά
- Κάρτες
- IRIS
- επιστροφές (PoS)
- διαγραφές ειδών (PoS)
- Σύνολο βάρδιας
- Πληρωμές
- Συναλλαγές
- Τελ. Πώληση
- Μ.Ο. Πώλησης

Selecting/expanding a shift must reveal sales by subcategory with:
- Περιγραφή
- Ποσότητα
- Τζίρος
- % Τζίρου
- Κέρδος
- Margin

A selected subcategory can expand further to product rows.

The right side can show a visual distribution of sales by subcategory. MyWorkStation may modernize the chart but must preserve the same information hierarchy.

## Shift transactions drill-down

The magnifier / detail action next to a shift opens a dedicated Shift Transactions view/modal. This behavior is REQUIRED.

Header:
- Συναλλαγές Βάρδιας #<id>
- ημερομηνία/ώρα έναρξης
- χειριστής / ταμείο

Tabs/views:
- Ημερολόγιο κινήσεων
- Ανάλυση ανά κατηγορία
- Ανάλυση ανά Τμήμα ΦΠΑ
- Συγκεντρωτικά
- Ανάλυση χρηματικού

Transaction grid includes at minimum:
- Κωδικός
- Ημερομηνία
- Επωνυμία / Κατηγορία εξόδου where applicable
- Περιγραφή συναλλαγής
- Κέρδος
- Τζίρος πώλησης
- Πίστωση
- Μετρητά
- electronic/card/IRIS payment columns when available

Footer totals are always visible. Export/print actions should include PDF and Excel where supported.

## MyWorkStation implementation rule

Do not clone obsolete desktop chrome pixel-for-pixel. Preserve the user's learned workflow, terminology, drill-down order, tables, totals, and information density, while rendering them in the current MyWorkStation design system.

MyWorkStation extras (cloud, Super Admin, remote multi-store management, audit, automation, AI/OCR modules, connector status) are additive and must not displace the familiar daily workflow.

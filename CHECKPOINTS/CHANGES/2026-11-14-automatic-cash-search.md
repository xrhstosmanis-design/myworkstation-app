# 2026-11-14 — Automatic cash search

Owner-requested local candidate for the central Automatic Cash Control panel. Select one, several or all stores, then set the date and time filters. Search, print and shortage export use Athens shift opening dates and complete closed shift sessions. Existing API callers default to closing dates. The established email preview uses closing dates and is prevented from proceeding when its sessions differ from the on-screen selection.

## LAB verification — 15 November 2026

CI passed on source revision `2e7ba6a`, including the isolated PostgreSQL overnight shortage export test. PR #3875 was merged as `96ebab315` and Render deploy `dep-dbsdbroae00c73eq5sv0` became live.

In Platform Admin, the published search displayed the store picker above the date and time filters. With only ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ selected, the 12 November search displayed the existing LAB POS 2 shift 22:12–08:57 under its Athens opening date. The same search for 13 November returned zero shifts. The overnight shift appeared once, on its opening day. No test data was written to Διαδόχου Παύλου.

PASS applies to the LAB screen check for this shift. The prior PostgreSQL CI covers multi-store shortage export. Existing cash audit ownership and status are preserved.

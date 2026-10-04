# Workforce AUTO OUT 12h safety — 05/10/2026

USER rule: any Workforce attendance left OPEN without OUT must automatically close at exactly IN + 12 hours and must be flagged for owner/Super Admin review, not silently accepted as normal time.

Implementation: server worker runs once on service startup and every 5 minutes. It selects only OPEN sessions older than 12h, row-locks each candidate, creates an OUT WorkforceTimeClockEntry at exactly startedAt + 12h with method AUTO_OUT_12H, closes the session at 720 minutes with NEEDS_APPROVAL, adds issue AUTO_OUT_12H, and writes WORKFORCE_AUTO_OUT_12H audit. Existing correction/approval/payroll review flows remain authoritative. Idempotency comes from row lock + OPEN recheck.

Known LIVE evidence before change: LAB POS 2 has an OPEN POS_SHIFT attendance from 27/09/2026. No manual mutation was performed. After deployment, startup worker is expected to convert any qualifying stale OPEN sessions (including that one if still OPEN) into NEEDS_APPROVAL at their original IN+12h. This is not an approval and must remain visible for review/correction.

Status: IMPLEMENTED / AWAITING CI + DEPLOY + LIVE READ-ONLY VERIFICATION.

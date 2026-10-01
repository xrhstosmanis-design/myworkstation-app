# Workforce mobile PIN numeric validation fix — 01/10/2026

USER production phone retest on exact deployed mobile 401 handling still showed «Ελέγξτε τα στοιχεία εισόδου.» for LAB POS 2. That message is emitted only for Zod validation errors. Code inspection found the mobile-only schema used `/^\\\\d{4,8}$/` in source while normal POS PIN uses `/^\\d{4,8}$/`. The mobile expression therefore rejected ordinary numeric PINs before bcrypt comparison.

Fix: mobile-pin now uses the same 4–8 numeric digit validation as normal POS PIN. No PIN/hash mutation, no auth scope change, no POS session change.

Status: ROOT CAUSE CONFIRMED / FIX IMPLEMENTED / AWAITING CI + DEPLOY + USER RETEST.

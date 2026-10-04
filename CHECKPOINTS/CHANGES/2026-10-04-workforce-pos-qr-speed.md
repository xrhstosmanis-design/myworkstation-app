# Workforce POS QR scan speed optimization — 04/10/2026

Physical USER acceptance after camera preview fix: camera modal/video PASS, QR decode PASS, card login PASS and LAB POS 2 entered POS successfully. User measured approximately 20 seconds for QR recognition, too slow for daily operation.

Optimization is camera-only: ZXing is constrained to QR_CODE, scan interval reduced, 1280x720 preferred capture, continuous focus requested when the browser/camera supports it, and a visible square targeting frame guides phone placement. Existing decoded value is still submitted through the already physically-passed /api/operators/login/card flow. No auth/card/attendance/POS transaction/fiscal behavior changed.

Status: CAMERA PREVIEW + QR + CARD LOGIN PHYSICAL PASS / SPEED OPTIMIZATION IMPLEMENTED / AWAITING CI + DEPLOY + TIMED USER RETEST. Target practical read: approximately 1–3 seconds under clear framing; no PASS claimed until measured.

# Workforce POS camera QR scanner — 02/10/2026

USER physical checkpoint: employee mobile card now displays LAB POS 2 QR successfully. On Store Mode terminal, selecting «Κάρτα» only exposes the existing text field intended for hardware/USB scanner; it does not open a camera.

Implementation: reuse existing @zxing/browser dependency. Card login keeps the existing USB/barcode input and adds explicit «Σάρωση QR με κάμερα». Camera opens in a modal, decodes QR, stops immediately after a successful read, and submits the same existing /api/operators/login/card flow. Camera is also stopped on close/unmount. Permission/unavailable-camera errors are shown without changing POS/card backend semantics.

Status: IMPLEMENTED / AWAITING CI + DEPLOY + PHYSICAL CAMERA/QR USER TEST. No attendance/POS transaction/stock/payment/fiscal mutation in this change.

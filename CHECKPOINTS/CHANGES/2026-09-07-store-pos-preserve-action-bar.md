# Preserve full KAT action bar

Date: 2026-09-07

## Live comparison

The LAB Store POS omitted lower action buttons because client-side permission CSS hid Return, Payments, Card and Cash controls. KAT shows the complete action bar.

## Correction

The action bar is structural and remains fully visible across terminals. Authorization stays on the server when an action is requested; permissions no longer alter the KAT POS geometry or remove controls from sight.

## Gate

CI, Render deployment and LAB-POS-01 comparison before beginning shift or payment tests.

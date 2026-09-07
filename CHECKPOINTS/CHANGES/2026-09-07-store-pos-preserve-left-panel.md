# Preserve KAT left quick-key panel

Date: 2026-09-07

## Live LAB diagnosis

LAB-POS-01 showed the sale panel at left and keypad in the centre because `applyPosPermissionStyle` hid `.standard-quick` when `leftKeys` was false. CSS grid then auto-placed the remaining panels into earlier columns.

## Correction

Quick keys are a fixed part of the KAT reference geometry. The `leftKeys` access value can govern editing behaviour, but it must never hide the panel. Every terminal now preserves left quick keys, centre sale panel, and right keypad.

## Gate

CI, Render and LAB-POS-01 visual screenshot comparison before opening count or sale testing.

# CENTRAL-BACKOFFICE-ACCESS-01 — Independent delegated shift closure

Retain the central access owner. Source review confirms the terminal selector and the close form are tied to sales.read; the terminal endpoint also requires sales.read. LAB NOT TESTED.

Next: enable the minimal selected-store terminal and close workflow for shifts.close without granting access to sales history. Preserve session, store, terminal, licensing, lifecycle, PIN, EFTPOS and fiscal checks. Verify explicit close-only grant, missing grant, other-store denial and legacy sales access in isolated tests before hosted LAB acceptance. No production shift will be closed for verification.
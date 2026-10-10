# DAILY BITE coffee ↔ KAT behavior preview — 10/10/2026

Owner `codex/daily-bite-coffee-kat-behavior-20261010`, issue #2054.

This bounded source step is **read-only**. It adds a Super Admin preview that:
- accepts only a DAILY BITE company;
- resolves the active KAT company/store as behavior reference;
- reads KAT beverage products with `MWS-KAT-BEV-%`;
- reads DAILY BITE active products only from the selected company;
- computes controlled coffee-family signatures and pairs only unique 1:1 signatures;
- proposes KAT product names only when a unique pair exists;
- reports unresolved and ambiguous products instead of guessing;
- reads KAT modifier descriptions/prices and current DAILY modifier-group summary;
- performs no INSERT/UPDATE/DELETE and no POS publication.

No recipe, ingredient, stock-consumption, KAT ID copy, product rename or modifier write is included. Existing DAILY BITE 9 departments / 8,753 products stay untouched. CI is required before merge; LAB/LIVE remains NOT TESTED.

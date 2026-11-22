# Inventory product creation events

Code commit `85217c454d5c8a2d9b3062c330c136f6e011a04f`.

Local checks passed for JavaScript syntax, bound store and date query parameters, and mapping historical records with missing product metadata. PostgreSQL and browser LAB acceptance are pending.

In the existing LAB, compare creation events with the inventory audit. Verify Athens date boundaries, store and actor filters, and that counting existing items does not produce a creation event. Then verify the historical Rizareio count for 9 and 10 November 2026 after release.

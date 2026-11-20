# No5 — installation candidate integration

Continue Draft PR #4007 from 33f1a15f and integrate main 868feb5d. Preserve monthly invoice inspection for authorized administration and separately granted monthly audit summary access. Keep existing expected-receipt grants, dedicated order-suggestion reads and delegated sales cost-completeness metadata alongside reversal costing.

Reviewed the bound purchase-order route and refreshed its digest in the inactive COMPANY compatibility packet. No deployment, live account change or final LAB acceptance is implied. One shared LAB session remains after exact candidate CI and guarded deployment.

CI 44496070099 exposed a duplicate sales drilldown SQL alias, an incomplete supplier fixture and a stale order suggestions capability expectation. Corrected all three. Targeted local suite passed 11 with one native case skipped. Full PostgreSQL CI remains required.

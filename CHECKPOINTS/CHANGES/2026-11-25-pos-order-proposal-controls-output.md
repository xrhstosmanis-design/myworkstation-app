# POS order proposal — filters, email and print

25/11/2026 · ASSIGNED /root · feat/pos-order-proposal-controls-output-20261125 · SOURCE NOT STARTED. Same4193owner; user explicitly requests one combined package and one grouped LAB session.

Scope: supplier selection for current store, editable coverage and sales datesFrom/To (Greek calendar inclusive); visible delivery days; fresh calculation and stale-filter invalidation. Reuse existing demand/minimum/pending semantics with an additive explicit calendar period, preserving legacy/default APIs and No21 supplier grouping ownership. Suppliers/products must have same-company/store purchase evidence; no invented primary assignment.

Shared snapshot presentation for screen/email/print; explicit recipients (supplier email prefill editable), audit and duplicate-attempt protection, current grant recheck, no real email during tests. No new PurchaseOrder/stock/fiscal writes, no schema or automatic SMTP retries. Printing uses normal browser print, no forced physical printing. Existing SMTP infrastructure and AuthAudit only. Templates escape untrusted names. No new recipient approval flow.

Read-only POS source alreadyLIVE; weeklyalarm4194remainsBLOCKEDNo7/No14admission and not automatically enabled by this change. Existing screenshots prove interface filter/output gaps, not weeklyalarmPASS. Bounded tests must cover calendar/DST/bounds, supplier/store/company isolation, actual UI filter changes, output agreement and SMTP failure/duplicate/revocation without external delivery; fullCI and installed exactrevision before commonLAB. Prior owners/manual/PASS untouched. Publish this claim before source.

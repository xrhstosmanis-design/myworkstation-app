# POS-MYDATA-QR-LEARNING-01 — 2026-11-11

Scope: reuse the existing POS QR invoice workflow, without changing payment, stock, posting or historical invoice rows.

Read-only diagnosis (production, 11/11): 239 myDATA-linked invoices in four stores carry the same official AADE QR URL form in their original XML. Diadoxou has linked drafts that can be missing products or supplier references; those are separate open issues. No invoice, supplier, payment, or catalog rows were changed during the diagnosis.

This PR:
- On successful existing provider QR read, learn verified supplier VAT, supported provider format and available verified display name in a company-wide, not store-specific, record. Do not store QR tokens, MARK, raw XML or invoice amounts in the learned record.
- A new scanned official AADE verification QR is matched exactly to an inbound XML document **only in the authenticated company and selected store**. The existing verified original PDF and same inbox identity are returned; never infer a different store's document.
- Use the issuer name from original XML when supplier catalog linking is missing. If a verified provider omits the name, allow display-only fallback from the learned profile for that VAT and provider format.
- Reject untrusted hosts and unsupported QR formats; the learned profile never grants network access or skips verification.

Validation: focused regression tests committed. Full exact-head CI pending; hosted LAB, real physical scanner, two different sequential invoices from the same supplier, and before/after one-payment evidence NOT TESTED. No functional PASS or deployment claimed. The existing POS payment flow must remain unchanged.

Follow-up beyond this bounded QR source: fill/flag incomplete myDATA draft lines, link or create verified supplier entries, and exercise the first real QR-invoice payment safely in the existing LAB.

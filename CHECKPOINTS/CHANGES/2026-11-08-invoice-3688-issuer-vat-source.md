# #3688 — Conflicting issuer identity from FAST invoice photos

2026-11-08 Europe/Athens · /root · pre-source claim #3748 merged at `eecaa212aa60c07196034789aeaab0c3eaa4f5af`.

Use all already-read image headers to detect different supplier IDs or normalized nine-digit VATs, including disagreements with the catalog VAT for an OCR-supplied ID. Clear the automatic selection and suppress new-supplier suggestions while evidence conflicts. Preserve explicit operator selections. Keep the original single-image and PDF matching path.

Four focused local tests passed, including both orders, partial headers, equivalent VAT formatting and ID/VAT disagreement. Full CI and fresh no-submit LAB acceptance are pending. A consistent OCR VAT still needs comparison with the original. Real photos and physical POS remain open.

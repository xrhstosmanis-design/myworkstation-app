# POS OCR — adjacent row replay guard

- LAB invoice `43243` (one page, credit) completed with 32 rows although the 16 physical rows were each inserted twice.
- The AI recheck now collapses a complete adjacent row replay only when every pair has the same code, description and economics and one copy is strongly corroborated by the printed invoice total.
- Legitimate repeated product rows remain untouched when the full table reconciles with the printed total.
- Payment mode remains credit; no payment, stock, approval, invoicing or finalization behavior changed.
- Regression covers both the duplicated extraction and the legitimate-repeat safeguard.


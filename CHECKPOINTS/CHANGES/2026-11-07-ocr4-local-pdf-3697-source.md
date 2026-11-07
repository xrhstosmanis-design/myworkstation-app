# OCR4-LOCAL-PDF-3697 — Source validation

Owner: central coordinator `/root`. Issue #3697. Assignment #3704 merged before source. Source PR #3706, commit `4e4ce0c`.

Local OCR now reads physical PDF pages in sequence, keeps the original upload, and releases PDF and OCR resources. A page error aborts the read. Scope covers the mounted AiReaderPanel and the two legacy helpers. FAST page counting remains separate.

Local verification: five focused tests passed. Isolated Chromium with real PDF.js and Tesseract.js and a mocked API returned text from each page of one- and three-page synthetic scanned PDFs in order, preserved the original bytes, and showed a visible error with zero POSTs for a malformed PDF. OCR misread one digit. Hosted LAB, independent review and green source CI remain pending.

The first source CI run (42401602595) stopped at the required active-list and checkpoint gate. This documentation update accompanies the source PR.

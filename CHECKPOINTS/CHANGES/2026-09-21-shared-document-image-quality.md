# Shared document image quality — AWAITING CI / LAB

## Evidence before change

- **LAB observation:** invoice and payment screens already accept camera images, local images and PDFs. The supplied real invoice photo is readable but has background, uneven illumination and perspective/skew.
- **Current status:** `LAB FAIL` for automatic cleanup/blur prevention because the existing shared flows only performed basic size checks/compression.
- Existing payment, credit, duplicate prevention, invoice handoff, draft, stock, fiscal, accounting and myDATA behavior must remain unchanged.

## Bounded change

- Added one client-side document-image pipeline for local files and camera captures.
- Image-only processing: resolution gate, Laplacian sharpness check, conservative paper crop, small-angle deskew, shadow normalization, grayscale contrast enhancement and OCR-safe JPEG output up to 3000 px.
- Blurry/low-resolution images fail before upload with an explicit Greek message.
- PDFs pass through byte-for-byte without raster conversion.
- Connected the shared pipeline to Premium/Fast new invoices, open-invoice payment proof, other-expense proof and bank-deposit proof.
- No API, database, settlement, idempotency, stock or finalization behavior changed.

## Verification

- Client production build: PASS.
- Structural regression tests cover the shared pipeline and all connected payment/invoice entry points.
- Functional state remains **AWAITING CI / LAB**. CI PASS is not LAB PASS.

## Required LAB acceptance

1. Upload the supplied angled invoice from PC and confirm the selected file becomes `*-clean.jpg`, then verify Azure OCR receives one cleaned page and the existing economic reconciliation remains authoritative.
2. Take one sharp camera photo and confirm it is accepted and cleaned.
3. Take one intentionally blurred photo and confirm upload is blocked before Azure/API submission.
4. Upload a PDF and confirm it remains a PDF and follows the existing flow.
5. Repeat once for open-invoice proof and other expense; verify no duplicate payment, draft, stock or fiscal action.

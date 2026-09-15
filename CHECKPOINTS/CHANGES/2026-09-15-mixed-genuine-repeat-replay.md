# Mixed genuine repeat inside OCR replay

Date: 2026-09-15
Reference: AA0011467

When OCR returns every physical row twice but the invoice legitimately contains one repeated charge, collapse all artificial pairs and preserve the unique pair whose gross amount closes the printed invoice total. Expected result is seven rows: FR1500 twice and all other products once. No payment or stock mutation.

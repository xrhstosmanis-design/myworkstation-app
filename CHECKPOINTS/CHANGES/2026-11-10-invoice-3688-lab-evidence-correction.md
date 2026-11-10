# #3688 — Correction to multi-photo OCR evidence

The cropped real-photo trials in #3773 and the real-photo replay in #3779 used pages from different documents. Exclude those trials from accuracy and timing acceptance for a single multipage invoice. The synthetic checks in #3779 remain valid for the payable safeguard.

For the repeat, verify that every page belongs to the same document and that the printed page sequence is complete. Compare all four header fields with the source and measure time until the result appears. Accuracy and speed on correctly paired real photos and validation on a physical POS remain open.

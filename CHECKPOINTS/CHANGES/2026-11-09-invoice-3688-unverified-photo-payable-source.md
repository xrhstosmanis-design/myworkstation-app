# #3688 — Lone unverified payable from multiple photos

2026-11-09 Europe/Athens · /root · pre-source claim #3776 merged at `d99c1f9ba25d11997f4a8dc78d2604352660b94e`.

When several photos are attached and only one page produces a positive unverified amount, the FAST form requests review and withholds automatic amount entry. This includes a single successful header request among multiple images. Verified amounts, repeated matching candidates, manual amounts, the existing Stefanidis rule and single-image/PDF paths retain their prior handling. No extra provider calls.

Seven targeted tests passed. Full CI and hosted acceptance pending. This safeguard does not recover unread fields from the real images or prove a lone OCR amount in other input paths.

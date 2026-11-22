# #3688 — Lone unverified payable in multipage photo OCR

2026-11-09 Europe/Athens · INVOICE-HEADER-LATENCY · /root · branch `docs/invoice-3688-unverified-photo-payable-claim`.

Real-photo retest #3773 recorded an incorrect positive payable with other header fields missing or under review. The source currently accepts a single positive amount in a multi-image merge even if no page response verifies it. Provider responses for the real sample were not captured, so the exact origin of the observed amount is not established.

Scope: in the multi-image FAST path, a lone positive amount without the existing balanced payable evidence requires operator review and is not automatically populated. Preserve a uniquely verified amount, repeated matching positive candidates and explicit manual amount entry. Apply the check to earlier and newly attached photos. Preserve the existing Stefanidis exception, single-image/PDF behavior, provider call count, and business-write boundaries.

Test both orders, one successful response among multiple images, repeated matching values, verified amount, and legacy paths. After full CI and guarded deploy, retest fresh LAB samples without submission. Correct extraction of every field on real photos, PDF evidence, and physical POS remain open.

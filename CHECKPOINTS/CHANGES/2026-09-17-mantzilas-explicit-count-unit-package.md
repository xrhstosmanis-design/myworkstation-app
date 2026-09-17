# MANTZILAS explicit count-bearing package unit — 2026-09-17

## LAB evidence

- Status: **LAB FAIL**.
- Fresh POS-front MANTZILAS invoice `12674`, supplier code `01880`, LIPTON peach tea 500 ml.
- The physical row is a `12 TMX` package. The draft currently exposes `1 piece x 9.37 EUR`, net `9.37 EUR`, VAT 13%, gross `10.59 EUR`.
- Correct stock presentation is `12 pieces x 0.780833 EUR`, while the invoice economics remain one package at `9.37 EUR` net and `10.59 EUR` gross.

## Bounded causal change

- Read an explicit count-bearing piece unit from the current physical row, such as `12TMX`, as the package multiplier only when the invoice quantity and package price are valid.
- Preserve the current invoice quantity and package price fields used for invoice arithmetic; expose only the deterministic stock conversion (`1 package x 12 pieces`).
- Do not infer this conversion from `500 ml`, supplier history or unrelated descriptions.

## Protected behavior

- Preserve the verified MANTZILAS `00009` and `02410` normalizations and all other existing package rules.
- Preserve invoice net, excise, taxable, VAT and gross values.
- No payment/credit, duplicate draft, approval, finalization, stock posting, fiscal or accounting mutation.

## Required verification

- Unit regression for the `01880 / 12TMX` row and negative controls for ordinary `TMX/TEM` piece rows and size-only text.
- Full server suite, client and server builds, green CI, merge and exact production revision.
- Fresh single-submission POS-front LAB; no BackOffice refresh counts as acceptance.

## Local verification

- Focused invoice/POS and authentication regressions: **124/124 PASS**.
- Full server suite: **1301/1301 PASS** after a clean repeat; client production build and server/Prisma build: **PASS**.
- `git diff --check`: **PASS**.

Status: **LAB FAIL / local implementation verified; awaiting CI, merge, exact deploy and fresh POS-front LAB**.

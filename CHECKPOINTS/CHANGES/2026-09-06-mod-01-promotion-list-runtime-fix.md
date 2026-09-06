# MOD-01 checkpoint — promotion list runtime fix

Date: 2026-09-06
PR: #555

- Reproduced from live screenshot: Promotion Center showed `I is not defined` and existing promotions count `0`.
- Root cause: `load()` called `setPromotionList(l.items||[])` without loading `l`.
- Fix: load catalog products, store targets, and `/api/price-catalog/promotions/scoped` together.
- Safety: read-only listing only; no POS, stock, price, payment, or transaction mutation.
- CI #1498: failed only at mandatory active-list/checkpoint verification because the checkpoint update was initially missing.
- Follow-up: rerun CI, merge after green, then user retests the Platform Promotion Center after deployment.
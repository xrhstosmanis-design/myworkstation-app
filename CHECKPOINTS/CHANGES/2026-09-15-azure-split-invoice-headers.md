# Azure split invoice headers — 2026-09-15

## Scope

Recover invoice columns when Azure sends printed headers over two rows.

## Behaviour

- Header labels are combined across the header band before mapping quantity, description and unit cost.
- Reading remains non-mutating.

## Validation

- CI rerun after active list and checkpoint update.

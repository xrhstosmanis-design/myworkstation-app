# MyWorkStation — Permanent Persistence Policy

Date: 2026-08-12

## Mandatory architecture rule

All business-critical MyWorkStation data and configuration must be persisted on the server/database. Browser-only state must never be the authoritative source for products, prices, categories, POS layouts, offers, gifts, store mappings, users, shifts, cash-control data, modules, store settings, or Super Admin configuration.

## POS Designer

- Platform draft is persisted in `PlatformPosDraft`.
- Published store layout is persisted in `StorePosLayout`.
- Draft and publish are separate operations.
- A POS quick button may represent either:
  - one product, or
  - one category containing multiple products.
- New design work should support an empty starting POS (quick/category assignments cleared by Super Admin) and explicit publication to selected stores.

## Persistence behavior

A saved change must survive:

- browser refresh,
- logout/login,
- browser restart,
- use from another computer,
- navigation to another page,
- application restart,
- Render deploy/redeploy.

## Audit rule

For every MyWorkStation module, verify that editable critical data has a server write endpoint and a database-backed read path. Temporary React state is allowed only while editing; it must not be treated as saved until the user invokes the relevant save/confirm action.

## Current audit checkpoint

Repository search on 2026-08-12 found no direct `localStorage` or `sessionStorage` references. This does not by itself prove every module is persistent; each module must still be checked for server/database write paths as development continues.

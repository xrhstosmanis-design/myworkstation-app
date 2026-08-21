# Advanced Online Product Search

Module key: `ADVANCED_ONLINE_PRODUCT_SEARCH`

Search order in Store POS:
1. Store product catalog
2. Master Catalog
3. OpenFoodFacts
4. Advanced Google search provider (only when the module is active)

The advanced provider is never allowed to write a product automatically. It returns a suggestion only. The operator must confirm description, category, VAT, prices and opening stock before `online-product-create` creates the Product, ProductBarcode, StoreProduct and optional opening StockMovement.

## Provider configuration

Preferred provider:

- `SERPER_API_KEY` — server-side key for Google results through Serper.

Optional existing Google Programmable Search configuration:

- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_CX`

Provider order is Serper first, then Google CSE.

## Quotas

- `ADVANCED_ONLINE_SEARCH_DAILY_LIMIT` — default `150` searches per store/day.
- `ADVANCED_ONLINE_SEARCH_MONTHLY_LIMIT` — default `1500` searches per company/month.
- `SERPER_ESTIMATED_COST_PER_QUERY_USD` — optional accounting estimate, default `0`.
- `GOOGLE_CSE_ESTIMATED_COST_PER_QUERY_USD` — optional accounting estimate, default `0.005`.

Every provider call is logged in `AdvancedOnlineSearchUsage` with company, store, query, provider, status, duration and estimated cost.

## Safety / matching

Google results are accepted only when the exact barcode is present in the result title, snippet or result URL. Google/OpenFoodFacts categories are not written automatically into BackOffice categories. VAT and prices are never trusted from general web search.

## KAT pilot

The KAT PILOT company is automatically entitled to this module through the existing KAT pilot entitlement bootstrap. Normal customer companies still require an explicit CompanyModule entitlement.

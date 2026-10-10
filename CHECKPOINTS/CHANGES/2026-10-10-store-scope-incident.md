# Store overview 404 incident — read-only investigation

## Scope and ownership

10 October 2026, owner instructed this monitoring conversation to investigate the repeated Store Transactions / Cloud Store Connector failures. Diagnostic branch: `codex/store-scope-incident-20261010`. No application, authorization, database, configuration or deployment change. Existing N51 (`codex/n51-owner-page-acceptance-20261010`), N40, fiscal/installer and every other assignment remains unchanged. This does not claim or transfer their source scope.

## Observed production evidence

- Explicit Render workspace `tea-d9ie26vaqgkc739uudqg`, production service `srv-d9isenfavr4c73bdh52g`; read-only app logs in `2026-10-10T15:05:00Z`–`15:06:00Z`, limit 50.
- Repeated Store Transactions stack: `ownedStore`, runtime `store-transactions.js:231`, caller `:849`, wrapper `:169`; explicit status **404**.
- Repeated Cloud Store Connector stack: `fail` at `cloud-v1.js:130`, `ownedStore:148`, caller `:399`, wrapper `:121`; explicit status **404**.
- These specific denials are not proof of HTTP500, a crash, a disabled Diadoxou store or financial corruption. Other HTTP500 observations must be investigated separately.
- Existing N40 trace reads in the same minute show the target LAB company/store overview with status200. These are separate requests, not attributable identities for the failed404 requests. No inference of a cross-tenant data leak.
- Earlier Diadoxou scope query confirmed the exact expected company and active store. Failed requests do not expose their actual company/store IDs in the available logs, so attribution to Diadoxou remains NOT TESTED.

## Source reproduction and limits

Source inspected at main `ee04faf6b9bbc985dc091571b7d7c706d235cf19` (shallow clone). Both `ownedStore` helpers require exact storeId/companyId/active:true and correctly reject a mismatch with404. No proposal to weaken these checks.

`StoreCloudPage` continuously requests transaction overview every2000ms and cloud overview every5000ms, including after an error. The transaction catch is empty; the cloud catch sets offline/loading state. Its storage listener handles only `myworkstation:store-sync`, not a changed login/support token. These repeated read attempts explain log amplification, not the identity of the bad scope.

`client/src/main.jsx` obtains its token from shared localStorage on each request. Platform support entry writes a replacement token and supportContext to localStorage; an already mounted older tab retains its selected store. A dependency-free VM harness evaluated the actual API function with stub storage/fetch: first storeA request used synthetic companyA credential; after replacing storage with synthetic companyB credential, the identical storeA request used companyB credential. Assertions passed. No real credential, network, business record or authentication mutation was used.

This establishes a reproducible **candidate mechanism** for stale cross-tab store/company requests. It is local synthetic evidence, not LIVE/LAB causal acceptance of the current incident. Single-tab token replacement and stale selection also require inspection; do not assert that another specific agent/browser caused the incident.

Browser inventory contained only about:blank and Render compute; no accessible MyWorkStation tab/session existed for direct observation. No credentials extracted, new login initiated or user's tabs closed.

## Next action / handoff

One attributable read-only browser observation: inspect an affected existing Backoffice tab's visible selected company/store, close or return from stale store views through normal UI, then reopen the intended company/store through canonical Platform Admin entry `https://myworkstation-app.onrender.com/platform-admin`. Correlate overview responses and bounded Render error samples before/after. Do not repeat sales, payment, shift or fiscal actions. Without an accessible affected tab, exact causal attribution remains blocked.

After attribution, the existing source owner must review a bounded context-change invalidation/polling-stop fix with cross-tab and stale-response regression coverage, preserving healthy live sync and writer status. No independent parallel patch to assigned StoreCloudPage/N51, no shared-token snapshot that silently bypasses session revocation, no widening of tenant authorization. Incident remains OPEN / NOT FIXED; no manual or numbered PASS closure.

## Monitoring correction

The17:27 statement that active-store errors did not recur was wrong. Greek text/combined pipe search returned no rows while English prefix filters found real errors. Use separate explicit English prefixes (`Store Transactions`, `Cloud Store Connector`) and individual critical terms, retain explicit time windows and limit50. At17:52,50 relevant records were observed in about22seconds with hasMore:true, after the latest deploy. No error total beyond the bounded sample is claimed.

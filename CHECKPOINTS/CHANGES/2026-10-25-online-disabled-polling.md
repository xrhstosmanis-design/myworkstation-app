# Online ordering disabled-module polling — 2026-10-25

- Branch: `fix/online-disabled-polling-20261025`
- Draft PR: #3127
- Scope: `client/src/components/store/StoreOnlineOrders.jsx`
- Confirmed: 7-second client polling repeatedly requests disabled ONLINE_ORDERING, generating HTTP 403 and error logs.
- Change: suspend automatic polling on the explicit disabled-module 403 response; allow operator-triggered retry and reset on store change.
- Safety: backend 403 access control retained; no changes to payments, orders, inventory, or production configuration.
- Status: awaiting CI and isolated verification; not merged or deployed.
- Acceptance: verify no repeated disabled-module requests, enabled stores continue receiving orders, and CI succeeds before any production rollout.

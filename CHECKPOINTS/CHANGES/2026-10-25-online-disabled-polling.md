# Online ordering disabled-module polling — 2026-10-25

- Branch: `fix/online-disabled-polling-20261025`; PR #3127.
- Scope: `client/src/components/store/StoreOnlineOrders.jsx` only.
- Existing candidate suspends automatic 7-second polling after the explicit disabled ONLINE_ORDERING 403, with launcher retry and store-change reset. Server authorization retained; no financial/order/stock mutation.
- User authorized continued daily-check work in this conversation. Reconciliation preserves latest main source and all shared records/owners; existing runtime blob unchanged.
- Previous head `1d57879ea103ba8d94eb9cdce0e320f3ed61e8f1`: CI 40200907030 all five jobs SUCCESS. This is CI evidence, not online-polling LAB PASS.
- Current status: OPEN / AWAITING LAB, not merged or deployed. Fresh combined-head CI required after reconciliation.
- Required acceptance: actual mounted disabled-store polling stops; enabled stores still refresh; explicit retry, store switch, delayed old-store replies and unmount remain correct. Hosted acceptance NOT TESTED.
- Next: publish bounded ownership/acceptance record before further source changes; inspect candidate against mounted acceptance. No payment, receipt, inventory, order-status, configuration or production action during diagnosis.

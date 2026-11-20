# No5 — preserve peer warehouse filters and delegated authority

Integrates main699208512dc6f554a17e8d2bce117f225b634ddd, peer4029 warehouse VAT/Margin filters plus No2 documentation claims. Its archive conflict prevented the PR merge preview and therefore the new19dd436 CI did not start; an empty run list is not a test failure or success.

Resolution retains the peer's existing Owner/POS filter button, expanded layout and same-store filter GET. It retains No5 delegated archive/stock movement read and alert semantics. VAT/margin controls remain available for native Owner/POS and remain absent for the delegated read-only adapter, which does not grant these query parameters. The opening/closing conditional JSX was reviewed explicitly rather than accepting the automatic merge's removed opening fragment.

Mounted actual archive comparison: Owner and POS both render VAT/Margin and submit scoped marginMin=10 for the same selected store; delegated read-only exposes neither unsupported filter.1/1PASS. Production client build22.13sPASS. All45 bound Company source bytes remain unchanged. Current actual native installation proof is still required after the earlier canonical Supplier fixture correction. No production deploy, install, credentials or human action.

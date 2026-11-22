# 08/11/2026 20:51:53 Europe/Athens — Cash audit personal test recipient

Before-source claim at `b2b3f178d89640dd7f4f85c5436f3dd328606d79`, branch `docs/cash-test-recipient-20261108`.

Retained owner `codex/cash-chat-reconciliation-20261026` with /root coordination. Scope is a separate, server-configured test recipient bound to the authorized Super Admin account, with the same resolved address shown in the personal preview and checked again before send. Keep current fallback to the account address when no separate address is configured. Preserve owner recipients, authentication, SMTP, store/day authorization and report freshness guards.

Production personal preview on 08/11 showed the login address for the 06/11 report; the owner requested a different exact personal recipient. The preview was cancelled. Private addresses are omitted. Existing full-preview/Cancel PASS (#3712) remains scoped; delivery and new behavior are NOT TESTED.

Acceptance: check authorized account binding, default fallback, rejected stale recipient and preserved owner routing with fake transport. After normal release and LAB acceptance, verify the exact recipient before a single approved native test and record provider acceptance separately from inbox receipt.

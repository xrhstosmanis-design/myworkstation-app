# 08/11/2026 — Cash audit owner email layout candidate

CASH-UNIFIED-AUDIT-15, existing cash owner retained. Scope claim #3744 merged as 8d9e593cdc18476125858337c5328054425cb4e4.

The existing checked report renders an HTML summary with separate cash and POS–EFTPOS tables per shift, full detailed evidence, unchecked handwritten items with reasons and a reply request for open items. The API preview uses the same HTML renderer as delivery. The sandboxed preview retains a plain-text option. The original plain-text transport, fingerprint, recipients, financial logic and send-readiness rules are preserved. The card table displays the recorded difference because the canonical email rows do not expose separately verified source totals.

55 local targeted tests passed, including preview/delivery parity with fake transport, complete long-text fallback, escaping, incomplete paper evidence and delivery guards. Hosted preview, controlled delivery with this layout, financial closure and full CI remain pending. No real report was transmitted in this change.

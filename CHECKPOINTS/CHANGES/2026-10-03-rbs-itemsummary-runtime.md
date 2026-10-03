# RBS checkout itemSummary runtime blocker

Date: 2026-10-03

After regclass cleanup was LIVE and production logs were clean, controlled 7UP 330ML €1.20 cash checkout failed before Writer claim. Render logged ReferenceError: Cannot access 'itemSummary' before initialization at store-pos.js. The RBS pending-request checkout snapshot is corrected to persist a copy of the resolved item summary and final summary totals. Writer/CAPDriver/AURORA/VAT/payment mappings unchanged. Physical retest blocked until green CI, exact deploy and clean logs.

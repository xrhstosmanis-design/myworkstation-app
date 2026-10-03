# KAT RBS — remaining online reconciliation regclass

Date: 2026-10-03

Exact production revision 88def886 was LIVE and Writer ONLINE. A separately controlled 7UP 330ML €1.20 cash attempt again returned internal error; no receipt, no rbs command in C:\\capture. Render logs at the attempt showed repeated Online shift reconciliation failed / Prisma regclass deserialization. Source inspection identified the OnlineOrder existence probe in server/src/patch-store-transactions-online-reconcile.js. It is now cast to TEXT. Do not retest physically until green CI and exact production deploy.

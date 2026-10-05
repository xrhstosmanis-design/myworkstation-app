# POS shift-open fail-closed gate — 05/10/2026

USER physical observation: after LAB POS 2 operator login, sales screen appeared directly although a new operator must first complete opening cash values. Existing StoreOperatorApp already contains the correct mandatory shift-opening form (drawer, custody, coins, safe, declaration) and backend open endpoint, but a UI race allowed StorePosPanel to render while shiftState was still null before /cash/stores/:id/overview returned.

Fix: treat shiftState===null as unresolved/fail-closed, same as shiftLoading/runtime permissions. Sales UI can render only after shift overview is loaded and proves openSession. If no openSession exists, existing mandatory opening form remains the route. Workforce operator IN continues to be created only by successful cash shift open backend.

Status: IMPLEMENTED / AWAITING CI + MERGE + AUTO-DEPLOY + PHYSICAL RETEST.

# Workforce mobile PIN 401 handling — 01/10/2026

USER states the LAB POS 2 PIN is correct. Read-only production verification confirms WorkforceEmployee.pinHash equals StoreOperatorCredential.pinHash exactly and the invitation preselects the intended legacy employee ID.

Root cause found in client routing: entry.jsx storeApi globally reloads every /store page on any HTTP 401. The new /api/operators/login/mobile-pin intentionally uses 401 for rejected credentials, so the wrapper reloads the page before StoreOperatorApp can display the endpoint's actual error. This obscures diagnosis and can surface generic/stale login feedback.

Fix: only for employee-card=1 and exactly /api/operators/login/mobile-pin, preserve the 401 response for StoreOperatorApp to handle. All normal Store/POS 401 session-reset behavior remains unchanged.

Status: IMPLEMENTED / AWAITING CI + DEPLOY + USER RETEST. No PIN/hash/data mutation.

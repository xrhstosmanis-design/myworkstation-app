# 2026-09-21 — Invoice Learning draft save separated from profile sync

## Problem

The draft save waited for supplier-profile and product-knowledge synchronization after writing the workspace. A slow or failed profile sync made the save appear stuck or unsuccessful.

## Fix

- Draft save sends `syncProfiles:false` and the server persists the workspace without running the profile sync.
- Confirmed Learning still uses the default profile synchronization path.
- The client request has a 30-second timeout and displays the server error.

## Verification

- Targeted draft-save and POS contract tests pass.
- Pending: CI, merge, Render deploy, and a real refresh test with the 12-line draft.

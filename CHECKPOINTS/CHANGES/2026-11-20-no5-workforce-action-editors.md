# No5 — Workforce actions for delegated store staff

- Existing No5 scope and assignment. Adds creation, editing and status controls for rules and shift templates using explicit per-store grants.
- Rule editor uses the scoped employee list and requires its read grant. The writer checks exclusive store membership for every affected employee. Template role options and writer checks use store-related roles.
- Local frontend build passed. Focused server checks passed (8 passed, 1 native audit skip). LAB NOT TESTED. No production change.
- Common LAB acceptance still requires same-store positive tests and denial for absent grants, different stores, different companies, and shared employees.

- First full CI rejected two missing review catalogue entries and the stale 85-capability native fixture. Added both explicitly reviewed actions and updated the synthetic all-rights fixture to assert 87, including the new keys.

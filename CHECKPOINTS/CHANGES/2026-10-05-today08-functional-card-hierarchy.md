# 05/10/2026 — TODAY-08 functional card hierarchy

Owner clarified the semantic hierarchy after LIVE review. The upper `commerce-module-strip` controls are the actual functional navigation/actions and therefore must be the large, vivid, clearly clickable cards. The lower Modules section only reports which modules are enabled/available for the selected store and is read-only status information; it must be visually secondary and compact.

This bounded CSS-only correction preserves every existing upper button click handler, disabled permission guard and tab target, but promotes those controls to a vivid 5-column desktop action-card grid. The lower module status cards become compact 4-column white status indicators with no navigation affordance. Desktop viewport fit/no outer scroll remains.

No route, handler, permission, module state, data or business logic changes. PR #1774 was closed unmerged because it polished the wrong hierarchy. Requires green CI and exact LIVE owner acceptance.

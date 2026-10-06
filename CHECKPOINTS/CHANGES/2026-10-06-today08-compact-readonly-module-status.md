# 06/10/2026 — TODAY-08 compact read-only module status

LIVE after merged PR #1775 confirms the corrected hierarchy: actual functional controls are the large vivid cards at the top. Those controls are now locked and untouched by this change.

Final CSS-only pass affects only the lower Modules entitlement/status area. It becomes a compact six-column neutral white status grid with a small icon, module name and tiny status badge. Gradients, arrows, hover movement and clickable-card affordance are explicitly removed because this area is read-only information for the selected store.

No handler, route, permission, module state, data or business logic changes. Preserve desktop no-outer-scroll. Requires green CI and final LIVE owner acceptance.

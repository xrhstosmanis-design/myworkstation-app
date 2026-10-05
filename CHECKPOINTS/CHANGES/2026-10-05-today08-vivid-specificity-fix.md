# 05/10/2026 — TODAY-08 vivid specificity fix

LIVE after PR #1761 failed visual acceptance: white text was applied but older pale tone backgrounds still rendered, producing very low contrast. Root cause is CSS cascade/specificity conflict, not component data or layout.

Bounded CSS-only fix makes the owner-approved vivid gradient selectors authoritative by scoping them through `.commerce-hub > .commerce-reference-modules > .commerce-reference-card` and explicitly preserves white title/subtitle/icon/arrow contrast. Component markup, routes, permissions, module state, 3-column layout and no-outer-scroll behavior are unchanged.

Requires full green CI and exact LIVE owner acceptance.

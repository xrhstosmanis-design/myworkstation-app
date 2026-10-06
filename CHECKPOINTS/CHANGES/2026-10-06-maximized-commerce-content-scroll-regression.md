# 06/10/2026 — Maximized commerce content-scroll regression

Owner supplied paired LIVE screenshots showing a functional regression. In normal window size, Bulk Price Change has an internal vertical scrollbar and lower controls remain reachable. In maximized mode, the page clips below the viewport and no scroll is available, blocking completion of the form.

Root cause is the previous generic desktop viewport-fit rule that fixed the maximized shell and also set `.commerce-hub` to `overflow:hidden`. Correct behavior is: outer maximized shell remains fixed/no page-level scroll, while the bounded commerce content region is the vertical scroll container when its active tab exceeds available height.

CSS-only correction changes maximized `.commerce-hub` to `overflow-y:auto`, keeps horizontal overflow hidden, preserves `min-height:0`, stable scrollbar gutter and bottom breathing room. No form, handler, permission, route or business logic changes. Must be LIVE-tested on Bulk Price Change and representative commerce tabs before PASS.

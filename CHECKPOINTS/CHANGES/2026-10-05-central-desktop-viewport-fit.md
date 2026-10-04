# 05/10/2026 — Central desktop viewport-fit rule

Standing owner requirement: normal desktop Central Management pages must fit the viewport without outer page scrolling. Long lists/tables may scroll only inside their own bounded panel.

TODAY-08 root cause identified in commerce-home-modern.css: active module cards were explicitly forced into grid column 1 and locked/other cards into column 2, overriding later three-column CSS and producing the large right-side stack. Desktop-only authoritative override removes those forced columns, renders a true compact 3-column grid, reduces nav/header height, and constrains the maximized Commerce shell to the viewport with internal grid scrolling when needed.

CSS/layout only. No routes, permissions or business logic change. Requires CI/LIVE/owner visual acceptance.

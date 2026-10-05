# 05/10/2026 — TODAY-08 remove legacy pastel cascade

Second LIVE verification after PR #1765 still showed pale backgrounds with white text. Source audit confirmed the root cause: `commerce-home-modern.css` retained three styling generations simultaneously — legacy high-specificity pastel `nth-child` rules, component pastel tone rules, and the new vivid palette. The result remained cascade-dependent.

Corrective action removes obsolete pastel color declarations and the now-redundant specificity patch, retaining component geometry and exactly one authoritative owner-approved vivid palette. Module-card opacity is fixed to 1 so legacy locked-state opacity cannot wash out the palette. Module state remains represented by its badge/lock, not by making the whole card unreadable.

No routes, permissions, activation state, data or business logic changes. Requires full green CI and exact LIVE owner acceptance.

# Workforce employee-card mobile login UI — 01/10/2026

USER phone test showed the employee-card invitation using the full POS login shell: «Είσοδος στο POS», PIN/Card method tabs, large desktop layout and unnecessary store-mode side content. PIN authentication itself remains separate; production read-only DB check confirmed LAB POS 2 has active Workforce PIN hash and active StoreOperatorCredential PIN hash, so the entered PIN mismatch must be resolved by setting a known test PIN through the existing BackOffice edit flow.

UI fix is scoped only to URLs with employee-card=1: hide the full POS side panel and Card method selector, title «Η κάρτα μου», compact phone layout, employee + personal PIN + «Άνοιγμα κάρτας μου». Normal POS login is unchanged.

Status: IMPLEMENTED / AWAITING CI + DEPLOY + USER PHONE RETEST.

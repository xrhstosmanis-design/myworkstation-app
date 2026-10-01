# Workforce stable invitation share modal — 01/10/2026

Production USER retest after the 500 fix reached browser sharing, but the desktop native share UI opened briefly and closed. The server/mobile URL flow is therefore no longer the blocker; desktop delivery UX is unreliable.

Change: «Αποστολή εφαρμογής» now opens a persistent MyWorkStation dialog showing the employee-specific URL with explicit Copy link, WhatsApp, Viber, optional native Share, and Close actions. Native Share is no longer automatic. Backend, work-card generation, PIN, attendance and POS sessions are unchanged.

Status: IMPLEMENTED / AWAITING CI + DEPLOY + USER RETEST.

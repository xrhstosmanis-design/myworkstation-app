# BackOffice session renewal during Gate 3 review — 26/09/2026

Owner report: while working in BackOffice support access, the session ends unexpectedly. The screenshot `image(20260926-163825).png` separately shows `Cannot read properties of null (reading 'openSession')` in the cash check; it does not itself prove token expiry.

Cause found in source: `/api/platform/companies/:companyId/support-access` issues a two-hour support JWT; normal BackOffice sessions are twelve hours. On root page load, any one transient dashboard request could trigger automatic `logout()` and clear local storage.

Change: a verified BackOffice session can renew the same user/session and tenant scope before token expiry. The server checks current role/version and active, non-revoked session, extends the session, returns a same-scope JWT and for support access a fresh platform token. The open BackOffice page renews before expiry and does not clear state on a temporary network failure. The root dashboard presents retry on load failure rather than logging out. The cash panel guards a null overview response with a readable retry message. Explicit logout/revocation still prevents renewal. No POS operator/terminal token is renewed by this path.

Checks: Node syntax, client build, focused real HTTP renewal/revocation in the payment boundaries E2E, full CI and exact deployment pending. LAB verification: leave the support BackOffice open beyond the former two-hour limit while using invoice review; verify no logout, one draft/payment and retry behavior. Gate 3 remains OPEN.

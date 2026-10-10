# Backoffice session notice — limited LIVE UI acceptance

Verified10Oct2026 21:43Athens on production revision e6bdd31be656e29b85c113effef5e3402d4db146, source PR2163. This is only observed inactive-session notice and explicit recovery-form acceptance. Full healthy-session/context-change/network acceptance remains OPEN.

An existing authorized Backoffice user opens the normal Backoffice entry. If the current session is rejected, the view displays «Η προβολή Backoffice διακόπηκε» and explains that the session is inactive. Click «Νέα σύνδεση» to display the existing email/password form. The observed test stopped there: no credentials submitted, no store/company switching or business action. An ordinary reload is needed for old open tabs to receive the release.

The client notice grants no permission. Existing server authentication, company/store/role/module checks remain authoritative. The notice does not prove the cause of every401/404, does not revoke other sessions and is not independent evidence of request cessation, sales/cash/stock agreement or infrastructure health. Use secure sign-in; never send credentials in chat. If sign-in fails or the same-store refresh still fails, keep the exact observed time/message for diagnosis rather than bypassing guards or retrying business writes.

Evidence: CHECKPOINTS/EVIDENCE/backoffice-session-20261010/inactive-session.jpg. Full PR/mainCI and guarded exact deploy succeeded; CI is not a functional PASS. No numbered work item closed.

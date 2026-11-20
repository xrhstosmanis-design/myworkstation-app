# No5 — delegated shift-template actions

Local candidate adds an independently assignable shift-templates.manage capability, dependent on shift-templates.read. It recognizes only create, update and status changes on the native shift-template routes. Company/store matching and the personnel module check apply before entry. The grant is checked again in the existing mutation transaction and the native audit is retained.

Validation: 20 tests passed and one native case was skipped, plus exact route and grant-dependency assertions. Staff editing controls, native end-to-end verification, staff rules and deployment remain open. No live grant changes.

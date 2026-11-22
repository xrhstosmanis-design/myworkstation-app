# No 5 · Delegated POS operator permissions

Owner may grant the selected store's operator permission editor. Manager can list active POS employees and change an individual POS permission using the same option catalogue as the Owner UI. The transaction checks the live grant, employee and company/store, compares the observed flag, changes only that flag and audits the actor. Manager-grade operators, the actor's linked employee, credentials and BackOffice grants are outside this editor. Existing Owner workflow is retained. Full CI and common acceptance are pending.

The first source CI identified three test regressions. The delegated router is now separate, preserving all seven frozen Owner SQL signatures exactly. The quick-key and return checks follow the shared permission catalogue and still verify its use by the Owner editor. Fifteen targeted tests passed. Full CI recheck required.

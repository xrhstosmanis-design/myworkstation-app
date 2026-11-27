# Πρόταση παραγγελίας ανά προμηθευτή

26/11 POS cadence remains as before. New proposal changes cover known supplier packs from approved store invoices, editable quantities, supplier net estimates, and a Backoffice entry to the existing scoped proposal and email workflow. Zero excludes the line from outputs. Historic net costs exclude VAT and missing costs are flagged. Manual quantities are validated against the actor/store snapshot and shared by print and email.

A commercial minimum distinct from the recorded pack can be entered per line and applied to the current proposal, in stock units. It raises positive demand before rounding to a whole pack. Backoffice owners/admins can save the minimum for future proposals. Uses the existing reviewed company ManagementParameters.settings JSON and an audited atomic update. Unrelated parameter edits merge in SQL to preserve concurrent changes. No production migration is necessary. Actual production acceptance remains pending.

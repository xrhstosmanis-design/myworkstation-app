# BackOffice two-photo invoice draft validation

Retained #28 owner, continuing the hosted two-page Assistant acceptance.

Hosted LAB on 10 November 2026. The BackOffice showed both JPEG pages of synthetic invoice `LAB-REOPEN-2P-20261110`. Supplier, document number, final date and printed total of €3.10 agreed. The editable grid showed €1.00 for the second item while the source read showed €1.50. The second grid price was corrected to €1.50 before one attempt to create the draft. The form returned “Ελέγξτε τα στοιχεία της φόρμας.” The draft creation, return for correction and two original photos after reopening are unverified.

The BackOffice sends `V2.4.4_USER_REVIEW` to save reviewed lines. The first mounted handler accepted only `V2.4.4`. Extend the existing source allowlist to match the two values supported by the review route. Preserve line validation, tenant and store checks, and the existing multi-page draft handoff.

Next: exact-head CI, guarded deploy, and one hosted LAB replay with the same invoice identity after verifying no draft exists. Check the review transition and both originals in the same reopened draft. Scope excludes payments and invoicing.

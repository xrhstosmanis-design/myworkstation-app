# BackOffice invoice page links after return for correction

Retained #28 owner. Hosted LAB replay on revision `811478873ccb373876f362cf6e3861a1c7400dd8` verified the #3804 validation fix. One synthetic draft `LAB-REOPEN-2P-20261110` was created with two lines and €3.10 gross, matching its document total. The same order moved to review and then back to editable draft. The Assistant rendered only page 1. The two-photo acceptance remains open. Stock and shift deltas were not measured.

The supplier bridge rebuilds the intake JSON and drops the ordered `additionalPageJobIds` from the page-aware handler. Forward that field intact to the existing server validator and linker. Omit it from JSON when absent so single-file submissions keep their previous request. Existing linked POS and myDATA source rules are unchanged.

Next: exact-head CI, guarded release, and a fresh synthetic two-photo draft. Verify the archived pages and both original images on the same draft after return. The existing test draft lacks a proven second-page link and must not be duplicated to retest it.

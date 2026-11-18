# myDATA Epsilon Digital original PDF

PR #4036 adds the observed Epsilon Digital provider URL format. Existing PDF validation and invoice identity checks apply.

Read-only check for Diadochou Pavlou, HELL GREECE invoice 34795, MARK 400016065303897. The original URL returned HTTP 302 and the /pdf endpoint returned HTTP 200, application/pdf, and a valid PDF signature. Four focused local tests passed with simulated responses. CI and attachment in LAB remain pending. Production records were not modified.

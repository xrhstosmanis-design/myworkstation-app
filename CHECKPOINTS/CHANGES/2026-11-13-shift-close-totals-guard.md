# Shift close requires verified session totals

Following claim #3854, the close form requires numeric totals for the exact open session. A failed or incomplete read blocks submission and offers a refresh. A different session triggers a fresh load and clears the previous count. A legitimate zero remains valid.

Local mounted and focused tests passed. Hosted LAB pending. Next: implement the minimal read projection and navigation using the independent shifts.close grant.

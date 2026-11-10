# Hosted LAB PASS for reopening a two-photo BackOffice invoice

On 10 November 2026, the hosted application reported revision `97e21ae7ad19ba53e5798ba9f4531640a53b85b3` healthy with #3807. The main CI run 42867733227 succeeded. In MYWORKSTATION LAB, one new synthetic invoice `LAB-REOPEN-2P-20261110-B` was imported as two JPEG pages. The editable second line needed a manual correction from €1.00 to the printed €1.50. The stored draft held two lines, €2.50 net and €3.10 gross. The form showed €0.00 difference.

The same order moved to “Προς έλεγχο / Τιμολόγηση” and returned to editable “Νέα παραγγελία”. The Invoice Assistant then rendered two distinct 1450 × 1450 originals in order, with filenames `LAB-REOPEN-20261110-B-page-1.jpg` and `LAB-REOPEN-20261110-B-page-2.jpg`. PASS applies to draft creation, review, return and original-image display. Automatic line pricing, stock and shift deltas, production invoices and historic one-page links are outside this PASS.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lab=fs.readFileSync(new URL('../../client/src/invoice-learning-lab-bootstrap.js',import.meta.url),'utf8');

test('Invoice Learning exposes the professional view on the current draft',()=>{
  assert.match(lab,/professionalInvoiceView/);
  assert.match(lab,/Επαγγελματική προβολή & οικονομικός έλεγχος/);
  assert.match(lab,/openProfessionalInvoice\(current\)/);
});

test('professional view contains complete financial columns and reconciliation',()=>{
  for(const label of ['Αρχική τιμή','Εκπ. 1','Εκπ. 2','Εκπ. 3','Καθ. τιμή','Καθαρή αξία','Μικτή αξία','ΟΙΚΟΝΟΜΙΚΟΣ ΕΛΕΓΧΟΣ'])assert.match(lab,new RegExp(label));
  assert.match(lab,/sourceGrossAmount/);
  assert.match(lab,/difference<=\.05/);
  assert.match(lab,/Τιμολόγιο: \$\{declaredGross==null/);
  assert.match(lab,/Υπολογισμένο: \$\{fmt\(calculatedGross\)\}/);
});

test('professional learning view explicitly remains non-posting and central',()=>{
  assert.match(lab,/δεν δημιουργούν κίνηση stock ή λογιστικής/);
  assert.match(lab,/αποθηκεύονται κεντρικά για τον ίδιο προμηθευτή/);
});

test('replacement VAT dropdown updates the live draft and financial totals',()=>{
  assert.match(lab,/tr\.dataset\.lineId=line\.id/);
  assert.match(lab,/body\.onchange=event=>/);
  assert.match(lab,/find\(item=>item\.id===tr\?\.dataset\.lineId\)/);
  assert.match(lab,/syncRow\(tr,line\)/);
});

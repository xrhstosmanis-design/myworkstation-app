import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {parseKioskPaymentFile} from '../src/lib/kiosk-payment-workbook.js';

function workbook(rows){
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Ημερομηνία','Ποσό','Περιγραφή'],...rows]),'Kiosk');
  return XLSX.write(book,{type:'base64',bookType:'xlsx'});
}

test('Kiosk preview and import can use the same normalized amount, date and description',()=>{
  const parsed=parseKioskPaymentFile('kiosk.xlsx',workbook([
    ['22/11/2026',-12,'Αρνητική εγγραφή'],
    ['22/11/2026','-12,00','Αρνητική εγγραφή σε κείμενο'],
    ['22/11/2026',12.5,'Έξοδο']
  ]));
  assert.equal(parsed.rows.length,1);
  assert.equal(parsed.skipped,2);
  assert.equal(parsed.rows[0].amount,12.5);
  assert.equal(parsed.rows[0].description,'Kiosk · Έξοδο');
  assert.equal(parsed.sheet,'Kiosk');
  assert.equal(parsed.headerRow,0);
});

test('the common parser rejects an export above the import count limit',()=>{
  const rows=Array.from({length:5001},()=>['22/11/2026',10,'Έξοδο']);
  assert.throws(()=>parseKioskPaymentFile('kiosk.xlsx',workbook(rows)),{status:400,message:/5\.000/});
});

test('preview receipt binds exact bytes, filename, actor, company and selected store until expiry',async()=>{
  const {issueKioskPreview,verifyKioskPreview}=await import('../src/lib/kiosk-payment-workbook.js');
  const scope={companyId:'company',storeId:'store',actorId:'owner'};
  const file={filename:'kiosk.xlsx',dataBase64:workbook([['22/11/2026',10,'Έξοδο']])};
  const opts={secret:'test-only-signing-key',now:1_800_000_000_000};
  const receipt=issueKioskPreview(scope,file,opts);
  assert.equal(verifyKioskPreview(scope,file,receipt,opts),true);
  for(const key of Object.keys(scope))assert.equal(verifyKioskPreview({...scope,[key]:'other'},file,receipt,opts),false);
  assert.equal(verifyKioskPreview(scope,{...file,filename:'other.xlsx'},receipt,opts),false);
  assert.equal(verifyKioskPreview(scope,{...file,dataBase64:Buffer.from('different').toString('base64')},receipt,opts),false);
  assert.equal(verifyKioskPreview(scope,file,receipt,{...opts,now:opts.now+900_000}),false);
  assert.equal(verifyKioskPreview(scope,file,'',opts),false);
});

test('Kiosk delegation requires the selected-store payment grant and is limited to the two import routes',async()=>{
  const {staffRequestCapability,validStaffCapabilities}=await import('../../shared/backoffice-staff.mjs');
  const grant='payments.import-kiosk';
  assert.equal(validStaffCapabilities([grant]),false);
  assert.equal(validStaffCapabilities(['payments.read',grant]),true);
  assert.equal(staffRequestCapability('POST','/api/owner-payments/preview-kiosk'),grant);
  assert.equal(staffRequestCapability('POST','/api/owner-payments/import-kiosk'),grant);
  assert.equal(staffRequestCapability('POST','/api/owner-payments/preview-bank'),null);
});

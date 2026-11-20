import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticCashMailPresentation} from '../src/services/automatic-report-cash-mail-presentation.js';
function sample(){
 return {format:'MWS_AUTOMATIC_CASH_PAYLOAD_V1',storeName:'Δοκιμαστικό κατάστημα',frequency:'DAILY',financialFinality:'PROVISIONAL',financialReconciliationComplete:false,employeeLiabilityAdjusted:false,
  period:{from:'2026-11-19T03:00:00.000Z',to:'2026-11-20T03:00:00.000Z'},sourceCount:3,sourceFingerprint:'a'.repeat(64),scope:{companyId:'private-company-id',storeId:'private-store-id'},
  groups:[{day:'2026-11-19',terminalPos:'MAIN',cashChain:'STORE',originalShortage:10.01,originalSurplus:8.02,offset:8.02,netVariance:-1.99,
   rows:[{sessionId:'private-session-a',employeeId:'private-user-a',employeeName:'Δοκιμαστικός Α',variance:-10.01},{sessionId:'private-session-b',employeeName:'Δοκιμαστικός Β',variance:8.02},{sessionId:'private-session-c',employeeName:null,variance:0}]}]};
}
test('Greek daily mail shows Athens business dates, original named records and provisional limits without technical metadata',()=>{
 const content=sample(),before=JSON.stringify(content),result=automaticCashMailPresentation(content);
 assert.match(result.subject,/Προσωρινή ημερήσια αναφορά ταμείων · Δοκιμαστικό κατάστημα · 19\/11\/2026/);
 assert.match(result.text,/19\/11\/2026 05:00 – 20\/11\/2026 05:00 \(ώρα Ελλάδας\)/);
 assert.match(result.text,/Καταγεγραμμένες βάρδιες: 3/);
 assert.match(result.text,/Αρχικά σύνολα: έλλειμμα 10,01 € · πλεόνασμα 8,02 € · διαφορά −1,99 €/);
 assert.match(result.text,/Χειριστής ανοίγματος: Δοκιμαστικός Α — διαφορά −10,01 € \(έλλειμμα\)/);
 assert.match(result.text,/Χειριστής ανοίγματος: Δοκιμαστικός Β — διαφορά \+8,02 € \(πλεόνασμα\)/);
 assert.ok(result.text.indexOf('Αρχικά σύνολα:')<result.text.indexOf('Χειριστής ανοίγματος:'));
 assert.ok(result.text.indexOf('Χειριστής ανοίγματος:')<result.text.indexOf('Εκκρεμότητες ελέγχου'));assert.match(result.text,/Χωρίς καταγεγραμμένο όνομα/);
 assert.match(result.text,/Πιθανός συμψηφισμός: 8,02 € — ενημερωτικός μόνο, δεν έχει εφαρμοστεί/);
 assert.match(result.text,/ΠΡΟΣΩΡΙΝΗ ΑΝΑΦΟΡΑ/);assert.match(result.text,/Δεν αποτελεί ολοκληρωμένη οικονομική συμφωνία/);
 assert.match(result.text,/Δεν γίνεται μεταφορά ή καταλογισμός ευθύνης εργαζομένου/);
 assert.doesNotMatch(result.text+result.subject,/private-|aaaaaaaa|sourceFingerprint|DAILY|2026-11-19T|sessionId|employeeId|settingsVersion/);
 assert.equal(JSON.stringify(content),before);assert.ok(Object.isFrozen(result));
});
test('frequency and Athens daylight-saving boundaries are localized without invented record times',()=>{
 for(const [frequency,label] of [['WEEKLY','Εβδομαδιαία'],['MONTHLY','Μηνιαία']]){
  const c=sample();c.frequency=frequency;assert.ok(automaticCashMailPresentation(c).subject.startsWith('Προσωρινή '+label.toLocaleLowerCase('el-GR')));
 }
 for(const [from,to,expected] of [
  ['2026-03-28T03:00:00.000Z','2026-03-29T02:00:00.000Z','28/03/2026 05:00 – 29/03/2026 05:00'],
  ['2026-10-24T02:00:00.000Z','2026-10-25T03:00:00.000Z','24/10/2026 05:00 – 25/10/2026 05:00']]){
  const c=sample();c.period={from,to};assert.ok(automaticCashMailPresentation(c).text.includes(expected));
 }
});
test('display text and exact cents are bounded and malformed data never becomes raw payload or zero',()=>{
 for(const change of [c=>c.storeName='bad\nname',c=>c.storeName='   ',c=>c.groups[0].rows[0].employeeName='\t',c=>c.groups[0].rows[0].employeeName='\n',c=>c.groups[0].rows[0].employeeName='bad\rname',c=>c.groups[0].rows[0].variance=null,c=>c.groups[0].rows[0].variance=0.001,c=>c.groups[0].offset=0,c=>c.sourceCount=4,c=>c.groups[0].rows.push(c.groups[0].rows[0]),c=>c.period.from='not-a-date',c=>c.frequency='EVENT',c=>c.financialFinality='FINAL',c=>c.reviewedCash={}]){
  const c=sample();change(c);assert.throws(()=>automaticCashMailPresentation(c));
 }
 const c=sample();c.storeName='X'.repeat(1000);const r=automaticCashMailPresentation(c);assert.ok(r.subject.length<300);assert.ok(r.text.includes(c.storeName));
});

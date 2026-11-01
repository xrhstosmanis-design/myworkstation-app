import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {projectPostpaidDebt,postpaidGrantSchema,postpaidPaymentSchema,publicPostpaidActivity} from '../src/services/ai-wallet-postpaid.js';
import {walletNoticeText} from '../src/services/ai-owner-wallet-notifications.js';
const metadata={type:'CREDIT_ON_ACCOUNT',reason:'Synthetic credit',reference:'SYNTHETIC-ACCOUNT',storeId:'s',generation:'0',sendNotifications:false,recipientFingerprint:null};
const grant=(id=randomUUID(),value='10000000')=>({id,storeId:'s',kind:'CREDIT',status:'CREDITED',feature:'POSTPAID_GRANT',creditedMicros:value,createdAt:new Date('2026-11-01T00:00:00Z'),postpaid:{...metadata}});
const payment=(creditEntryId,value='4000000')=>({id:randomUUID(),kind:'CREDIT',status:'CREDITED',feature:'POSTPAID_PAYMENT',creditedMicros:'0',postpaid:{type:'DEBT_PAYMENT',creditEntryId,amountMicros:value,receiptReference:'SYNTHETIC-RECEIPT'}});
test('postpaid debt is independent of consumption and exact partial/full receipts never double fund balance',()=>{
 const g=grant(),p=payment(g.id);const d=projectPostpaidDebt([g,p]);
 assert.equal(d.issuedMicros,'10000000');assert.equal(d.paidMicros,'4000000');assert.equal(d.outstandingMicros,'6000000');assert.equal(d.grants[0].status,'PARTIAL');
 const paid=projectPostpaidDebt([g,p,payment(g.id,'6000000')]);assert.equal(paid.outstandingMicros,'0');assert.equal(paid.grants[0].status,'PAID');assert.equal(p.creditedMicros,'0');
 assert.deepEqual(projectPostpaidDebt([]),{balanceScope:'COMPANY',issuedMicros:'0',paidMicros:'0',outstandingMicros:'0',grantCount:0,grants:[]});
});
test('postpaid projection refuses orphan, malformed, overpaid, duplicated or falsely credited receipt rows',()=>{
 const g=grant(),p=payment(g.id);
 for(const rows of [[p],[g,g],[g,{...p,creditedMicros:'1'}],[g,payment(g.id,'10000001')],[{...g,creditedMicros:'0'}],[{...g,status:'REVIEW'}],[g,{...p,postpaid:{...p.postpaid,amountMicros:'-1'}}],[g,{...p,postpaid:{...p.postpaid,amountMicros:'1e2'}}],[{...g,postpaid:{...g.postpaid,unknown:true}}]])assert.throws(()=>projectPostpaidDebt(rows));
});
test('all unpaid credits remain selectable beyond latest100 and old payments contribute to company totals',()=>{
 const old=grant(),rows=[old];for(let i=0;i<125;i++){const g=grant();g.createdAt=new Date(Date.UTC(2026,10,2+i));rows.push(g,payment(g.id,'10000000'))}
 const d=projectPostpaidDebt(rows);assert.equal(d.grantCount,126);assert.equal(d.outstandingMicros,'10000000');assert.equal(d.grants.length,101);assert.ok(d.grants.some(g=>g.id===old.id));
});
test('strict postpaid request schemas do not accept arbitrary recipients, spoofed actor, unchecked authority or silent payment',()=>{
 const g={version:0,storeId:'s',generation:'0',amountMicros:'1000000',reference:'UNIQUE-REF',reason:'Synthetic reason',sendNotifications:true,recipientFingerprint:'a'.repeat(64),unpaidCreditConfirmed:true};
 assert.ok(postpaidGrantSchema.safeParse(g).success);
 for(const x of [{...g,emails:['foreign@example.invalid']},{...g,actorId:'spoof'},{...g,unpaidCreditConfirmed:false},{...g,storeId:''},{...g,recipientFingerprint:'invalid'},{...g,version:-1}])assert.equal(postpaidGrantSchema.safeParse(x).success,false);
 const p={version:1,creditEntryId:randomUUID(),amountMicros:'1000000',receiptReference:'RECEIVED-REF',receiptConfirmed:true};assert.ok(postpaidPaymentSchema.safeParse(p).success);assert.equal(postpaidPaymentSchema.safeParse({...p,receiptConfirmed:false}).success,false);
});
test('public funding metadata never exposes recipient authority snapshots or private reasons',()=>{
 assert.deepEqual(publicPostpaidActivity(metadata),{type:'CREDIT_ON_ACCOUNT',reference:'SYNTHETIC-ACCOUNT'});assert.equal(publicPostpaidActivity({...metadata,recipientFingerprint:'invalid'}),null);
});
test('postpaid email says unpaid amount, company debt and separate AI balance; already paid credit is never demanded twice',()=>{
 const n={kind:'CREDIT',amountMicros:'10000000',balanceMicros:'10000000',postpaid:{amountDueMicros:'6000000',totalDueMicros:'16000000',availableMicros:'8000000',reference:'ACCOUNT-REF'}};
 const text=walletNoticeText(n);assert.match(text.subject,/εκκρεμεί εξόφληση/);assert.match(text.text,/6,00/);assert.match(text.text,/16,00/);assert.match(text.text,/8,00/);assert.match(text.text,/όχι την οφειλή/);
 const paid=walletNoticeText({...n,postpaid:{...n.postpaid,amountDueMicros:'0'}});assert.match(paid.text,/έχει εξοφληθεί/);assert.doesNotMatch(paid.text,/Εκκρεμεί η εξόφληση/);
 const original=walletNoticeText({kind:'CREDIT',amountMicros:'10000000',balanceMicros:'10000000'});assert.match(original.subject,/Επιβεβαίωση πίστωσης/);assert.doesNotMatch(original.text,/επί πιστώσει/);
});

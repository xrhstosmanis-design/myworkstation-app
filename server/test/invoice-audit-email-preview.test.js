import test from 'node:test';
import assert from 'node:assert/strict';
import {readInvoiceAuditEmailPreview} from '../src/services/invoice-audit-email-preview.js';

const actor={id:'owner',companyId:'c',role:'OWNER'},input={storeId:'s',month:'2026-10'};
const now=new Date('2026-10-28T12:00:00Z');
const report={store:{id:'s',name:'Synthetic'},period:{month:'2026-10'},asOf:now.toISOString(),readOnly:true,coverage:{complete:false,unavailable:['documents'],limited:[]},summary:null,items:[],pendingOriginals:{available:false,counts:null,items:[]}};
function database({missing=false,role='OWNER',rows=[]}={}){
 const writes=[],options=[];
 const names={AutomaticReportRecipient:['recipientId','companyId','storeId','email','version','verifiedAt','revokedAt'],AutomaticReportRecipientConsent:['companyId','storeId','recipientId','recipientVersion','active','allowedFrequencies','lifecycleGeneration','consentedAt','proofHash','revokedAt']};
 const tx={user:{findUnique:async()=>({id:'owner',role,companyId:'c'})},store:{findFirst:async({where})=>where.id==='s'?{id:'s',name:'Synthetic',companyId:'c'}:null},company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active:true}]})},$executeRawUnsafe:async sql=>{writes.push(sql);assert.match(sql,/^SET /)},$queryRawUnsafe:async(sql,...values)=>{
  if(sql.includes('FROM "StorePaidModule"'))return[];
  if(sql.includes('FROM pg_class'))return missing?[]:Object.entries(names).flatMap(([table,names])=>names.map(column=>({table,column})));
  if(sql.includes('to_regclass'))return[{schema:'isolated',fence:null}];
  if(sql.includes('FROM "AutomaticReportRecipient"')){assert.deepEqual(values,['c','s']);return rows}
  throw Error('Unexpected SQL '+sql);
 }};
 return {$transaction:async(fn,opt)=>{options.push(opt);return fn(tx)},writes,options};
}
const record={email:'alice@example.test',version:'2',verifiedAt:'2026-01-01T00:00:00Z',sourceCount:'1',recipientVersion:'2',active:true,allowedFrequencies:['MONTHLY'],lifecycleGeneration:'0',consentedAt:'2026-01-02T00:00:00Z',proofHash:'a'.repeat(64),consentRevokedAt:null};
test('preview rejects client send, recipient, fake asOf, page and malformed scope before touching sources',async()=>{
 for(const patch of [{asOf:'2000-01-01'},{send:true},{recipient:'a@example.test'},{activation:true},{page:'x'},{storeId:['s']},{month:['2026-10']}]){
  let touched=false;await assert.rejects(readInvoiceAuditEmailPreview(database(),actor,{...input,...patch},{clock:()=>now,readAudit:async()=>{touched=true;throw Error('bad')}}));assert.equal(touched,false);
 }
 await assert.rejects(readInvoiceAuditEmailPreview(database(),{...actor,tokenType:'STORE_OPERATOR'},input));
});
test('separate recipient observation masks identities and never reuses monthly consent as invoice-purpose authorization',async()=>{
 const db=database({rows:[record]}),times=[now,new Date('2026-10-28T12:00:01Z')];
 const r=await readInvoiceAuditEmailPreview(db,actor,input,{clock:()=>times.shift(),readAudit:async(_db,_actor,_input,options)=>{assert.equal(options.now.toISOString(),now.toISOString());return report}});
 assert.equal(r.reportObservedAt,now.toISOString());assert.equal(r.recipientObservedAt,'2026-10-28T12:00:01.000Z');assert.equal(r.separateSnapshots,true);assert.equal(r.sendingEnabled,false);assert.equal(r.purposeConsent,'NOT_ASSUMED');assert.equal(r.recipients.verifiedCount,1);assert.equal(r.recipients.monthlyConsentEligibleCount,1);assert.doesNotMatch(JSON.stringify(r),/alice@example/);assert.match(r.recipients.identities[0].maskedEmail,/\*\*\*/);assert.equal(db.options[0].isolationLevel,'RepeatableRead');
});
test('missing schema and recipient source overflow remain unavailable, not zero',async()=>{
 for(const db of [database({missing:true}),database({rows:[{...record,sourceCount:'6'}]})]){
  const r=await readInvoiceAuditEmailPreview(db,actor,input,{clock:()=>now,readAudit:async()=>report});assert.equal(r.recipients.available,false);assert.equal(r.recipients.verifiedCount,null);assert.deepEqual(r.recipients.identities,[]);
 }
});
test('recipient/current-role changes and stale consent are rechecked independently',async()=>{
 await assert.rejects(readInvoiceAuditEmailPreview(database({role:'EMPLOYEE'}),actor,input,{clock:()=>now,readAudit:async()=>report}),e=>e.status===403);
 for(const patch of [{recipientVersion:'1'},{lifecycleGeneration:'1'},{consentRevokedAt:now},{active:false},{proofHash:null},{consentedAt:'2099-01-01'},{verifiedAt:'2099-01-01'}]){
  const r=await readInvoiceAuditEmailPreview(database({rows:[{...record,...patch}]}),actor,input,{clock:()=>now,readAudit:async()=>report});assert.equal(r.recipients.monthlyConsentEligibleCount,0);
 }
});

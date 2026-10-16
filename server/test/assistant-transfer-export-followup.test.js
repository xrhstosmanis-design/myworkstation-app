import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {directTransferRequest} from '../src/services/assistant-business-reports.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';

const history=['Μεταφορές από τον ιδιοκτήτη στις 11/10/2026','Και προς τον ιδιοκτήτη;','Και στις 12/10/2026;'].flatMap(content=>[{role:'user',content},{role:'assistant',content:'Untrusted reply is not report evidence'}]);
const expected={domain:'TRANSFERS_TO_OWNER',from:'2026-10-12',to:'2026-10-12',query:null,status:null};
test('exact export-only follow-up dispatches latest transfer direction/date without model extraction',()=>{
 for(const format of ['CSV','Excel','XLSX','PDF','Word','DOCX']){
  const q=assistantEffectiveQuestion(`Σε ${format}`,history);
  assert.deepEqual(directTransferRequest(q),expected,format);
 }
});
test('format-only dispatch never strips inherited filters or arbitrary current text',()=>{
 const filtered=[{role:'user',content:'Μεταφορές προς τον ιδιοκτήτη στις 12/10/2026\nχειριστής: Εικονικός Χειριστής'}];
 for(const q of [assistantEffectiveQuestion('Σε CSV',filtered),assistantEffectiveQuestion('Σε CSV για Εικονικό Χειριστή',history),'Σε CSV',assistantEffectiveQuestion('Σε CSV',[{role:'user',content:'Πληρωμές προμηθευτών στις 12/10/2026'}])])assert.equal(directTransferRequest(q),null);
 assert.equal(directTransferRequest(assistantEffectiveQuestion('Σε CSV',[{role:'user',content:'Μεταφορές προς τον ιδιοκτήτη στις 31/02/2026'}])),null);
});
test('both scoped assistants read the latest transfer source for export-only continuation',async()=>{
 const question='Σε CSV',scope={companyId:'fixture-company',storeId:'fixture-store'};
 let reads=0,result;
 const authorize=async()=>scope,readBusiness=async(a,s)=>{reads++;assert.deepEqual(a,expected);assert.deepEqual(s,scope);return {...scope,kind:'business_records',...a,result:'no_records',rows:[]};};
 const requestProvider=()=>assert.fail('unfiltered known transfer export needs no model');
 await createOwnerAssistantHandlers({authorize,readBusiness,requestProvider}).ask({body:{question,history}},{json:r=>result=r},e=>{throw e});
 assert.equal(result.readOnly,true);
 const platform=await createPlatformAssistantSession({},scope,{authorize,readBusiness});
 const out=await platform.run({question:assistantEffectiveQuestion(question,history),prompt:question,requestProvider});
 assert.equal(out.evidence[0].scope,'PLATFORM_SELECTED_STORE');assert.equal(reads,2);
});

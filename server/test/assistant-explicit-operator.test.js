import test from 'node:test';
import assert from 'node:assert/strict';
import {businessTool,explicitOperatorTransferRequest} from '../src/services/assistant-business-reports.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';

const question='Δείξε μεταφορές από τον ιδιοκτήτη προς το ταμείο στις 10/10/2026. Φίλτρο χειριστή ακριβώς «ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ» — κράτησε αυτό το κείμενο φίλτρου χωρίς αλλαγή.';
const expected={domain:'TRANSFERS_FROM_OWNER',from:'2026-10-10',to:'2026-10-10',query:'ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ',status:null};
test('explicit quoted operator and complete transfer direction read once without model extraction',async()=>{
 let reads=0;
 const out=await runOwnerAssistant({question,prompt:question,tools:[businessTool],requestProvider:()=>assert.fail('explicit operator must not depend on model domain/date extraction'),readBusiness:async args=>{
  reads++;assert.deepEqual(args,expected);return {kind:'business_records',...args,rows:[],result:'no_records'};
 }});
 assert.equal(reads,1);assert.deepEqual(out.reads,[{name:'business_records',args:expected}]);
});
test('quoted operator parser preserves literal query and refuses any unparsed restriction',()=>{
 assert.deepEqual(explicitOperatorTransferRequest(question),expected);
 const plain='Δείξε μεταφορές προς τον ιδιοκτήτη στις 10/10/2026. Φίλτρο χειριστή ακριβώς «Νίκος Δοκιμαστικός»';
 assert.deepEqual(explicitOperatorTransferRequest(plain),{...expected,domain:'TRANSFERS_TO_OWNER',query:'Νίκος Δοκιμαστικός'});
 for(const invalid of [
  question.replace('ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ','ΝΙΚΟ'),question.replace('ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ','ΝΙΚ ΔΟΚΙΜΑΣΤΙΚΟ'),question.replace('ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ','NIKO DOKIMASTIKO'),
  question.replace('στις 10/10/2026','στις 31/02/2026'),question.replace('στις 10/10/2026',''),
  question.replace('. Φίλτρο',' με κατάσταση PENDING. Φίλτρο'),question+' και ποσό πάνω από 10',
  question.replace('μεταφορές από τον ιδιοκτήτη προς το ταμείο','πληρωμές προμηθευτών'),
  question.replace('προς το ταμείο','και προς τον ιδιοκτήτη'),
  question.replace('«ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ»','«ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ» και «ΑΛΛΟ ΟΝΟΜΑ»'),
  question+'\nΠροηγούμενο θέμα της ίδιας συνομιλίας: Μεταφορές με κατάσταση PENDING στις 10/10/2026',
  assistantEffectiveQuestion('Σε CSV',[{role:'user',content:question}]),
 ])assert.equal(explicitOperatorTransferRequest(invalid),null,invalid);
});
test('both scoped roles dispatch literal operator with authorization around the original source',async()=>{
 const scope={companyId:'fixture-company',storeId:'fixture-store'};let reads=0,auth=0,result;
 const authorize=async()=>{auth++;return scope;};
 const readBusiness=async(args,s)=>{reads++;assert.deepEqual(args,expected);assert.deepEqual(s,scope);return {...scope,kind:'business_records',...args,result:'no_records',rows:[]};};
 const requestProvider=()=>assert.fail('explicit literal transfer filter needs no model');
 await createOwnerAssistantHandlers({authorize,readBusiness,requestProvider}).ask({body:{question}},{json:r=>result=r},e=>{throw e});
 assert.equal(result.readOnly,true);assert.equal(result.evidence[0].query,expected.query);
 const platform=await createPlatformAssistantSession({},scope,{authorize,readBusiness});
 const out=await platform.run({question,prompt:question,requestProvider});
 assert.equal(out.evidence[0].scope,'PLATFORM_SELECTED_STORE');assert.equal(out.evidence[0].query,expected.query);assert.equal(reads,2);assert.ok(auth>=8);
});
test('unsupported model-backed filters still reject mismatched domain before reading',async()=>{
 let reads=0;
 await assert.rejects(runOwnerAssistant({question:question+' με κατάσταση PENDING',prompt:'synthetic',tools:[businessTool],cashTool:{name:'cash_details'},
  requestProvider:async()=>({response:{ok:true},raw:{status:'completed',output:[{type:'function_call',name:'business_records',call_id:'fixture',arguments:JSON.stringify({...expected,domain:'TRANSFERS_TO_OWNER',status:'PENDING'})}]}}),
  readBusiness:async()=>{reads++;},
 }),e=>e.status===422&&/είδος και διάστημα/.test(e.message));
 assert.equal(reads,0);
});

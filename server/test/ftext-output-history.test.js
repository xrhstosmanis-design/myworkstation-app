import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ftextOutputHistory} from '../src/services/ftext-output-history.js';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {validateFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
const settings={companyId:'fixture-company',storeId:'fixture-store',terminalPos:'POS-01',serialNumber:'SYNTHETIC',fiscalDeviceCode:'FISCAL-01',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]};
const device={id:'fixture-device',tokenVersion:3};
const id='370a0232-aeb7-4320-9919-d96c3f9f52d5';
function fixture(){
 const row={id,...settings,settingsHash:ftextSettingsHash(settings),status:'SALE_COMMITTED',saleId:'fixture-sale',claimedByDeviceId:device.id,claimedTokenVersion:device.tokenVersion,plan:{scope:{companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos,fiscalDeviceCode:settings.fiscalDeviceCode},lines:[{description:'SYNTHETIC',quantity:'1',unitPrice:'1.25',department:4}],payment:{method:'CASH',code:1}},checkoutJson:{actorId:'fixture-cashier',paymentMethod:'CASH'}};
 row.result=validateFtextCashResult({requestId:id,settingsHash:row.settingsHash,outcome:'CONFIRMED',code:0,serialNumber:settings.serialNumber,dayId:'1',dayCounter:'1',deviceTime:'fixture',qr:'https://www1.aade.gr/dcl/fixture',rawResultHash:'b'.repeat(64)},row);
 row.resultHash=createHash('sha256').update(JSON.stringify(row.result)).digest('hex');
 row.checkoutJson.ftextHandoff={state:'ACCEPTED',deviceId:device.id,tokenVersion:device.tokenVersion,settingsHash:row.settingsHash,lifecycleGeneration:settings.lifecycleGeneration,serialNumber:settings.serialNumber,nonce:'75a4261f-bbaf-4b2a-aedf-ae2edbeec7d8',commandHash:ftextOriginalCommandHash(row,settings)};
 return row;
}
function db(row){return {$queryRaw:async(strings,...v)=>{const sql=strings.join('?');if(sql.includes('to_regclass'))return [{name:'FtextCashRequest'}];assert.match(sql,/"status"='SALE_COMMITTED'/);assert.match(sql,/"saleId" IS NOT NULL/);assert.equal(v[0],settings.companyId);assert.equal(v[1],settings.storeId);assert.equal(v[2],settings.terminalPos);assert.equal(v[3],device.id);assert.equal(v[4],device.tokenVersion);return row?[row]:[]}}}
test('OUTPUT history returns only complete original committed proof and never writes or renews readiness',async()=>{
 const row=fixture(),before=structuredClone(row),result=await ftextOutputHistory(db(row),device,settings,{requestIds:[id,id]});
 assert.equal(result.completed.length,1);assert.equal(result.completed[0].requestId,id);assert.deepEqual(result.completed[0].result,row.result);assert.equal(result.completed[0].commandHash,row.checkoutJson.ftextHandoff.commandHash);assert.equal(result.readinessVerified,false);assert.equal(result.fiscalExecution,false);assert.deepEqual(row,before);
 const unordered=structuredClone(row);unordered.result=Object.fromEntries(Object.entries(row.result).reverse());assert.equal((await ftextOutputHistory(db(unordered),device,settings,{requestIds:[id]})).completed.length,1);
});
test('OUTPUT history holds unknown, unreconciled, late, released, foreign and changed evidence',async()=>{
 const original=fixture();
 const patches=[{status:'CONFIRMED'},{status:'REQUIRES_CHECK'},{saleId:null},{id:'75a4261f-bbaf-4b2a-aedf-ae2edbeec7d8'},{companyId:'foreign'},{storeId:'foreign'},{terminalPos:'foreign'},{claimedByDeviceId:'foreign'},{claimedTokenVersion:4},{settingsHash:'c'.repeat(64)},{lifecycleGeneration:'1'},{serialNumber:'foreign'},{resultHash:'c'.repeat(64)},{result:{...original.result,code:101}},{result:{...original.result,extra:true}},{checkoutJson:{...original.checkoutJson,ftextVoid:{status:'CONFIRMED'}}},{checkoutJson:{...original.checkoutJson,ftextOperatorRelease:{registerReady:true}}},{checkoutJson:{...original.checkoutJson,ftextLateCashReceipt:{result:original.result}}}];
 for(const patch of patches){const row={...structuredClone(original),...patch};assert.deepEqual((await ftextOutputHistory(db(row),device,settings,{requestIds:[id]})).completed,[],JSON.stringify(patch));}
 for(const patch of [{state:'OFFERED'},{deviceId:'foreign'},{tokenVersion:4},{settingsHash:'c'.repeat(64)},{serialNumber:'foreign'},{commandHash:'c'.repeat(64)},{nonce:'invalid'}]){const row=structuredClone(original);Object.assign(row.checkoutJson.ftextHandoff,patch);assert.equal((await ftextOutputHistory(db(row),device,settings,{requestIds:[id]})).completed.length,0);}
});
test('OUTPUT history refuses broad/unbounded/arbitrary request input before querying',async()=>{
 for(const input of [{requestIds:[]},{requestIds:Array(21).fill(id)},{requestIds:['../foreign']},{requestIds:[id],storeId:'foreign'},{}])await assert.rejects(ftextOutputHistory({$queryRaw:()=>assert.fail('Invalid input queried')},device,settings,input));
 assert.deepEqual((await ftextOutputHistory(db(null),device,{...settings,cashEnabled:false},{requestIds:[id]})).completed,[]);
});

function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native OUTPUT projection uses a READ ONLY transaction, exact current scope and unchanged original fixture table',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),{ensureFtextCashSchema,ftextCashLifecycleReviewProposal}=await import('../src/services/ftext-cash-schema.js');
 const admin=new PrismaClient(),schema='ftext_output_'+Date.now(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const client=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await ensureFtextCashSchema(client,{manifest:ftextCashLifecycleReviewProposal()});
  const r=fixture();
  // A synthetic projection fixture only; no Sale/Payment/Stock table exists.
  await client.$executeRaw`INSERT INTO "FtextCashRequest" ("id","companyId","storeId","terminalPos","fiscalDeviceCode","serialNumber","clientTransactionId","requestHash","settingsHash","lifecycleGeneration","sessionId","plan","checkoutJson","total","status","claimedByDeviceId","claimedTokenVersion","result","resultHash","saleId") VALUES (${r.id},${r.companyId},${r.storeId},${r.terminalPos},${r.fiscalDeviceCode},${r.serialNumber},'fixture-client','fixture-request',${r.settingsHash},${r.lifecycleGeneration},'fixture-shift',${JSON.stringify(r.plan)}::jsonb,${JSON.stringify(r.checkoutJson)}::jsonb,1.25,${r.status},${r.claimedByDeviceId},${r.claimedTokenVersion},${JSON.stringify(r.result)}::jsonb,${r.resultHash},${r.saleId})`;
  const snapshot=()=>client.$queryRaw`SELECT * FROM "FtextCashRequest" ORDER BY "id"`,before=await snapshot();
  const read=(d=device,c=settings)=>client.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return ftextOutputHistory(tx,d,c,{requestIds:[id]})});
  assert.equal((await read()).completed.length,1);
  for(const d of [{...device,id:'foreign'},{...device,tokenVersion:4}])assert.equal((await read(d)).completed.length,0);
  for(const patch of [{storeId:'foreign'},{terminalPos:'POS-02'},{serialNumber:'FOREIGN'},{lifecycleGeneration:'1'}])assert.equal((await read(device,{...settings,...patch})).completed.length,0);
  assert.deepEqual(await snapshot(),before);
 }finally{await client.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});

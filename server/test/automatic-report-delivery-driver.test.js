import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createAutomaticReportDeliveryDriver} from '../src/services/automatic-report-delivery-driver.js';
import {createAutomaticReportDeliveryRepository} from '../src/services/automatic-report-delivery-repository.js';
import {createDeliverySlot,claimDelivery} from '../src/services/automatic-report-delivery-lifecycle.js';

// Actual repository/adapter/lifecycle, transactional synthetic DB and transport.
// No network, production DB, credentials, timers or real recipient are used.
const NOW='2026-10-22T12:00:00.000Z',later=ms=>new Date(Date.parse(NOW)+ms).toISOString();
const copy=value=>structuredClone(value),recipient='driver-fixture@example.invalid';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixtureData(){
  const content={format:'MWS_AUTOMATIC_CASH_PAYLOAD_V1',scope:{companyId:'synthetic-driver-company',storeId:'selected-store'},period:{from:'2026-10-20T04:00:00.000Z',to:'2026-10-21T04:00:00.000Z'},frequency:'DAILY',sourceFingerprint:'a'.repeat(64),financialFinality:'PROVISIONAL',financialLimitations:['SYNTHETIC_UNRECONCILED_FIXTURE'],financialReconciliationComplete:false,employeeLiabilityAdjusted:false,settingsVersion:1};
  const body=JSON.stringify(content),payload={format:content.format,scope:content.scope,period:content.period,frequency:content.frequency,sourceFingerprint:content.sourceFingerprint,financialFinality:content.financialFinality,financialLimitations:content.financialLimitations,contentType:'application/json; charset=utf-8',body,byteLength:Buffer.byteLength(body),payloadFingerprint:sha(body)};
  const input={...content.scope,reportType:'CASH',frequency:'DAILY',periodFrom:content.period.from,periodTo:content.period.to,recipient,snapshot:{settingsVersion:1,recipientVersion:2,consentRevision:3,lifecycleGeneration:'4',sourceFingerprint:payload.sourceFingerprint,payloadFingerprint:payload.payloadFingerprint,policyFingerprint:'c'.repeat(64),principalId:'synthetic-principal',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
  const pending=createDeliverySlot(input,{now:NOW,current:eligibility(input,NOW)}),claimed=claimDelivery(pending,{expectedVersion:1,token:'driver-one',now:NOW,leaseMs:1000});
  return {claimed,args:{scope:{...content.scope,slotId:claimed.slotId},expectedVersion:claimed.version,token:claimed.token,payload}};
}
function eligibility(input,now){return {...copy(input),checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};}
const accepted=()=>({accepted:[recipient],rejected:[],messageId:'<synthetic-driver@example.invalid>'});
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function harness({send,gate,commitBarrier,failStartCommit,failCompletion,failCompletionAfterCommit}={}){
  const data=fixtureData(),events=[],committedVersions=new Set(),commitReached=deferred();let state=copy(data.claimed),now=NOW,sends=0,transactions=0;
  // Serialize transactions to model the real row/CAS boundary. Every transition
  // uses the production repository's SQL parameters and lifecycle implementation.
  let tail=Promise.resolve();
  const db={$transaction:async fn=>{
    const previous=tail,done=deferred();tail=done.promise;await previous;
    const before=copy(state),number=++transactions;events.push('begin');
    const project=()=>({slotId:state.slotId,companyId:state.input.companyId,storeId:state.input.storeId,version:String(state.version),status:state.status,token:state.token,record:copy(state)});
    const tx={$queryRaw:async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.startsWith('SELECT')){
        events.push(sql.includes('FOR UPDATE')?'lock':'probe');
        return state&&values[0]===state.input.companyId&&values[1]===state.input.storeId&&values[2]===state.slotId?[project()]:[];
      }
      assert.ok(sql.startsWith('UPDATE'),'unexpected query');
      assert.equal(values[4],state.input.companyId);assert.equal(values[5],state.input.storeId);assert.equal(values[6],state.slotId);
      assert.equal(values[7],BigInt(state.version));assert.equal(values[8],state.status);assert.equal(values[9],state.token);assert.deepEqual(JSON.parse(values[10]),state);
      const after=JSON.parse(values[3]);events.push(`persist-${after.status}`);
      if(after.status!=='ATTEMPTING'&&failCompletion)throw new Error('private completion SQL/password');
      state=after;return [project()];
    }};
    try{
      const result=await fn(tx);
      if(number===1&&commitBarrier){events.push('await-commit');commitReached.resolve();await commitBarrier.promise;}
      if(number===1&&failStartCommit==='rollback')throw new Error('private start commit rollback');
      events.push('commit');committedVersions.add(state.version);
      if(number===1&&failStartCommit==='ambiguous')throw Object.assign(new Error('private ambiguous start commit'),{committed:true});
      if(state.status!=='ATTEMPTING'&&failCompletionAfterCommit)throw Object.assign(new Error('private ambiguous completion commit'),{committed:true});
      return result;
    }catch(error){if(!error.committed){state=before;events.push('rollback');}throw error;}finally{done.resolve();}
  }};
  const readEligibility=async({input,now:checkedAt})=>{events.push('eligibility');return gate?await gate(input,checkedAt):eligibility(input,checkedAt);};
  const driver=createAutomaticReportDeliveryDriver({db,readEligibility,clock:()=>now,sendMail:async message=>{sends++;events.push('send');assert.equal(state.status,'ATTEMPTING');assert.ok(committedVersions.has(state.version),'send requires a committed ATTEMPTING version');assert.equal(message.to,recipient);assert.equal(message.text,data.args.payload.body);return send?await send(message):accepted();}});
  const repository=createAutomaticReportDeliveryRepository({db,readEligibility});
  return {...data,driver,repository,events,db,commitReached:commitReached.promise,record:()=>copy(state),sends:()=>sends,time:value=>{now=value;}};
}
const unknown=(reason,recorded=false)=>({outcome:'UNKNOWN',recorded,recoveryRequired:!recorded,automaticRetryAllowed:false,reason});

test('real repository start commits before exactly one transport call and accepted completion commits before return',async()=>{
  const h=harness(),result=await h.driver.attempt(h.args);
  assert.deepEqual(result,{outcome:'ACCEPTED',recorded:true,recoveryRequired:false,automaticRetryAllowed:false,reason:'RECIPIENT_ACCEPTED'});assert.ok(Object.isFrozen(result));
  assert.deepEqual(h.events,['begin','probe','eligibility','lock','persist-ATTEMPTING','commit','send','begin','lock','persist-ACCEPTED','commit']);
  assert.equal(h.record().version,4);assert.equal(h.record().messageId,accepted().messageId);assert.equal(h.sends(),1);
});
test('unresolved commit barrier permits zero sends until actual repository transaction resolution',{timeout:5000},async()=>{
  const barrier=deferred(),h=harness({commitBarrier:barrier});const operation=h.driver.attempt(h.args);
  await h.commitReached;
  assert.equal(h.sends(),0);barrier.resolve();assert.equal((await operation).outcome,'ACCEPTED');assert.equal(h.sends(),1);
});
test('transport rejection, exception and contradictory evidence persist terminal UNKNOWN once',async()=>{
  for(const send of [async()=>{throw new Error('private SMTP/password');},async()=>({accepted:[],rejected:[recipient],messageId:'private'}),async()=>({accepted:[recipient],rejected:[],pending:[recipient],messageId:'private'})]){
    const h=harness({send}),result=await h.driver.attempt(h.args);assert.equal(result.outcome,'UNKNOWN');assert.equal(result.recorded,true);assert.equal(result.recoveryRequired,false);assert.equal(h.record().status,'UNKNOWN');assert.equal(h.record().messageId,null);assert.equal(h.sends(),1);assert.doesNotMatch(JSON.stringify(result),/private|password/);
    assert.equal((await h.driver.attempt(h.args)).outcome,'UNKNOWN');assert.equal(h.sends(),1);
  }
});
test('revocation, gate error and stale version/token/scope refuse transport without changing claimed record',async()=>{
  for(const mode of ['revoked','gate-error','version','token','scope']){
    const h=harness({gate:mode==='revoked'?async(i,n)=>({...eligibility(i,n),consentActive:false}):mode==='gate-error'?async()=>{throw new Error('private gate');}:undefined}),before=h.record(),args=copy(h.args);
    if(mode==='version')args.expectedVersion++;if(mode==='token')args.token='foreign';if(mode==='scope')args.scope.slotId='f'.repeat(64);
    const result=await h.driver.attempt(args);assert.equal(result.outcome,'UNKNOWN');assert.equal(result.recorded,false);assert.equal(h.sends(),0);assert.deepEqual(h.record(),before);assert.doesNotMatch(JSON.stringify(result),/private/);
  }
});
test('start rollback and ambiguous committed start never call transport or automatically recover',async()=>{
  for(const mode of ['rollback','ambiguous']){
    const h=harness({failStartCommit:mode});assert.deepEqual(await h.driver.attempt(h.args),unknown('START_UNCONFIRMED'));assert.equal(h.sends(),0);assert.equal(h.record().status,mode==='rollback'?'CLAIMED':'ATTEMPTING');
  }
});
test('completion rollback and ambiguous commit return redacted uncertainty and a repeated attempt cannot resend',async()=>{
  for(const options of [{failCompletion:true},{failCompletionAfterCommit:true}]){
    const h=harness(options);assert.deepEqual(await h.driver.attempt(h.args),unknown('COMPLETION_UNCONFIRMED'));assert.equal(h.record().status,options.failCompletion?'ATTEMPTING':'ACCEPTED');assert.equal(h.sends(),1);
    assert.deepEqual(await h.driver.attempt(h.args),unknown('START_UNCONFIRMED'));assert.equal(h.sends(),1);
  }
});
test('two concurrent calls with one version/token have one winner and one transport invocation',async()=>{
  const h=harness(),results=await Promise.all([h.driver.attempt(copy(h.args)),h.driver.attempt(copy(h.args))]);assert.equal(results.filter(r=>r.outcome==='ACCEPTED').length,1);assert.equal(h.sends(),1);assert.equal(h.record().status,'ACCEPTED');
});
test('driver captures caller metadata before async start and never redirects recipient/body or completion scope',async()=>{
  const barrier=deferred(),h=harness({commitBarrier:barrier}),args=copy(h.args),operation=h.driver.attempt(args);
  args.scope.storeId='foreign';args.payload.body='private replacement';args.token='foreign';barrier.resolve();assert.equal((await operation).outcome,'ACCEPTED');assert.equal(h.record().input.storeId,'selected-store');assert.equal(h.sends(),1);
});
test('malformed metadata and top/nested accessors reject before database or getter evaluation',async()=>{
  let reads=0;
  for(const change of [a=>a.now=NOW,a=>a.extra=true,a=>a.payload.body+=' ',a=>Object.defineProperty(a,'token',{enumerable:true,get(){reads++;return 'driver-one';}}),a=>Object.defineProperty(a.payload,'body',{enumerable:true,get(){reads++;return 'private';}})]){
    const h=harness(),args=copy(h.args);change(args);await assert.rejects(h.driver.attempt(args),{code:'INVALID_DELIVERY_REQUEST'});assert.equal(h.events.length,0);assert.equal(h.sends(),0);
  }assert.equal(reads,0);
});
test('lease expires while start commit is delayed: no send, no retry, explicit recovery to UNKNOWN only',{timeout:5000},async()=>{
  const barrier=deferred(),h=harness({commitBarrier:barrier}),operation=h.driver.attempt(h.args);
  await h.commitReached;
  h.time(later(1000));barrier.resolve();assert.deepEqual(await operation,unknown('COMPLETION_UNCONFIRMED'));assert.equal(h.sends(),0);assert.equal(h.record().status,'ATTEMPTING');
  const recovered=await h.repository.recover(h.args.scope,{expectedVersion:h.record().version,now:later(1000)});assert.equal(recovered.status,'UNKNOWN');assert.equal(h.sends(),0);
});
test('send accepted after lease expiry leaves ATTEMPTING for UNKNOWN recovery instead of claiming persisted success',async()=>{
  let h;h=harness({send:async()=>{h.time(later(1000));return accepted();}});assert.deepEqual(await h.driver.attempt(h.args),unknown('COMPLETION_UNCONFIRMED'));assert.equal(h.sends(),1);assert.equal(h.record().status,'ATTEMPTING');
});
test('backwards or invalid completion clocks never authorize retry or expose clock error',async()=>{
  for(const value of [later(-1),'invalid']){
    let h;h=harness({send:async()=>{h.time(value);return accepted();}});assert.deepEqual(await h.driver.attempt(h.args),unknown('COMPLETION_UNCONFIRMED'));assert.equal(h.sends(),1);assert.equal(h.record().status,'ATTEMPTING');
  }
  const h=harness();h.time('invalid');await assert.rejects(h.driver.attempt(h.args),{code:'INVALID_DELIVERY_REQUEST'});assert.equal(h.events.length,0);
});

function isolatedDatabaseUrl(value,mode){
  try{const u=new URL(value);return mode==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['127.0.0.1','localhost','postgres'].includes(u.hostname)&&/test/i.test(decodeURIComponent(u.pathname));}catch{return false;}
}
test('native driver fixture refuses production/nonlocal/non-test database URLs',()=>{
  for(const [url,mode] of [['postgresql://u:p@production.example/test','test'],['postgresql://u:p@localhost/live','test'],['postgresql://u:p@localhost/test','production'],['invalid','test'],['https://localhost/test','test']])assert.equal(isolatedDatabaseUrl(url,mode),false);
  assert.equal(isolatedDatabaseUrl('postgresql://u:p@127.0.0.1/driver_test','test'),true);
  if(process.env.CI)assert.ok(isolatedDatabaseUrl(process.env.DATABASE_URL,process.env.NODE_ENV),'full CI must execute the isolated native driver test');
});
test('native PostgreSQL driver proves cross-client committed start, terminal persistence and concurrent no-resend', {timeout:120000,skip:!isolatedDatabaseUrl(process.env.DATABASE_URL,process.env.NODE_ENV)},async t=>{
  const {PrismaClient}=await import('@prisma/client');
  const schema=`delivery_driver_test_${randomBytes(12).toString('hex')}`,admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);
  assert.match(schema,/^delivery_driver_test_[a-f0-9]{24}$/);url.searchParams.set('schema',schema);
  const a=new PrismaClient({datasources:{db:{url:url.toString()}}}),b=new PrismaClient({datasources:{db:{url:url.toString()}}});
  const readEligibility=async({input,now})=>eligibility(input,now),repo=createAutomaticReportDeliveryRepository({db:a,readEligibility});
  let created=false,sequence=0;
  const fresh=async()=>{
    const data=fixtureData(),input=copy(data.claimed.input);input.recipient=`native-${++sequence}@example.invalid`;
    const pending=(await repo.create({companyId:input.companyId,storeId:input.storeId},input,{now:NOW})).record;
    const scope={companyId:input.companyId,storeId:input.storeId,slotId:pending.slotId};
    const claimed=await repo.claim(scope,{expectedVersion:pending.version,token:`native-token-${sequence}`,now:NOW,leaseMs:1000});
    return {...data,args:{...data.args,scope,token:claimed.token,expectedVersion:claimed.version}};
  };
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
    await a.$executeRawUnsafe('CREATE TABLE "AutomaticReportDeliverySlot" ("slotId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"version" BIGINT NOT NULL,"status" TEXT NOT NULL,"token" TEXT,"record" JSONB NOT NULL)');
    await t.test('independent client sees committed ATTEMPTING during transport and durable ACCEPTED after return',async()=>{
      const data=await fresh();let sends=0;
      const driver=createAutomaticReportDeliveryDriver({db:a,readEligibility,clock:()=>NOW,sendMail:async message=>{
        sends++;const rows=await b.$queryRaw`SELECT "status","version","token" FROM "AutomaticReportDeliverySlot" WHERE "slotId"=${data.args.scope.slotId}`;
        assert.equal(rows.length,1);assert.equal(rows[0].status,'ATTEMPTING');assert.equal(rows[0].version,3n);assert.equal(rows[0].token,data.args.token);
        assert.equal(message.text,data.args.payload.body);return {accepted:[message.to],rejected:[],messageId:'<native-driver@example.invalid>'};
      }});
      const result=await driver.attempt(data.args);assert.equal(result.outcome,'ACCEPTED');assert.equal(result.recorded,true);
      assert.equal((await repo.get(data.args.scope)).status,'ACCEPTED');await driver.attempt(data.args);assert.equal(sends,1);
    });
    await t.test('transport exception persists UNKNOWN without retry',async()=>{
      const data=await fresh();let sends=0;
      const driver=createAutomaticReportDeliveryDriver({db:a,readEligibility,clock:()=>NOW,sendMail:async()=>{sends++;throw new Error('synthetic transport uncertainty');}});
      const result=await driver.attempt(data.args);assert.equal(result.outcome,'UNKNOWN');assert.equal(result.recorded,true);assert.equal((await repo.get(data.args.scope)).status,'UNKNOWN');await driver.attempt(data.args);assert.equal(sends,1);
    });
    await t.test('two real clients racing one claimed record invoke transport only once',async()=>{
      const data=await fresh();let sends=0;
      const sendMail=async message=>{sends++;return {accepted:[message.to],rejected:[],messageId:'<native-race@example.invalid>'};};
      const make=db=>createAutomaticReportDeliveryDriver({db,readEligibility,clock:()=>NOW,sendMail});
      const results=await Promise.all([make(a).attempt(copy(data.args)),make(b).attempt(copy(data.args))]);assert.equal(sends,1);assert.equal(results.filter(r=>r.outcome==='ACCEPTED').length,1);assert.equal((await repo.get(data.args.scope)).status,'ACCEPTED');
    });
  }finally{
    await Promise.allSettled([a.$disconnect(),b.$disconnect()]);
    try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);}finally{await admin.$disconnect();}
  }
});

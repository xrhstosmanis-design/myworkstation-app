import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {PrismaClient} from "@prisma/client";
const db=new PrismaClient(),base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const isolated=(()=>{try{const database=new URL(process.env.DATABASE_URL),http=new URL(base);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(database.hostname)&&/test/i.test(database.pathname)&&['localhost','127.0.0.1'].includes(http.hostname)}catch{return false}})();
if(!isolated)throw new Error('Isolated localhost test database and HTTP server required.');
async function request(path,{token,method="GET",body}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json()};
}
try{
  // This fixture runs only in the isolated CI database, never against production.
  const company=await db.company.create({data:{name:"CI RBS installation",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
  const store=await db.store.create({data:{name:"CI single RBS",companyId:company.id}}),sibling=await db.store.create({data:{name:"CI sibling",companyId:company.id}});
  const admin=await db.user.create({data:{email:`rbs-install-${company.id}@unit.test`,fullName:"CI RBS Super Admin",role:"SUPER_ADMIN",companyId:company.id,passwordHash:"isolated-fixture-no-login",mustChangePassword:false}});
  const session=await db.userSession.create({data:{userId:admin.id,expiresAt:new Date(Date.now()+86400000)}});
  const token=jwt.sign({id:admin.id,email:admin.email,companyId:company.id,role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true,sessionId:session.id,sessionVersion:admin.sessionVersion},process.env.JWT_SECRET,{expiresIn:"5m"});
  const root=`/api/platform/companies/${company.id}/stores/${store.id}`;
  const terminal=await request(root+"/installation-terminals",{token,method:"POST",body:{terminalPos:"POS-01",displayName:"Single POS"}});assert.equal(terminal.status,201,JSON.stringify(terminal.body));
  const routing={fiscalDevices:[{deviceCode:"RBS-01",displayName:"One RBS",terminalPos:"POS-01",active:true}],eftposDevices:[{deviceCode:"CARD-01",displayName:"One EFTPOS",fiscalDeviceCode:"RBS-01",role:"STORE",active:true}]};
  assert.equal((await request(root+"/device-routing",{token,method:"PUT",body:routing})).status,200);
  const form={terminalPos:"POS-01",cashCode:"4",cardCode:"8",deliveryCode:"",workFolder:"C:\\capture",confirmed:true};
  assert.equal((await request(root+"/rbs-installation",{method:"PUT",body:form})).status,401);
  const ownerToken=jwt.sign({id:admin.id,companyId:company.id,role:"OWNER",isSuperAdmin:false},process.env.JWT_SECRET,{expiresIn:"5m"});
  assert.equal((await request(root+"/rbs-installation",{token:ownerToken,method:"PUT",body:form})).status,403);
  assert.equal((await request(`/api/platform/companies/foreign-company/stores/${store.id}/rbs-installation`,{token,method:"PUT",body:form})).status,404);
  assert.equal((await request(root+"/rbs-installation",{token,method:"PUT",body:{...form,deliveryCode:"3"}})).status,409,"Missing Delivery must not fall back to STORE");
  const saved=await request(root+"/rbs-installation",{token,method:"PUT",body:form});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.physicalTestConfirmed,false);
  const read=await request(root+"/rbs-installation/POS-01",{token});assert.equal(read.status,200);assert.equal(read.body.settings.cardCode,"8");assert.equal(read.body.connectorAllowed,false,"Configuration must not activate a licensed module");
  const other=await request(`/api/platform/companies/${company.id}/stores/${sibling.id}/rbs-installation/POS-01`,{token});assert.equal(other.body.settings,null,"Settings leaked to a sibling store");
  const packageResult=await request(root+"/rbs-installation/POS-01/package",{token,method:"POST",body:{apiBase:"https://unit.test"}});assert.equal(packageResult.status,200,JSON.stringify(packageResult.body));assert.equal(packageResult.body.containsCredentials,false);
  const guidedPath=root+"/rbs-installation/POS-01/guided-package";
  assert.equal((await request(guidedPath,{method:"POST",body:{apiBase:"https://unit.test"}})).status,401);
  assert.equal((await request(guidedPath,{token:ownerToken,method:"POST",body:{apiBase:"https://unit.test"}})).status,403);
  assert.equal((await request(`/api/platform/companies/foreign-company/stores/${store.id}/rbs-installation/POS-01/guided-package`,{token,method:"POST",body:{apiBase:"https://unit.test"}})).status,404);
  const guided=await request(guidedPath,{token,method:"POST",body:{apiBase:"https://unit.test"}});
  assert.equal(guided.status,200,JSON.stringify(guided.body));assert.equal(guided.body.guided,true);assert.equal(guided.body.containsCredentials,false);assert.equal(guided.body.startsWriterAutomatically,false);assert.match(guided.body.fileName,/\.cmd$/);
  const audit=await db.authAudit.count({where:{userId:admin.id,event:"STORE_RBS_INSTALLATION_CONFIRMED"}});assert.equal(audit,1);
  const changed={...routing,eftposDevices:[{...routing.eftposDevices[0],deviceCode:"CARD-NEW"}]};assert.equal((await request(root+"/device-routing",{token,method:"PUT",body:changed})).status,200);
  assert.equal((await request(root+"/rbs-installation/POS-01",{token})).status,409,"Changing equipment must invalidate old payment configuration");
  assert.equal((await request(guidedPath,{token,method:"POST",body:{apiBase:"https://unit.test"}})).status,409,"Guided package must reject stale equipment too");
  assert.equal((await request(root+"/rbs-installation",{token,method:"PUT",body:form})).status,200);
  assert.equal((await request(root+"/installation-terminals",{token,method:"POST",body:{terminalPos:"POS-02",displayName:"Second POS"}})).status,201);
  assert.equal((await request(root+"/rbs-installation/POS-01/package",{token,method:"POST",body:{apiBase:"https://unit.test"}})).status,200,"Selected confirmed register can be packaged independently of a home/test terminal");
  assert.equal((await request(guidedPath,{token,method:"POST",body:{apiBase:"https://unit.test"}})).status,200);
  const twoRouting={fiscalDevices:[routing.fiscalDevices[0],{deviceCode:"RBS-02",displayName:"Second RBS",terminalPos:"POS-02",active:true}],eftposDevices:[changed.eftposDevices[0],{deviceCode:"CARD-02",displayName:"Register2 EFTPOS",fiscalDeviceCode:"RBS-02",role:"STORE",active:true},{deviceCode:"DELIVERY-02",displayName:"Register2 delivery EFTPOS",fiscalDeviceCode:"RBS-02",role:"DELIVERY",active:true}]};
  assert.equal((await request(root+"/device-routing",{token,method:"PUT",body:twoRouting})).status,200);
  assert.equal((await request(root+"/rbs-installation",{token,method:"PUT",body:{...form,terminalPos:"POS-02",cashCode:"6",cardCode:"2",deliveryCode:"3"}})).status,200);
  // Central names/modes persist independently for both registers; no fiscal command.
  const custom={...twoRouting,eftposDevices:twoRouting.eftposDevices.map(row=>({...row,displayName:row.role==='DELIVERY'?'Φορητό άμεσο':row.displayName,transactionMode:row.fiscalDeviceCode==='RBS-01'?'DEFERRED':'IMMEDIATE'}))};
  assert.equal((await request(root+'/device-routing',{token,method:'PUT',body:custom})).status,200);
  const reread=await request(root+'/device-routing',{token});assert.deepEqual(reread.body.eftposDevices.map(x=>[x.deviceCode,x.transactionMode]).sort(),custom.eftposDevices.map(x=>[x.deviceCode,x.transactionMode]).sort());
  assert.equal((await request(root+'/device-routing',{token,method:'PUT',body:twoRouting})).status,200,'Legacy mapping caller omits mode');
  const preservedModes=await request(root+'/device-routing',{token});assert.deepEqual(preservedModes.body.eftposDevices.map(x=>[x.deviceCode,x.transactionMode]).sort(),custom.eftposDevices.map(x=>[x.deviceCode,x.transactionMode]).sort());
  assert.equal((await request(root+'/device-routing',{token,method:'PUT',body:custom})).status,200);
  const choicePath=`/api/store-pos/stores/${store.id}/payment-terminals`;
  const choicesOne=await request(choicePath+'?mwsTerminal=POS-01',{token}),choicesTwo=await request(choicePath+'?mwsTerminal=POS-02',{token});
  assert.equal(choicesOne.status,200,JSON.stringify(choicesOne.body));assert.equal(choicesTwo.status,200,JSON.stringify(choicesTwo.body));
  assert.equal(choicesOne.body.fiscalDisplayName,'One RBS');assert.deepEqual(choicesOne.body.choices.map(x=>x.operationChannel),['COUNTER_DELAYED']);
  assert.equal(choicesTwo.body.choices.find(x=>x.displayName==='Φορητό άμεσο').operationChannel,'SECONDARY_IMMEDIATE');
  assert.equal(choicesTwo.body.choices.some(x=>x.deviceCode==='CARD-NEW'),false);
  assert.equal((await request(choicePath+'?mwsTerminal=FOREIGN',{token})).status,409);
  assert.equal((await request(choicePath)).status,401);
  assert.equal((await request(root+'/device-routing',{token,method:'PUT',body:{...custom,eftposDevices:custom.eftposDevices.map(x=>({...x,transactionMode:'INVALID'}))}})).status,400);
  const secondPackage=await request(root+"/rbs-installation/POS-02/guided-package",{token,method:"POST",body:{apiBase:"https://unit.test"}});
  assert.equal(secondPackage.status,200,JSON.stringify(secondPackage.body));assert.match(secondPackage.body.fileName,/POS-02/);
  await db.companyModule.create({data:{companyId:company.id,moduleKey:"CONNECTOR_RBS",active:true}});
  async function pairWriter(terminalPos,extra={}){
    const code=await request(`/api/cloud/v1/stores/${store.id}/pairing-code`,{token,method:"POST",body:{}});
    assert.equal(code.status,201,JSON.stringify(code.body));
    return request('/api/cloud/v1/pair',{method:"POST",body:{code:code.body.code,deviceName:'Isolated CI Writer',platform:'WINDOWS_RBS_CAPDRIVER_V1',expectedStoreId:store.id,...(terminalPos?{terminalPos}:{}),...extra}});
  }
  const one=await pairWriter('POS-01'),two=await pairWriter('POS-02'),legacy=await pairWriter(null);
  for(const result of [one,two,legacy])assert.equal(result.status,201,JSON.stringify(result.body));
  const next='/api/cloud/v1/device/rbs-capdriver-v1/next',status='/api/cloud/v1/device/rbs-capdriver-v1/status';
  assert.equal((await request(status,{token:legacy.body.token,method:'POST',body:{}})).status,409,'Unbound legacy writer cannot choose between two registers');
  const oneStatus=await request(status,{token:one.body.token,method:'POST',body:{terminalPos:'POS-02'}});
  assert.equal(oneStatus.body.terminalPos,'POS-01','A request body cannot replace signed terminal authorization');
  const forged=await request('/api/cloud/v1/device/heartbeat',{token:one.body.token,method:'POST',body:{metadata:{rbsCapDriverBinding:{terminalPos:'POS-02'},rbsCapDriverV1WriterPoll:true}}});assert.equal(forged.status,200);
  assert.equal((await request(status,{token:one.body.token,method:'POST',body:{}})).body.terminalPos,'POS-01');
  assert.equal((await request(next,{token:one.body.token,method:'POST',body:{}})).status,200);
  const ids=['ci-rbs-other-'+company.id,'ci-rbs-own-'+company.id];
  for(const [i,terminalPos] of ['POS-02','POS-01'].entries())await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request" ("id","companyId","storeId","terminalPos","clientTransactionId","requestHash","paymentMethod","total","commandText","commandHash","createdAt") VALUES (${ids[i]},${company.id},${store.id},${terminalPos},${ids[i]},'ci','CARD',0.01,'CI NEVER DISPATCH','ci',NOW()+(${i}*INTERVAL '1 second'))`;
  const concurrent=await Promise.all([request(next,{token:one.body.token,method:'POST',body:{}}),request(next,{token:one.body.token,method:'POST',body:{}})]);
  assert.equal(concurrent.filter(r=>r.body.request).length,1,'Concurrent polling claims an own request once');
  assert.equal(concurrent.find(r=>r.body.request).body.request.id,ids[1],'Older foreign-terminal request must remain untouched');
  const untouched=await db.$queryRaw`SELECT "status","claimedByDeviceId" FROM "RbsCapDriverV1Request" WHERE "id"=${ids[0]}`;assert.equal(untouched[0].status,'PREPARED');assert.equal(untouched[0].claimedByDeviceId,null);
  const ownTwo=await request(next,{token:two.body.token,method:'POST',body:{}});assert.equal(ownTwo.body.request.id,ids[0]);assert.equal(ownTwo.body.request.terminalPos,'POS-02');
  const foreignAck=await request(`/api/cloud/v1/device/rbs-capdriver-v1/${ids[0]}/dispatch-result`,{token:one.body.token,method:'POST',body:{result:'UNCERTAIN'}});assert.equal(foreignAck.status,404);
  // No command is dispatched: these are isolated queue records, never a physical receipt.
  assert.equal((await request(root+'/rbs-installation',{token,method:'PUT',body:{...form,cardCode:'9'}})).status,200);
  assert.equal((await request(status,{token:one.body.token,method:'POST',body:{}})).status,409,'Changed confirmed settings invalidate the old signed binding');
  assert.equal((await request(status,{token:two.body.token,method:'POST',body:{}})).status,200,'Sibling register remains usable');
  assert.equal((await pairWriter('FOREIGN-POS')).status,409);
  const siblingRoot=`/api/platform/companies/${company.id}/stores/${sibling.id}`;
  assert.equal((await request(siblingRoot+'/installation-terminals',{token,method:'POST',body:{terminalPos:'SINGLE-01',displayName:'Legacy single-register control'}})).status,201);
  assert.equal((await request(siblingRoot+'/device-routing',{token,method:'PUT',body:{fiscalDevices:[{deviceCode:'SINGLE-RBS',displayName:'Single control',terminalPos:'SINGLE-01',active:true}],eftposDevices:[{deviceCode:'SINGLE-CARD',displayName:'Single card',fiscalDeviceCode:'SINGLE-RBS',role:'STORE',active:true}]}})).status,200);
  const legacyCode=await request(`/api/cloud/v1/stores/${sibling.id}/pairing-code`,{token,method:'POST',body:{}});
  const legacySingle=await request('/api/cloud/v1/pair',{method:'POST',body:{code:legacyCode.body.code,deviceName:'Old Diadochou-style control',platform:'WINDOWS_RBS_CAPDRIVER_V1'}});assert.equal(legacySingle.status,201);
  const singleStatus=await request(status,{token:legacySingle.body.token,method:'POST',body:{}});assert.equal(singleStatus.status,200);assert.equal(singleStatus.body.terminalPos,'SINGLE-01');
  const singleNext=await request(next,{token:legacySingle.body.token,method:'POST',body:{}});assert.equal(singleNext.status,200);assert.equal(singleNext.body.request,null);
  // A retained legacy Writer has no epoch header: only the server's locked
  // persisted request can authorize its new generation. No CAP file is written.
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreLifecycleFence" ("storeId" text PRIMARY KEY,"companyId" text NOT NULL,"generation" bigint NOT NULL DEFAULT 0,"maintenance" boolean NOT NULL DEFAULT false,"retired" boolean NOT NULL DEFAULT false,"operationId" text,"planHash" text NOT NULL)`);
  const oldPrepared='ci-old-epoch-'+company.id,freshPrepared='ci-new-epoch-'+company.id,guard='ci_rbs_epoch_'+company.id;
  for(const [id,epoch] of [[oldPrepared,'0'],[freshPrepared,'1']])await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request" ("id","companyId","storeId","terminalPos","clientTransactionId","requestHash","checkoutJson","paymentMethod","total","commandText","commandHash") VALUES (${id},${company.id},${store.id},'POS-02',${id},'ci',${JSON.stringify({lifecycleGeneration:epoch})}::jsonb,'CARD',0.01,'CI NEVER DISPATCH','ci')`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" ("storeId","companyId","generation","planHash") VALUES (${store.id},${company.id},1,${'e'.repeat(64)})`;
  const q=name=>'"'+String(name).replaceAll('"','""')+'"';
  try{
    await db.$executeRawUnsafe(`CREATE FUNCTION ${q(guard)}() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE expected text; BEGIN SELECT "generation"::text INTO expected FROM "StoreLifecycleFence" WHERE "storeId"=NEW."storeId"; IF expected IS NOT NULL AND COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),'')::jsonb->>NEW."storeId",'0')<>expected THEN RAISE EXCEPTION 'CI_UNTAGGED_DEVICE_MUTATION' USING ERRCODE='55000'; END IF; RETURN NEW; END $$`);
    for(const table of ['CloudDevice','RbsCapDriverV1Request'])await db.$executeRawUnsafe(`CREATE TRIGGER ${q(guard)} BEFORE INSERT OR UPDATE ON ${q(table)} FOR EACH ROW EXECUTE FUNCTION ${q(guard)}()`);
    const freshClaim=await request(next,{token:two.body.token,method:'POST',body:{}});assert.equal(freshClaim.status,200,JSON.stringify(freshClaim.body));assert.equal(freshClaim.body.request.id,freshPrepared);
    assert.equal((await request(next,{token:two.body.token,method:'POST',body:{}})).body.request,null,'Old prepared commands must not be promoted');
    const oldAck=await request(`/api/cloud/v1/device/rbs-capdriver-v1/${ids[0]}/dispatch-result`,{token:two.body.token,method:'POST',body:{result:'UNCERTAIN'}});assert.equal(oldAck.status,409);assert.equal(oldAck.body.code,'STORE_LIFECYCLE_STALE_GENERATION');
    const newAck=await request(`/api/cloud/v1/device/rbs-capdriver-v1/${freshPrepared}/dispatch-result`,{token:two.body.token,method:'POST',body:{result:'UNCERTAIN'}});assert.equal(newAck.status,200,JSON.stringify(newAck.body));assert.equal(newAck.body.request.status,'REQUIRES_CHECK');
    assert.equal((await db.$queryRaw`SELECT "status" FROM "RbsCapDriverV1Request" WHERE "id"=${oldPrepared}`)[0].status,'PREPARED');
    assert.equal((await request(next,{token:legacySingle.body.token,method:'POST',body:{}})).status,200,'Sibling legacy generation zero remains usable');
    await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"=${store.id}`;
    const paused=await request(next,{token:two.body.token,method:'POST',body:{}});assert.equal(paused.status,409);assert.equal(paused.body.code,'STORE_LIFECYCLE_MAINTENANCE');
  }finally{
    for(const table of ['CloudDevice','RbsCapDriverV1Request'])await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${q(guard)} ON ${q(table)}`);await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${q(guard)}()`);await db.$executeRaw`DELETE FROM "StoreLifecycleFence" WHERE "storeId"=${store.id}`;
  }
  await db.companyModule.updateMany({where:{companyId:company.id,moduleKey:'CONNECTOR_RBS'},data:{active:false}});
  assert.equal((await request(next,{token:two.body.token,method:'POST',body:{}})).status,403,'Module checks still precede claims');
  console.log("RBS installation HTTP E2E PASS: per-terminal packages, signed binding, concurrent exact-terminal claims, legacy multi-register denial, heartbeat forgery rejection, stale settings/module isolation and retained Writer epoch1 claims/acknowledgments with stale0 and maintenance refusal.");
}finally{await db.$disconnect()}

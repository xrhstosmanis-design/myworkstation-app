import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {PrismaClient} from "@prisma/client";

const base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080",dbUrl=new URL(process.env.DATABASE_URL);
assert.equal(process.env.NODE_ENV,"test");
assert.ok(["127.0.0.1","localhost"].includes(new URL(base).hostname));
assert.ok(["127.0.0.1","localhost"].includes(dbUrl.hostname));
assert.match(dbUrl.pathname,/test/i);
assert.ok(!process.env.OPENAI_BILLING_ADMIN_KEY,"This isolated flow must not have real billing credentials");
const db=new PrismaClient();
const request=async(token,body)=>{
  const res=await fetch(base+"/api/platform/ai-credits",{method:body?"PUT":"GET",redirect:"error",headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  return {status:res.status,body:await res.json()};
};
try{
  const company=await db.company.create({data:{name:"CI AI credit monitor",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
  const admin=await db.user.create({data:{email:`credits-${company.id}@unit.test`,fullName:"CI monitor admin",role:"SUPER_ADMIN",companyId:company.id,passwordHash:"isolated-no-login",mustChangePassword:false}});
  const session=await db.userSession.create({data:{userId:admin.id,expiresAt:new Date(Date.now()+86400000)}});
  const claims={id:admin.id,email:admin.email,companyId:company.id,role:"OWNER"};
  const token=jwt.sign({...claims,isSuperAdmin:true,platformRole:"SUPER_ADMIN",sessionId:session.id,sessionVersion:admin.sessionVersion},process.env.JWT_SECRET,{expiresIn:"5m"});
  const owner=jwt.sign(claims,process.env.JWT_SECRET,{expiresIn:"5m"});
  assert.equal((await request()).status,401);assert.equal((await request(owner)).status,403);
  const initial=await request(token);assert.equal(initial.status,200);assert.equal(initial.body.state,"UNKNOWN");assert.equal(initial.body.balanceUsd,null);assert.equal(initial.body.code,"BILLING_NOT_CONFIGURED");
  const version=initial.body.version;
  assert.equal((await request(owner,{warningUsd:10,criticalUsd:3,version})).status,403);
  assert.equal((await request(token,{warningUsd:2,criticalUsd:5,version})).status,400);
  assert.equal((await request(token,{warningUsd:5,criticalUsd:2,version,balanceUsd:20,accountConfirmed:true})).status,503);
  assert.equal((await request(token)).body.version,version,"Failed balance setup cannot change settings");
  const results=await Promise.all([request(token,{warningUsd:10,criticalUsd:3,version}),request(token,{warningUsd:12,criticalUsd:4,version})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  const persisted=await request(token);assert.equal(persisted.body.version,version+1);
  const rows=await db.$queryRaw`SELECT "settings","version","updatedBy" FROM "PlatformAiCreditMonitor" WHERE "id"='OPENAI_ORGANIZATION'`;
  assert.equal(rows[0].version,version+1);assert.equal(rows[0].updatedBy,admin.id);
  assert.equal(rows[0].settings.warningUsd,persisted.body.warningUsd);
  assert.equal(await db.authAudit.count({where:{userId:admin.id,event:"AI_CREDIT_MONITOR_CONFIGURED"}}),1,"Exactly one successful configuration is audited");
  assert.equal(persisted.body.balanceUsd,null);assert.doesNotMatch(JSON.stringify(persisted.body),/keyIdentity|apiKey|baselineCostUsd/);
  await db.userSession.update({where:{id:session.id},data:{revokedAt:new Date()}});
  assert.equal((await request(token)).status,401,"Revoked Platform session cannot read billing settings");
  console.log("AI credit monitor isolated PostgreSQL/HTTP PASS: authorization, persistence, Audit, concurrent version conflict, missing billing configuration and session revocation. No provider calls or business transactions.");
}finally{await db.$disconnect()}

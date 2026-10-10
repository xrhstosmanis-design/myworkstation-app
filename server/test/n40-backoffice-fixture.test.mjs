import test from "node:test";
import assert from "node:assert/strict";
import {createN40FixtureHandlers} from "../src/services/n40-backoffice-fixture.mjs";
import {N40_FIXTURE} from "../../shared/n40-backoffice-fixture.mjs";
const password="isolated-test-value";
function setup({storePatch={},existing=null,createError=null}={}){
  const writes=[],hashes=[];
  const store={id:N40_FIXTURE.storeId,name:"ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",active:true,companyId:N40_FIXTURE.companyId,company:{name:"MYWORKSTATION LAB",active:true},...storePatch};
  const db={store:{findUnique:async()=>store},user:{findUnique:async()=>existing,create:async args=>{if(createError)throw createError;writes.push(args.data);const {passwordHash,...safe}=args.data;return{id:"fixture-user",...safe};}},authAudit:{create:async args=>writes.push(args.data)}};
  const prisma={...db,$transaction:async fn=>fn(db)};
  const handlers=createN40FixtureHandlers({prisma,hash:async(value,cost)=>{hashes.push({value,cost});return"one-way-test-hash";}});
  const req={user:{id:"sa-user",email:"fixture-admin@example.invalid",tokenType:"BACKOFFICE_USER",isSuperAdmin:true,platformRole:"SUPER_ADMIN"},body:{password,confirmPassword:password}};
  const output={status:200},res={status(n){output.status=n;return this;},json(value){output.body=value;return this;}},next=error=>{output.error=error;};
  return{handlers,req,res,next,output,writes,hashes};
}
test("only the fixed EMPLOYEE is created, hashed and safely returned",async()=>{
  const s=setup();await s.handlers.create(s.req,s.res,s.next);
  assert.equal(s.output.status,201);assert.equal(s.writes.length,2);
  assert.deepEqual(s.writes[0],{email:N40_FIXTURE.email,fullName:N40_FIXTURE.fullName,role:"EMPLOYEE",companyId:N40_FIXTURE.companyId,passwordHash:"one-way-test-hash",mustChangePassword:true});
  assert.equal(s.hashes[0].cost,12);assert.ok(!JSON.stringify(s.output.body).includes(password));assert.ok(!JSON.stringify(s.output.body).includes("passwordHash"));assert.ok(!JSON.stringify(s.writes[1]).includes(password));
});
for(const user of [{tokenType:"BACKOFFICE_USER",role:"EMPLOYEE"},{tokenType:"STORE_OPERATOR",isSuperAdmin:true},null])test(`unauthorized actor cannot read or create (${user?.tokenType||"missing"})`,async()=>{
  const s=setup();s.req.user=user;await s.handlers.create(s.req,s.res,s.next);assert.equal(s.output.error.status,403);assert.equal(s.hashes.length,0);assert.equal(s.writes.length,0);await s.handlers.read(s.req,s.res,s.next);assert.equal(s.output.error.status,403);
});
for(const patch of [{active:false},{companyId:"another-company"},{name:"ΕΡΓΑΣΤΗΡΙΟ ΑΠΟΜΟΝΩΣΗΣ ΕΤΙΚΕΤΑΣ"},{company:{name:"MYWORKSTATION LAB",active:false}},{company:{name:"Another company",active:true}}])test(`exact active LAB required (${JSON.stringify(patch)})`,async()=>{
  const s=setup({storePatch:patch});await s.handlers.create(s.req,s.res,s.next);assert.equal(s.output.error.status,409);assert.equal(s.writes.length,0);
});
test("existing account cannot be overwritten or reset",async()=>{const s=setup({existing:{id:"existing"}});await s.handlers.create(s.req,s.res,s.next);assert.equal(s.output.error.status,409);assert.equal(s.writes.length,0);});
test("database collision is a safe conflict",async()=>{const s=setup({createError:{code:"P2002"}});await s.handlers.create(s.req,s.res,s.next);assert.equal(s.output.status,409);assert.equal(s.writes.length,0);});
for(const body of [{password:"short",confirmPassword:"short"},{password,confirmPassword:"different"},{password,confirmPassword:password,role:"SUPER_ADMIN"},{password:"é".repeat(40),confirmPassword:"é".repeat(40)}])test("invalid credentials/extra privilege input cause no write",async()=>{const s=setup();s.req.body=body;await s.handlers.create(s.req,s.res,s.next);assert.equal(s.output.error.status,400);assert.equal(s.hashes.length,0);assert.equal(s.writes.length,0);});
test("status read makes no account or business mutation",async()=>{const s=setup();await s.handlers.read(s.req,s.res,s.next);assert.equal(s.output.body.exists,false);assert.equal(s.writes.length,0);assert.equal(s.hashes.length,0);});

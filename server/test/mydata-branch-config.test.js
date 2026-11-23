import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {z} from "zod";

test("owner-only myDATA mapping preserves zero, rejects stale edits and prevents duplicate installation codes",async()=>{
  const handlers=new Map(),audit=[];
  const router={
    get:(path,...steps)=>handlers.set("GET "+path,steps),
    put:(path,...steps)=>handlers.set("PUT "+path,steps)
  };
  const path="/documents/mydata/branch";
  const owner={id:"owner",companyId:"company",role:"OWNER",tokenType:"BACKOFFICE_USER"};
  const records=new Map(),stores=new Set(["a","b"]);
  let held=false;
  const prisma={
    authAudit:{create:async ({data})=>audit.push(data)},
    async $queryRaw(parts,...values){
      const sql=parts.join("");
      if(sql.includes("pg_advisory_xact_lock")){
        assert.equal(values[0],"mydata-branch-map:company");
        held=true;
        return [];
      }
      if(sql.includes('FROM "Store"'))return values[0]==="company"&&stores.has(values[1])?[{id:values[1]}]:[];
      assert.equal(held,true);
      const [,branch,storeId]=values;
      return [...records].filter(([id,code])=>id!==storeId&&code===branch).map(([id])=>({storeId:id}));
    },
    async $executeRaw(parts,...values){
      assert.equal(held,true);
      if(parts.join("").startsWith('DELETE'))records.delete(values[1]);
      else records.set(values[1],values[2]);
    },
    async $transaction(fn){try{return await fn(this)}finally{held=false}}
  };
  const source=readFileSync(new URL("../src/routes/commerce-mydata-branch.js",import.meta.url),"utf8")
    .replace(/^import .*;\n/gm,"").replace(/^export default router;\n/m,"");
  const run=new Function("Router","z","prisma","requireCompanyModule","ensureMyDataBranchSchema","readMyDataBranchForStore","lifecycleContext","assertLifecycleMutation",source);
  run(()=>router,z,prisma,()=>((_req,_res,next)=>next()),async()=>{},async (_db,_company,store)=>records.get(store)??null,()=>({}),async()=>{assert.equal(held,true)});

  async function invoke(method,body,user=owner){
    let status=200,result;
    const req={user,body,query:{storeId:body.storeId}};
    const res={status(code){status=code;return this},set(){},json(value){result=value}};
    const steps=handlers.get(method+" "+path);
    async function step(index,cause){
      if(cause)throw cause;
      let following;
      await steps[index](req,res,error=>{following=step(index+1,error)});
      await following;
    }
    await step(0);
    return {status,result};
  }

  const expected=(storeId,branch,expectedBranch)=>({storeId,branch,expectedBranch});
  for(const user of [{...owner,role:"MANAGER"},{...owner,staffAccess:true},{...owner,supportContext:{}},{...owner,isSuperAdmin:true},{...owner,tokenType:"STORE_OPERATOR"}]){
    assert.equal((await invoke("PUT",expected("a",0,null),user)).status,403);
  }
  assert.equal((await invoke("GET",{storeId:"a"})).result.branch,null);
  assert.equal((await invoke("PUT",expected("a",0,null))).result.branch,0);
  assert.equal((await invoke("GET",{storeId:"a"})).result.branch,0);
  await assert.rejects(invoke("PUT",expected("b",0,null)),error=>error.code==="MYDATA_BRANCH_IN_USE");
  await assert.rejects(invoke("PUT",expected("a",1,null)),error=>error.code==="MYDATA_BRANCH_STALE");
  await assert.rejects(invoke("PUT",expected("foreign",1,null)),error=>error.code==="MYDATA_BRANCH_STORE_NOT_FOUND");
  assert.equal((await invoke("PUT",expected("a",null,0))).result.branch,null);
  assert.equal(records.size,0);
  assert.equal(audit.length,2);
});

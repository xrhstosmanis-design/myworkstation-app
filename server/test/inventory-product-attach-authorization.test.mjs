import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {z} from 'zod';

function stocktakeLineAdmission({deny=null,storeActive=true,finalized=false,replay=false}={}){
  const file=fs.readFileSync(new URL('../src/routes/inventory-v2.js',import.meta.url),'utf8');
  const start=file.indexOf('router.post("/stocktakes/:stocktakeId/lines"');
  const end=file.indexOf('\nrouter.delete("/stocktakes/:stocktakeId/count/:lineId"',start);
  assert.ok(start>=0&&end>start);
  const routeSource=file.slice(start,end),handlers=new Map(),grants=[];
  const router={post:(path,...functions)=>handlers.set(path,functions)};
  const stocktake={id:'take',companyId:'company',storeId:'store',status:'DRAFT'};
  let reads=0,inserts=0,otherWrites=0;
  const tx={
    $queryRaw:async strings=>{
      const sql=strings.join('?');
      if(sql.includes('FROM "Stocktake"')&&sql.includes('FOR UPDATE'))return [{id:'take',status:finalized?'FINALIZED':'DRAFT'}];
      if(sql.includes('FROM "Product" p JOIN "StoreProduct" sp')){
        reads++;
        assert.match(sql,/sp\."active"=true/);
        return storeActive?[{id:'product',costPrice:3,currentStock:7}]:[];
      }
      if(sql.includes('INSERT INTO "StocktakeLine"')){inserts++;return replay?[]:[{id:'new-line'}]};
      if(sql.includes('SELECT "id" FROM "StocktakeLine"'))return [{id:'original-line'}];
      throw Error('Unexpected SQL: '+sql);
    },
    $executeRaw:async()=>{otherWrites++;throw Error('Unexpected inventory write')}
  };
  const prisma={$transaction:fn=>fn(tx)};
  const owner=(req,res,next)=>req.user.role==='OWNER'?next():res.status(403).json({error:'Forbidden'});
  const lockDraftInventoryStocktake=async()=>{
    const rows=await tx.$queryRaw`SELECT "id","status" FROM "Stocktake" WHERE "id"=${stocktake.id} AND "companyId"=${stocktake.companyId} FOR UPDATE`;
    if(rows[0]?.status!=='DRAFT')throw Object.assign(new Error('Closed'),{status:409});
  };
  const requireStaffGrant=async(_tx,_user,store,cap)=>{
    grants.push(cap);assert.equal(store,'store');
    if(cap===deny)throw Object.assign(new Error('Grant revoked'),{status:403});
  };
  new Function('router','owner','stocktakeAccess','z','prisma','requireStaffGrant','lockDraftInventoryStocktake','id','n',routeSource)(
    router,owner,async()=>stocktake,z,prisma,requireStaffGrant,lockDraftInventoryStocktake,()=> 'new-line',value=>Number(value||0)
  );
  return {
    grants,
    async invoke(){
      const req={params:{stocktakeId:'take'},body:{productId:'product'},user:{role:'EMPLOYEE',staffAccess:true}};
      let status=200,data,error;
      const res={status(v){status=v;return this},json(x){data=x;return this}};
      for(const fn of handlers.get('/stocktakes/:stocktakeId/lines')){
        let next=false;
        await fn(req,res,e=>{if(e)error=e;else next=true});
        if(error||!next)break;
      }
      return {status:error?.status||status,data,error,reads,inserts,otherWrites};
    }
  };
}

test('staff attachment checks both transaction-time grants and rejects revocation before insert',async()=>{
  for(const denied of ['inventory.count','products.create']){
    const r=stocktakeLineAdmission({deny:denied}),x=await r.invoke();
    assert.equal(x.status,403);assert.equal(x.inserts,0);assert.equal(x.otherWrites,0);
    assert.equal(r.grants.includes(denied),true);
  }
  const r=stocktakeLineAdmission(),x=await r.invoke();
  assert.equal(x.status,201,x.error?.message);
  assert.deepEqual(r.grants,['inventory.count','products.create']);
  assert.equal(x.data?.lineId,'new-line');assert.equal(x.otherWrites,0);
});

test('staff attachment rejects inactive store product, finalized parent, and duplicate line replay',async()=>{
  const inactive=await stocktakeLineAdmission({storeActive:false}).invoke();
  assert.equal(inactive.status,404);assert.equal(inactive.inserts,0);assert.equal(inactive.otherWrites,0);
  const finalized=await stocktakeLineAdmission({finalized:true}).invoke();
  assert.equal(finalized.status,409);assert.equal(finalized.inserts,0);assert.equal(finalized.otherWrites,0);
  const replay=await stocktakeLineAdmission({replay:true}).invoke();
  assert.equal(replay.status,200);assert.equal(replay.data?.lineId,'original-line');assert.equal(replay.data?.existing,true);
  assert.equal(replay.otherWrites,0);
});

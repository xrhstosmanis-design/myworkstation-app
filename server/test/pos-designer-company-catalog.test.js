import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {AUDIENCE_KEYS,normalizeAudienceSettings} from "../../shared/pos-audience-settings.mjs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),{Router}=require("express"),{z}=require("zod");
const source=fs.readFileSync(new URL("../src/routes/platform-pos-designer-fixed.js",import.meta.url),"utf8");
function harness(prisma){const code=source.replace(/^import .*;\n/gm,"").replace("export default router;","return router;");return new Function("Router","z","prisma","auth","AUDIENCE_KEYS","normalizeAudienceSettings",code)(Router,z,prisma,(_q,_r,n)=>n(),AUDIENCE_KEYS,normalizeAudienceSettings);}
async function call(router,path,body={},method="post",query={}){const layer=router.stack.find(x=>x.route?.path===path&&x.route.methods[method]);assert.ok(layer);let result,error,status=200;const res={status(x){status=x;return this},json(x){result=x;return this}};await layer.route.stack[0].handle({body,query,user:{id:"super"},params:{}},res,e=>{error=e});return {result,error,status};}
const input={companyId:"company-A",quickKeys:[{productId:"water-id"}],categories:Array.from({length:14},(_,i)=>({label:"Category "+i,productIds:i===0?["beer-id"]:[]}))};
test("prepare uses company IDs and canonical product names without writes",async()=>{let values,writes=0;const router=harness({$queryRaw:async(_sql,...v)=>{values=v;return [{id:"water-id",name:"ΝΕΡΟ 500ML"},{id:"beer-id",name:"ΑΛΦΑ 330ML"}]},$transaction:async()=>writes++});const r=await call(router,"/prepare-company-layout",input);assert.equal(r.error,undefined);assert.equal(r.result.layout.catalogCompanyId,"company-A");assert.equal(r.result.layout.quickKeys.length,20);assert.equal(r.result.layout.quickKeys[0].productQuery,"water-id");assert.equal(r.result.layout.quickKeys[0].label,"ΝΕΡΟ 500ML");assert.deepEqual(r.result.layout.categories[0].productCodes,["beer-id"]);assert.equal(values[0],"company-A");assert.equal(writes,0);});
test("unknown, inactive or foreign IDs reject the whole import",async()=>{const router=harness({$queryRaw:async()=>[{id:"water-id",name:"Water"}]});const r=await call(router,"/prepare-company-layout",input);assert.equal(r.status,400);assert.ok(r.result.error);});
test("category limit is checked before reading products",async()=>{let reads=0;const router=harness({$queryRaw:async()=>{reads++;return []}});const body=structuredClone(input);body.categories[0].productIds=Array.from({length:41},(_,i)=>"id-"+i);const r=await call(router,"/prepare-company-layout",body);assert.equal(r.error?.name,"ZodError");assert.equal(reads,0);});
test("publication rejects another company before any transaction",async()=>{let writes=0;const router=harness({store:{findMany:async()=>[{id:"store-B",companyId:"company-B"}]},$queryRaw:async()=>[{layoutJson:{catalogCompanyId:"company-A"}}],$transaction:async()=>writes++});const r=await call(router,"/publish",{storeIds:["store-B"]});assert.match(r.error.message,/άλλης εταιρείας/);assert.equal(writes,0);});
test("legacy global layout still publishes only to explicit selected stores",async()=>{let target;const router=harness({store:{findMany:async()=>[{id:"selected",companyId:"company-B"}]},$queryRaw:async()=>[{layoutJson:{}}],$transaction:async f=>f({$executeRaw:async(_sql,...v)=>{target=v[0]}})});const r=await call(router,"/publish",{storeIds:["selected"]});assert.equal(r.error,undefined);assert.equal(r.result.publishedStores,1);assert.equal(target,"selected");});
test("company picker includes company scope and company ID as selected code",async()=>{let sql,values;const router=harness({$queryRaw:async(s,...v)=>{sql=s.join("?");values=v;return []}});const r=await call(router,"/company-products",{},"get",{companyId:"company-A",q:"332"});assert.equal(r.error,undefined);assert.match(sql,/p\."companyId"=\?/);assert.ok(values.includes("company-A"));assert.match(sql,/p\."id" AS "sourceCode"/);});

test("DAILY BITE screenshot preset resolves exact normalized company products without writes",async()=>{let reads=0,writes=0;const router=harness({$queryRaw:async()=>{reads++;if(reads===1)return[{id:"company-A",name:"DAILY BITE E E"}];return[{id:"p1",name:"ΜΠΑΛΑ ΠΟΔΟΣΦΑΙΡΟΥ"},{id:"p2",name:"ΜΠΑΛΑ ΒΟΛΕΥ"},{id:"p3",name:"ΜΠΑΛΑ ΜΙΚΡΗ"}]},$transaction:async()=>writes++});const r=await call(router,"/prepare-daily-bite-layout",{companyId:"company-A"});assert.equal(r.error,undefined);assert.equal(r.result.layout.catalogCompanyId,"company-A");assert.equal(r.result.layout.title,"DAILY BITE POS");assert.equal(r.result.layout.categories.length,14);assert.deepEqual(r.result.layout.categories[6].productCodes,["p1","p2","p3"]);assert.equal(r.result.layout.theme.accentColor,"#087a52");assert.equal(writes,0);assert.ok(r.result.missingProducts.length>0);});
test("DAILY BITE preset refuses another company before catalog read",async()=>{let reads=0;const router=harness({$queryRaw:async()=>{reads++;return[{id:"company-A",name:"OTHER COMPANY"}]}});const r=await call(router,"/prepare-daily-bite-layout",{companyId:"company-A"});assert.equal(r.status,400);assert.equal(reads,1);});

test("DAILY BITE coffee preview is read-only and pairs only unique coffee signatures",async()=>{let n=0,writes=0;const router=harness({$queryRaw:async()=>{n++;if(n===1)return[{id:"daily",name:"DAILY BITE E E"}];if(n===2)return[{id:"kat-store",companyId:"kat",name:"ΚΥΛΙΚΕΙΟ ΚΑΤ"}];if(n===3)return[{id:"k1",sku:"MWS-KAT-BEV-1",name:"FREDDO ESPRESSO"}];if(n===4)return[{id:"d1",sku:"DB1",name:"Freddo Espresso"}];if(n===5)return[{description:"ΖΑΧΑΡΗ",legacyId:1,sequence:10,modifierDescription:"ΣΚΕΤΟΣ",price:0}];return[]},$transaction:async()=>writes++});const r=await call(router,"/daily-bite-coffee-preview",{},"get",{companyId:"daily"});assert.equal(r.error,undefined);assert.equal(r.result.matched.length,1);assert.equal(r.result.matched[0].daily.id,"d1");assert.equal(r.result.katModifierGroups[0].description,"ΖΑΧΑΡΗ");assert.equal(r.result.mutated,false);assert.equal(writes,0);});
test("DAILY BITE coffee preview rejects another target company before KAT reads",async()=>{let reads=0;const router=harness({$queryRaw:async()=>{reads++;return[{id:"x",name:"OTHER"}]}});const r=await call(router,"/daily-bite-coffee-preview",{},"get",{companyId:"x"});assert.equal(r.status,400);assert.equal(reads,1);});

test("DAILY BITE coffee apply fails closed before writes when pair set is incomplete",async()=>{let reads=0,writes=0;const router=harness({$queryRaw:async()=>{reads++;if(reads===1)return[{id:"daily",name:"DAILY BITE E E"}];if(reads===2)return[{id:"kat-store",companyId:"kat",name:"ΚΥΛΙΚΕΙΟ ΚΑΤ"}];if(reads===3)return[{id:"k1",sku:"MWS-KAT-BEV-1",name:"FREDDO ESPRESSO"}];if(reads===4)return[];return[]},$transaction:async()=>writes++});const r=await call(router,"/daily-bite-coffee-apply",{companyId:"daily",confirm:"DAILY_BITE_COFFEE",renameProducts:true});assert.equal(r.status,409);assert.equal(writes,0);assert.match(r.result.error,/αμφίσημες|ελλιπείς/);});
test("DAILY BITE coffee apply requires explicit confirmation before reads",async()=>{let reads=0;const router=harness({$queryRaw:async()=>{reads++;return[]}});const r=await call(router,"/daily-bite-coffee-apply",{companyId:"daily",confirm:"NOPE"});assert.equal(r.status,400);assert.equal(reads,0);});

test("nested company import keeps sixteen groups and empty quick positions without writes",async()=>{
 const products=[{id:"water-id",name:"ΝΕΡΟ 500ML"},{id:"coffee-id",name:"FREDDO ESPRESSO"}];let writes=0;
 const router=harness({$queryRaw:async()=>products,$transaction:async()=>writes++});
 const body={companyId:"company-A",quickKeys:[{productId:"water-id"},{productId:null}],categories:Array.from({length:16},(_,i)=>({label:`Group ${i}`,productIds:[],...(i===0?{children:[{label:"Cold coffee",productIds:["coffee-id"]}]}:{})}))};
 const r=await call(router,"/prepare-company-layout",body);assert.equal(r.error,undefined);assert.equal(r.result.layout.categories.length,16);assert.equal(r.result.layout.quickKeys.length,20);assert.equal(r.result.layout.quickKeys[1].productQuery,"");assert.deepEqual(r.result.layout.quickKeys[1].productCodes,[]);assert.deepEqual(r.result.layout.categories[0].children[0].productCodes,["coffee-id"]);assert.equal(writes,0);
});
test("nested foreign product fails both import and publication before any write",async()=>{
 let writes=0;const layout={catalogCompanyId:"company-A",categories:[{id:"coffee",label:"Coffee",children:[{id:"cold",label:"Cold",productCodes:["foreign-id"]}]}]};
 const router=harness({store:{findMany:async()=>[{id:"store-A",companyId:"company-A"}]},$queryRaw:async sql=>sql.join("").includes("PlatformPosDraft")?[{layoutJson:layout}]:[],$transaction:async()=>writes++});
 const published=await call(router,"/publish",{storeIds:["store-A"]});assert.match(published.error.message,/κατάλογο/);assert.equal(writes,0);
 const prepared=await call(router,"/prepare-company-layout",{companyId:"company-A",quickKeys:[],categories:[{label:"Coffee",productIds:[],children:[{label:"Cold",productIds:["foreign-id"]}]}]});assert.equal(prepared.status,400);assert.equal(writes,0);
});
test("legacy beverage children and operator button labels survive store template roundtrip",async()=>{
 const child={id:"cold",label:"Cold",categoryName:"Cold::MWSMETA::legacy-sku",color:"#1597a5",visible:true};
 const old={quickKeys:[],categories:[{id:"coffee",label:"Coffee",categoryName:`Coffee::MWSCHILD::${encodeURIComponent(JSON.stringify([child]))}`,color:"#1597a5"}],buttons:[{id:"waste",label:"ΦΥΡΑ",color:"#76558e",action:"CASH"}]};
 let saved;
 const router=harness({store:{findUnique:async()=>({id:"store-A",companyId:"company-A",active:true})},$queryRaw:async(sql,...values)=>{if(sql.join("").includes("INSERT INTO")){saved=JSON.parse(values[0]);return[{version:2,layoutJson:saved}]}return[{version:1,layoutJson:old}]}});
 const get=router.stack.find(x=>x.route?.path==="/store/:storeId");let result,error;await get.route.stack[0].handle({params:{storeId:"store-A"}},{json:x=>{result=x},status(){return this}},e=>{error=e});assert.equal(error,undefined);
 assert.deepEqual(result.layout.categories[0].children[0].productCodes,["legacy-sku"]);assert.equal(result.layout.categories[0].categoryName,"Coffee");assert.equal(result.layout.categories.length,14);
 const draft=await call(router,"/draft",result.layout,"put");assert.equal(draft.error,undefined);assert.deepEqual(saved.categories[0].children[0].productCodes,["legacy-sku"]);const waste=saved.buttons.find(x=>x.id==="waste");assert.equal(waste.label,"ΦΥΡΑ");assert.equal(waste.action,"WASTE");
});
test("oversized category and nested product arrays reject before catalog reads",async()=>{
 let reads=0;const router=harness({$queryRaw:async()=>{reads++;return[]}});
 for(const categories of [Array.from({length:21},()=>({label:"Group",productIds:[]})),[{label:"Group",productIds:[],children:[{label:"Child",productIds:Array.from({length:41},(_,i)=>`p${i}`)}]}]]){
 const r=await call(router,"/prepare-company-layout",{companyId:"company-A",quickKeys:[],categories});assert.equal(r.error?.name,"ZodError");}
 assert.equal(reads,0);
});
test("direct existing-store publication uses version guard and never overwrites GLOBAL draft",async()=>{
 let sql,values;const router=harness({store:{findUnique:async()=>({id:"store-A",companyId:"company-A",active:true})},$queryRaw:async(s,...v)=>{sql=s.join("?");values=v;return[{version:12}]}});
 const layout={title:"POS",theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[]};
 const r=await call(router,"/publish-store-layout",{storeId:"store-A",expectedVersion:11,layout});assert.equal(r.error,undefined);assert.equal(r.result.version,12);assert.match(sql,/UPDATE "StorePosLayout"/);assert.match(sql,/AND "version"=\?/);assert.doesNotMatch(sql,/PlatformPosDraft/);assert.ok(values.includes("store-A"));assert.ok(values.includes("company-A"));assert.ok(values.includes(11));
 const stale=harness({store:{findUnique:async()=>({id:"store-A",companyId:"company-A",active:true})},$queryRaw:async()=>[]});const rejected=await call(stale,"/publish-store-layout",{storeId:"store-A",expectedVersion:11,layout});assert.equal(rejected.status,409);
});

const isolatedLayoutDatabase=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native PostgreSQL layout CAS permits one concurrent winner and preserves control, audience and GLOBAL",{skip:!isolatedLayoutDatabase()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),{randomUUID}=await import("node:crypto");const admin=new PrismaClient(),schema="pos_layout_"+randomUUID().replaceAll("-","");const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" bool)');
  await db.$executeRawUnsafe('CREATE TABLE "Product"("id" text primary key,"companyId" text,"active" bool,"salePrice" numeric,"vatRate" numeric,"stock" numeric)');
  await db.$executeRawUnsafe('CREATE TABLE "StorePosLayout"("storeId" text primary key,"companyId" text,"layoutJson" jsonb,"version" int,"publishedBy" text,"publishedAt" timestamp)');
  await db.$executeRawUnsafe('CREATE TABLE "PlatformPosDraft"("id" text primary key,"layoutJson" jsonb,"version" int)');
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store-A','company-A',true),('control','company-B',true)`;
  await db.$executeRaw`INSERT INTO "Product" VALUES ('coffee-id','company-A',true,1.65,13,-2),('foreign-id','company-B',true,9,24,4)`;
  await db.$executeRaw`INSERT INTO "StorePosLayout" VALUES ('store-A','company-A','{"audienceSettings":{"enabled":true},"title":"Before"}'::jsonb,11,'old',NOW()),('control','company-B','{"title":"Control"}'::jsonb,3,'other',NOW())`;
  await db.$executeRaw`INSERT INTO "PlatformPosDraft" VALUES ('GLOBAL','{"title":"Other owner draft"}'::jsonb,18)`;
  const protectedRead=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "Product" p) AS products,(SELECT jsonb_agg(to_jsonb(l) ORDER BY l."storeId") FROM "StorePosLayout" l WHERE l."storeId"='control') AS control,(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "PlatformPosDraft" d) AS draft`);
  const before=await protectedRead(),router=harness(db),layout={catalogCompanyId:"company-A",title:"New",quickKeys:[],categories:Array.from({length:16},(_,i)=>({id:`c${i}`,label:`Group ${i}`,color:"#1597a5",productCodes:[],children:i===0?[{id:"child",label:"Cold",categoryName:"Cold",color:"#1597a5",productCodes:["coffee-id"]}]:[]}))};
  const body={storeId:"store-A",expectedVersion:11,layout};
  const results=await Promise.all([call(router,"/publish-store-layout",body),call(router,"/publish-store-layout",{...body,layout:{...layout,title:"Concurrent"}})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.ok(results.every(r=>!r.error));
  const [saved]=await db.$queryRaw`SELECT * FROM "StorePosLayout" WHERE "storeId"='store-A'`;
  assert.equal(saved.version,12);assert.equal(saved.layoutJson.categories.length,16);assert.equal(saved.layoutJson.audienceSettings.enabled,true);assert.deepEqual(saved.layoutJson.categories[0].children[0].productCodes,["coffee-id"]);assert.equal(await protectedRead(),before);
  const foreign=structuredClone(body);foreign.expectedVersion=12;foreign.layout.categories[0].children[0].productCodes=["foreign-id"];
  const rejected=await call(router,"/publish-store-layout",foreign);assert.match(rejected.error.message,/κατάλογο/);assert.equal((await db.$queryRaw`SELECT "version" FROM "StorePosLayout" WHERE "storeId"='store-A'`)[0].version,12);assert.equal(await protectedRead(),before);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

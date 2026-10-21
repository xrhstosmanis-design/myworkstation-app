import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../src/kat-preparation-bootstrap.js',import.meta.url),'utf8');
const store={id:'synthetic-kat',companyId:'company-A',name:'Synthetic KAT'};
function bootstrap(raw){
 const prisma={
  $queryRaw:async(sql,...values)=>{const text=sql.join('?');if(text.includes('FROM "Store"'))return[store];if(text.includes('FROM "ProductCategory"')&&text.includes('ANY'))return[];if(text.includes('SELECT "id"'))return[{id:'synthetic-id'}];throw Error('unexpected fixture read '+text)},
  $executeRaw:async()=>0,$executeRawUnsafe:async()=>0,$queryRawUnsafe:raw
 };
 const code=source.replace(/^import .*;\n/gm,'').replace('export async function ensureKatPreparationSeed','async function ensureKatPreparationSeed');
 return new Function('prisma','crypto','ensureKatPreparationDefaults','executeHotTableBootstrap','lifecycleDemoSeedDisabled',code+'\nreturn ensureKatPreparationSeed;')(prisma,crypto,async()=>({ok:true}),async()=>0,async()=>false);
}
const reviewed=()=>({catalogCompanyId:'company-A',title:'Reviewed layout',quickKeys:[{id:'q',label:'Reviewed key',productCodes:['p'],color:'#1531a2'}],categories:Array.from({length:16},(_,i)=>({id:`c${i}`,label:`Reviewed group ${i}`,productCodes:['p'],children:i===0?[{id:'child',label:'Reviewed child',productCodes:['p']}]:[]}))});
test('actual KAT startup leaves a reviewed company-scoped POS layout and its version untouched',async()=>{
 const layout=reviewed(),before=JSON.stringify(layout);let writes=0;
 const run=bootstrap(async(sql,...values)=>{if(sql.startsWith('SELECT'))return[{layoutJson:layout}];writes++;throw Error('must not overwrite reviewed layout')});
 const result=await run();assert.equal(result.ok,true);assert.equal(writes,0);assert.equal(JSON.stringify(layout),before);
});
test('legacy unscoped startup still prepares its existing beverage roots',async()=>{
 const layout={categories:[{id:'legacy',label:'Legacy'}]},updates=[];
 const run=bootstrap(async(sql,...values)=>{if(sql.startsWith('SELECT'))return[{layoutJson:layout}];updates.push({sql,values});return[]});
 assert.equal((await run()).ok,true);assert.equal(updates.length,1);const saved=JSON.parse(updates[0].values[1]);assert.deepEqual(saved.categories.slice(0,3).map(x=>x.label),['ΚΑΦΕΣ','ΣΟΚΟΛΑΤΑ','ΤΣΑΙ']);assert.equal(saved.categories[3].label,'Legacy');assert.equal(layout.categories.length,1);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL startup layout fence preserves publication even when an old legacy read races it',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='kat_layout_'+crypto.randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await db.$executeRawUnsafe('CREATE TABLE "StorePosLayout"("storeId" text primary key,"layoutJson" jsonb,"version" int,"publishedAt" timestamptz)');
  await db.$executeRaw`INSERT INTO "StorePosLayout" VALUES ('synthetic-kat',${JSON.stringify(reviewed())}::jsonb,11,NOW()),('control','{"title":"Control"}'::jsonb,5,NOW())`;
  const read=async()=>JSON.stringify(await db.$queryRaw`SELECT * FROM "StorePosLayout" ORDER BY "storeId"`),before=await read();let updates=0;
  const scoped=bootstrap(async(sql,...values)=>{if(sql.startsWith('UPDATE'))updates++;return db.$queryRawUnsafe(sql,...values)});await scoped();assert.equal(updates,0);assert.equal(await read(),before);
  await db.$executeRaw`UPDATE "StorePosLayout" SET "layoutJson"='{"categories":[]}'::jsonb,"version"=20 WHERE "storeId"='synthetic-kat'`;
  let published;
  const racing=bootstrap(async(sql,...values)=>{const result=await db.$queryRawUnsafe(sql,...values);if(sql.startsWith('SELECT')){await db.$executeRaw`UPDATE "StorePosLayout" SET "layoutJson"=${JSON.stringify(reviewed())}::jsonb,"version"=21,"publishedAt"=NOW() WHERE "storeId"='synthetic-kat'`;published=await read()}return result});
  await racing();assert.equal(await read(),published);assert.equal((await db.$queryRaw`SELECT "version" FROM "StorePosLayout" WHERE "storeId"='synthetic-kat'`)[0].version,21);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

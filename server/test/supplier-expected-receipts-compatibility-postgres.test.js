import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {
 collectExpectedReceiptCatalog,
 validateExpectedReceiptCompatibility as validate
} from '../src/services/supplier-expected-receipts-compatibility.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/supplier-expected-receipts-compatibility.json',import.meta.url),'utf8'));
const tables=['SupplierExpectedReceiptLine','SupplierExpectedReceiptAllocation','SupplierExpectedReceiptOperation'];

// Shared with the local PostgreSQL-WASM check. Native CI passes the existing real
// setup function and a client confined to a fresh isolated schema.
export async function runExpectedReceiptCompatibilityRegression(db,{schema,ensureSchema}){
 const readOnly=client=>({
  $queryRawUnsafe:(sql,...values)=>{
   assert.match(sql,/^\s*SELECT\b/i,'catalog collector may execute SELECT only');
   return client.$queryRawUnsafe(sql,...values);
  }
 });
 const collect=client=>collectExpectedReceiptCatalog(readOnly(client),{schema});
 const missing=await collect(db);
 assert.equal(validate({catalog:missing}).status,'UNINSTALLED');
 await ensureSchema(db);
 const catalog=await collect(db);
 assert.equal(validate({catalog}).schemaStatus,'MATCH',JSON.stringify(catalog));
 for(const name of tables){
  const metadata=fixture.catalog.tables.find(table=>table.name===name);
  for(const row of fixture.rows[name]){
   const columns=metadata.columns.map(column=>column.name);
   const placeholders=metadata.columns.map((column,index)=>{
    assert.match(column.type,/^(text|integer|jsonb|timestamp with time zone|numeric\(\d+,\d+\))$/);
    return '$'+(index+1)+'::'+column.type;
   });
   const values=columns.map(column=>column==='result'?JSON.stringify(row[column]):row[column]);
   await db.$executeRawUnsafe(
    `INSERT INTO "${name}" (${columns.map(column=>'"'+column+'"').join(',')}) VALUES (${placeholders.join(',')})`,...values
   );
  }
 }
 const rows={};
 for(const name of tables){
  const metadata=catalog.tables.find(table=>table.name===name);
  rows[name]=(await db.$queryRawUnsafe(`SELECT * FROM "${name}"`)).map(row=>Object.fromEntries(
   metadata.columns.map(column=>{
    const value=row[column.name];
    if(value==null)return [column.name,null];
    if(column.type.startsWith('numeric'))return [column.name,value.toString()];
    if(column.type==='timestamp with time zone')return [column.name,new Date(value).toISOString()];
    return [column.name,value];
   })
  ));
 }
 const input={...structuredClone(fixture),catalog,rows};
 const fingerprint=async()=>{
  const contents=await Promise.all(tables.map(name=>db.$queryRawUnsafe(
   `SELECT COUNT(*)::int AS count,md5(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text)) AS digest FROM "${name}" t`
  )));
  return {contents,catalog:await collect(db)};
 };
 const before=await fingerprint();
 const result=validate(input);
 assert.equal(result.compatible,true,JSON.stringify(result));
 assert.equal(result.dataStatus,'VERIFIED');
 assert.equal(result.replayStatus,'VERIFIED');
 assert.equal(result.evidenceBoundary,'SUPPLIED_EVIDENCE_MATCH_ONLY');
 assert.equal(result.activationReady,false);
 const malformed=structuredClone(input);
 malformed.rows.SupplierExpectedReceiptOperation=[];
 malformed.operationEvidence=[];
 assert.equal(validate(malformed).dataStatus,'INVALID','restore cannot lose the operation journal');
 const missingProof=structuredClone(input);
 delete missingProof.entities.sourceEvidence;
 assert.equal(validate(missingProof).dataStatus,'UNVERIFIED');
 assert.deepEqual(await fingerprint(),before,'validation and catalog reads preserve actual rows and schema');

 const incompatibleChange=async(label,statements)=>{
  const rollback=new Error('Rollback isolated catalog mutation '+label);
  try{
   await db.$transaction(async tx=>{
    for(const statement of statements)await tx.$executeRawUnsafe(statement);
    const observed=await collect(tx);
    const outcome=validate({...input,catalog:observed});
    assert.equal(outcome.schemaStatus,'INCOMPATIBLE',label+': '+JSON.stringify(outcome));
    assert.equal(outcome.compatible,false,label);
    throw rollback;
   });
  }catch(error){if(error!==rollback)throw error}
  assert.deepEqual(await fingerprint(),before,'catalog mutation rolled back '+label);
 };
 await incompatibleChange('numeric precision',[
  'ALTER TABLE "SupplierExpectedReceiptLine" ALTER COLUMN "invoiceQuantity" TYPE NUMERIC(23,6)'
 ]);
 await incompatibleChange('default',[
  'ALTER TABLE "SupplierExpectedReceiptLine" ALTER COLUMN "cancelledQuantity" SET DEFAULT 1'
 ]);
 await incompatibleChange('nullability',[
  'ALTER TABLE "SupplierExpectedReceiptLine" ALTER COLUMN "productId" DROP NOT NULL'
 ]);
 await incompatibleChange('extra column',[
  'ALTER TABLE "SupplierExpectedReceiptLine" ADD COLUMN "unreviewed" TEXT'
 ]);
 await incompatibleChange('missing index',[
  'DROP INDEX "SupplierExpectedReceiptLine_scope"'
 ]);
 await incompatibleChange('foreign key action',[
  'ALTER TABLE "SupplierExpectedReceiptAllocation" DROP CONSTRAINT "SupplierExpectedReceiptAllocation_expectedLineId_fkey"',
  'ALTER TABLE "SupplierExpectedReceiptAllocation" ADD CONSTRAINT "SupplierExpectedReceiptAllocation_expectedLineId_fkey" FOREIGN KEY ("expectedLineId") REFERENCES "SupplierExpectedReceiptLine"("id") ON DELETE CASCADE'
 ]);
 await incompatibleChange('unreviewed incoming relation',[
  'CREATE TABLE "UnreviewedReceiptReference" ("id" TEXT PRIMARY KEY,"expectedLineId" TEXT REFERENCES "SupplierExpectedReceiptLine"("id"))'
 ]);
 await incompatibleChange('unlogged operation journal',[
  'ALTER TABLE "SupplierExpectedReceiptOperation" SET UNLOGGED'
 ]);
 await incompatibleChange('row security',[
  'ALTER TABLE "SupplierExpectedReceiptLine" ENABLE ROW LEVEL SECURITY'
 ]);
 await incompatibleChange('unvalidated extra constraint',[
  'ALTER TABLE "SupplierExpectedReceiptLine" ADD CONSTRAINT "unreviewed_quantity_check" CHECK ("cancelledQuantity"<=999) NOT VALID'
 ]);
 return {catalogMutations:10,verifiedRows:tables.reduce((count,name)=>count+rows[name].length,0)};
}

test('native PostgreSQL metadata and immutable receipt graph validation leave actual isolated sources unchanged',{
 skip:!process.env.DATABASE_URL,timeout:90000
},async()=>{
 const url=new URL(process.env.DATABASE_URL);
 assert.equal(process.env.NODE_ENV,'test');
 assert.ok(['localhost','127.0.0.1','[::1]','postgres'].includes(url.hostname));
 assert.match(url.pathname,/test/i);
 const {PrismaClient}=await import('@prisma/client');
 const {ensureExpectedReceiptSchema}=await import('../src/services/supplier-expected-receipts.js');
 const admin=new PrismaClient();
 const schema='no14_compat_'+randomBytes(8).toString('hex');
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('schema',schema);
 const database=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{
  const result=await runExpectedReceiptCompatibilityRegression(database,{schema,ensureSchema:ensureExpectedReceiptSchema});
  assert.equal(result.catalogMutations,10);
  assert.equal(result.verifiedRows,6);
 }finally{
  await database.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
 }
});

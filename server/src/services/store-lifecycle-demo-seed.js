// Startup examples must never repopulate a store after an explicit new start.
// This reader creates no schema or lifecycle enrollment and grants no rights.
const q=value=>'"'+String(value).replaceAll('"','""')+'"';
export async function runLifecycleDemoSeed(db,{companyId,storeId},seed){
 if(typeof companyId!=='string'||!companyId||typeof storeId!=='string'||!storeId||typeof seed!=='function')throw Error('Explicit demo seed scope and action are required.');
 const state=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS name'))[0]?.name;if(!schema)throw Error('Demo seed lifecycle schema unavailable.');
  const exists=(await tx.$queryRawUnsafe('SELECT to_regclass($1)::text AS name',q(schema)+'."StoreLifecycleFence"'))[0]?.name;
  if(!exists)return {skipped:false};
  const row=(await tx.$queryRawUnsafe(`SELECT "companyId","generation"::text AS generation,"maintenance","retired" FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1`,storeId))[0];
  if(!row)return {skipped:false};
  if(row.companyId!==companyId||!/^\d+$/.test(row.generation)||typeof row.maintenance!=='boolean'||typeof row.retired!=='boolean')throw Error('Demo seed lifecycle scope or generation differs.');
  return {skipped:row.maintenance===true||row.retired===true||BigInt(row.generation)>0n};
 },{isolationLevel:'RepeatableRead',timeout:10000,maxWait:3000});
 if(state.skipped)return {skipped:true,value:null};
 // Database lifecycle guards still arbitrate a maintenance race after this read.
 return {skipped:false,value:await seed()};
}

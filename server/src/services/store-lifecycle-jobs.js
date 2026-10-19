// Trusted server job scans only. The SQL predicate MUST accompany every scan
// and repair: a stored legacy origin is never upgraded to a current epoch.
import {Prisma} from '@prisma/client';
import {withLifecycleContext} from './store-lifecycle-context.js';
import {normalizeLifecycleGeneration} from './store-lifecycle-generation.js';
const q=value=>'"'+String(value).replaceAll('"','""')+'"';
export const lifecycleJobOrigin=handoff=>normalizeLifecycleGeneration(handoff?.lifecycleGeneration)??'0';
export async function lifecycleJobSelection(db){
 const meta=(await db.$queryRawUnsafe(`SELECT current_schema() AS schema,to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS fence`))[0];
 if(!meta?.schema)throw Error('Lifecycle job schema unavailable.');
 const saved=`COALESCE(j."resultJson"->'posHandoff'->>'lifecycleGeneration','0')`;
 if(!meta.fence)return {filter:`${saved}='0'`,positive:[]};
 const table=q(meta.schema)+'."StoreLifecycleFence"';
 const current=`COALESCE((SELECT f."generation"::text FROM ${table} f WHERE f."storeId"=j."storeId" AND f."companyId"=j."companyId"),'0')`;
 const filter=`${saved}=${current} AND NOT EXISTS(SELECT 1 FROM ${table} f WHERE f."storeId"=j."storeId" AND (f."companyId" IS DISTINCT FROM j."companyId" OR f."maintenance" OR f."retired"))`;
 const positive=await db.$queryRawUnsafe(`SELECT "storeId","generation"::text AS generation FROM ${table} WHERE "generation">0 AND NOT "maintenance" AND NOT "retired" ORDER BY "storeId"`);
 for(const row of positive)if(!row.storeId||normalizeLifecycleGeneration(row.generation)===null)throw Error('Invalid lifecycle job epoch.');
 return {filter,positive};
}
export async function withLifecycleJobBatches(db,work){
 const {filter,positive}=await lifecycleJobSelection(db),results=[];
 const batches=[];for(let offset=0;offset<positive.length;offset+=100)batches.push(positive.slice(offset,offset+100));if(!batches.length)batches.push([]);
 for(const [index,batch] of batches.entries()){
  const origin=Object.fromEntries(batch.map(row=>[row.storeId,row.generation]));
  const selected=Prisma.sql`j."storeId"=ANY(${batch.map(row=>row.storeId)}::text[])`;
  const zero=Prisma.raw(`COALESCE(j."resultJson"->'posHandoff'->>'lifecycleGeneration','0')='0'`);
  const partition=index===0?Prisma.sql`(${zero} OR ${selected})`:selected;
  results.push(await withLifecycleContext(origin,()=>work(Prisma.sql`(${Prisma.raw(filter)}) AND (${partition})`)));
 }
 return results;
}

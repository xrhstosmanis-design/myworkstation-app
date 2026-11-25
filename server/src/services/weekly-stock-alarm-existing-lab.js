// Exact preservation of existing synthetic efood tables. No efood DDL or row writer.
import {createHash} from 'node:crypto';
import {weeklyExistingLabDefinition} from './weekly-stock-alarm-profile.js';
import {readWeeklyAlarmCatalogue} from './weekly-stock-alarm-catalogue.js';
const names=Object.keys(weeklyExistingLabDefinition.columns);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function inspectWeeklyExistingLabCatalogue(tx,schema){
 const catalogue=await readWeeklyAlarmCatalogue(tx,schema,{names});
 if(canonical(catalogue)!==canonical(weeklyExistingLabDefinition.catalogue))throw Object.assign(new Error('Existing efood LAB catalogue differs.'),{status:409,code:'WEEKLY_ALARM_EXISTING_LAB_CHANGED'});
 const runtimeAdditions=[];
 for(const review of weeklyExistingLabDefinition.runtimeCatalogueAdditions||[]){
  const actual=await readWeeklyAlarmCatalogue(tx,schema,{names:[review.table]});
  const additions={columns:actual.columns.filter(c=>review.columns.some(r=>r.name===c.name)),indexes:actual.indexes.filter(i=>review.indexes.some(r=>r.name===i.name))};
  if(canonical(additions)!==canonical({columns:review.columns,indexes:review.indexes}))throw Object.assign(new Error('Existing runtime addition catalogue differs.'),{status:409,code:'WEEKLY_ALARM_EXISTING_COLUMNS_CHANGED'});
  runtimeAdditions.push(additions);
 }
 const reviews=weeklyExistingLabDefinition.runtimeColumnCompatibility||[];
 if(reviews.length){
  const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema,reviews.map(r=>r.table));
  for(const review of reviews)if(canonical(columns.filter(c=>c.table===review.table).map(c=>[c.name,c.type,c.notNull]))!==canonical(review.targetColumns))throw Object.assign(new Error('Existing runtime columns differ.'),{status:409,code:'WEEKLY_ALARM_EXISTING_COLUMNS_CHANGED'});
 }
 return {catalogue,signature:createHash('sha256').update(canonical({catalogue,runtimeAdditions})).digest('hex')};
}
export async function prepareWeeklyExistingLabSource(tx,schema){
 const evidence=await inspectWeeklyExistingLabCatalogue(tx,schema),allowed=new Set(names);
 const proxy=new Proxy(tx,{get(target,key){const original=Reflect.get(target,key);if(key!=='$queryRawUnsafe')return typeof original==='function'?original.bind(target):original;
  return async(sql,...args)=>{const rows=await original.apply(target,[sql,...args]);
   if(typeof sql==='string'&&/\bFROM (?:pg_|information_schema\.)/.test(sql)&&Array.isArray(rows)){
    const visible=rows.filter(row=>!['name','table','child','parent','table_name','tableName'].some(k=>allowed.has(row[k])));
    if(sql.includes('FROM pg_attribute'))return visible.filter(row=>{const review=weeklyExistingLabDefinition.runtimeColumnCompatibility?.find(r=>r.table===row.table);return !review||review.sourceColumns.some(c=>c[0]===row.name)}).map(row=>{const source=weeklyExistingLabDefinition.runtimeColumnCompatibility?.find(r=>r.table===row.table)?.sourceColumns.find(c=>c[0]===row.name);return source?{...row,notNull:source[2]}:row});
    return visible;
   }
   return rows;
  };
 }});
 return {tx:proxy,evidence:evidence.signature};
}

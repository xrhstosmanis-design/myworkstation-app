// Exact preservation of existing synthetic efood tables. No efood DDL or row writer.
import {createHash} from 'node:crypto';
import {weeklyExistingLabDefinition} from './weekly-stock-alarm-profile.js';
import {readWeeklyAlarmCatalogue} from './weekly-stock-alarm-catalogue.js';
const names=Object.keys(weeklyExistingLabDefinition.columns);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function inspectWeeklyExistingLabCatalogue(tx,schema){
 const catalogue=await readWeeklyAlarmCatalogue(tx,schema,{names});
 if(canonical(catalogue)!==canonical(weeklyExistingLabDefinition.catalogue))throw Object.assign(new Error('Existing efood LAB catalogue differs.'),{status:409,code:'WEEKLY_ALARM_EXISTING_LAB_CHANGED'});
 return {catalogue,signature:createHash('sha256').update(canonical(catalogue)).digest('hex')};
}
export async function prepareWeeklyExistingLabSource(tx,schema){
 const evidence=await inspectWeeklyExistingLabCatalogue(tx,schema),allowed=new Set(names);
 const proxy=new Proxy(tx,{get(target,key){const original=Reflect.get(target,key);if(key!=='$queryRawUnsafe')return typeof original==='function'?original.bind(target):original;
  return async(sql,...args)=>{const rows=await original.apply(target,[sql,...args]);
   if(typeof sql==='string'&&/\bFROM (?:pg_|information_schema\.)/.test(sql)&&Array.isArray(rows))return rows.filter(row=>!['name','table','child','parent','table_name','tableName'].some(k=>allowed.has(row[k])));
   return rows;
  };
 }});
 return {tx:proxy,evidence:evidence.signature};
}

import {weeklyAlarmDefinition} from './weekly-stock-alarm-profile.js';
const names=Object.keys(weeklyAlarmDefinition.columns);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function readWeeklyAlarmCatalogue(tx,schema,{names:catalogueNames=names}={}){
 const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited,EXISTS(SELECT 1 FROM pg_rewrite w WHERE w.ev_class=c.oid AND w.rulename<>'_RETURN') AS rewritten FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname`,schema,catalogueNames);
 const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema,catalogueNames);
 const constraints=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",x.conname AS name,x.contype::text AS type,pg_get_constraintdef(x.oid,true) AS definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND x.contype<>'n' ORDER BY c.relname,x.conname`,schema,catalogueNames);
 const indexes=await tx.$queryRawUnsafe(`SELECT t.relname AS "table",i.relname AS name,x.indisvalid AS valid,x.indisready AS ready,x.indisunique AS unique,pg_get_indexdef(x.indexrelid) AS definition FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=ANY($2::text[]) ORDER BY t.relname,i.relname`,schema,catalogueNames);
 const triggers=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,schema,catalogueNames);
 const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):typeof value==='string'?value.replaceAll('"'+schema.replaceAll('"','""')+'".','__SCHEMA__.').replaceAll(schema+'.','__SCHEMA__.'):value;
 return normalize({relations,columns,constraints,indexes,triggers});
}
export async function inspectWeeklyAlarmCatalogue(tx,schema){
 const catalogue=await readWeeklyAlarmCatalogue(tx,schema);
 if(!weeklyAlarmDefinition.catalogue||canonical(catalogue)!==canonical(weeklyAlarmDefinition.catalogue))throw Object.assign(new Error('Weekly stock alarm catalogue differs.'),{status:409,code:'WEEKLY_ALARM_CATALOGUE_CHANGED'});
 return catalogue;
}

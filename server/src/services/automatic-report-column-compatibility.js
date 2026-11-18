// Six reviewed application columns can be hidden from the older source-plan
// inspection only after their exact physical definitions and dependencies match.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixtureUrl=new URL('../../../ops/backup/lifecycle/report-column-compatibility.proposed.json',import.meta.url);
const document=()=>JSON.parse(readFileSync(fixtureUrl,'utf8'));
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
const fail=()=>{throw Object.assign(new Error('Reviewed report column catalogue differs.'),{code:'REPORT_COLUMN_CATALOGUE_CHANGED',status:409})};
const selectors=['PurchaseOrder.awaitingInvoice','StoreProduct.costPriceOverride','StoreProduct.vatDepartmentIdOverride','StoreProduct.categoryIdOverride','StoreProduct.subcategoryIdOverride','TableOrder.cashParts'];
export const reportColumnCompatibilityDDL=()=>document().ddl;
export async function readReportColumnCatalogue(tx,schema){
 const read=sql=>tx.$queryRawUnsafe(sql,schema,selectors);
 const columns=await read(`SELECT c.relname AS "table",a.attname AS name,a.attnum::int AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression",a.attacl::text AS acl,CASE WHEN a.attcollation=0 THEN NULL ELSE co.collname END AS collation,CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT nspname FROM pg_namespace WHERE oid=co.collnamespace) END AS "collationSchema" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname=$1 AND (c.relname||'.'||a.attname)=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
 const constraints=await read(`SELECT ns.nspname AS schema,t.relname AS "table",c.conname AS name,c.contype::text AS kind,c.condeferrable AS "deferrable",c.condeferred AS deferred,c.convalidated AS validated,pns.nspname AS "parentSchema",p.relname AS "parentTable",c.confdeltype::text AS "onDelete",c.confupdtype::text AS "onUpdate",pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace LEFT JOIN pg_class p ON p.oid=c.confrelid LEFT JOIN pg_namespace pns ON pns.oid=p.relnamespace WHERE c.contype<>'n' AND ((ns.nspname=$1 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=ANY(c.conkey) AND (t.relname||'.'||a.attname)=ANY($2::text[]))) OR (pns.nspname=$1 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=p.oid AND a.attnum=ANY(c.confkey) AND (p.relname||'.'||a.attname)=ANY($2::text[])))) ORDER BY ns.nspname,t.relname,c.conname`);
 // pg_depend includes expression and partial-index column references, whose
 // indkey can contain zero instead of the referenced column number.
 const indexes=await read(`SELECT c.relname AS "table",ic.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,i.indisprimary AS "primary",i.indisunique AS "unique",i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,ic.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS "ownedByCurrentUser" FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND (c.relname||'.'||a.attname)=ANY($2::text[]) AND (a.attnum=ANY(i.indkey::smallint[]) OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=i.indexrelid AND d.refclassid='pg_class'::regclass AND d.refobjid=c.oid AND d.refobjsubid=a.attnum))) ORDER BY c.relname,ic.relname`);
 const normalize=(value,key)=>{
  if(Array.isArray(value))return value.map(item=>normalize(item));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
  if(typeof value!=='string')return value;
  if(['schema','parentSchema'].includes(key)&&value===schema)return '__SCHEMA__';
  if(key==='definition')return value.replaceAll('"'+schema.replaceAll('"','""')+'".','__SCHEMA__.').replaceAll(schema+'.','__SCHEMA__.');
  return value;
 };
 return normalize({columns,constraints,indexes});
}
export async function prepareReportColumnInspection(tx,schema){
 if(typeof schema!=='string'||!schema||schema.length>128)fail();
 const fixture=document(),catalogue=await readReportColumnCatalogue(tx,schema);
 if(canonical(catalogue)!==canonical(fixture.catalogue))fail();
 const allowed=new Set(selectors);
 const proxy=new Proxy(tx,{get(target,key){
  if(key!=='$queryRawUnsafe'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
  return async(sql,...args)=>{
   const result=await target.$queryRawUnsafe(sql,...args);
   if(args.length!==1||args[0]!==schema||!sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,')||!sql.includes('FROM pg_attribute a'))return result;
   return result.filter(row=>!allowed.has(row.table+'.'+row.name));
  };
 }});
 return {tx:proxy,evidence:{format:fixture.format,catalogueSha256:createHash('sha256').update(canonical(catalogue)).digest('hex'),reviewedColumns:selectors,executionEnabled:false}};
}

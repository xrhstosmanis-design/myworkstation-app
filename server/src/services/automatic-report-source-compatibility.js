// This allowlist admits a reports-only installation inspection. It grants no
// ownership, reset policy, writer exemption or lifecycle execution capability.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixtureUrl=new URL('../../../ops/backup/lifecycle/report-operational-compatibility.proposed.json',import.meta.url);
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(item=>JSON.parse(canonical(item))):Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);
const fail=()=>{throw Object.assign(new Error('Reviewed operational report catalogue differs.'),{code:'REPORT_OPERATIONAL_CATALOGUE_CHANGED',status:409})};
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const document=()=>JSON.parse(readFileSync(fixtureUrl,'utf8'));
export const operationalReportCompatibilityDDL=()=>document().ddl;

// The result has no row data. Every FK touching an allowlisted table is included,
// including foreign schemas and unexpected inbound references.
export async function readOperationalReportCatalogue(tx,schema,names){
 const parameters=[schema,names];
 const read=sql=>tx.$queryRawUnsafe(sql,...parameters);
 const relations=await read(`SELECT c.relname AS name,c.relkind::text AS kind,c.relpersistence::text AS persistence,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS "ownedByCurrentUser",c.relacl::text AS acl,c.reloptions AS options,c.relreplident::text AS "replicaIdentity",c.reltablespace=0 AS "defaultTablespace",EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited,EXISTS(SELECT 1 FROM pg_rewrite w WHERE w.ev_class=c.oid AND w.rulename<>'_RETURN') AS rewritten FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname`);
 const columns=await read(`SELECT c.relname AS "table",a.attname AS name,a.attnum::int AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression",a.attacl::text AS acl,CASE WHEN a.attcollation=0 THEN NULL ELSE co.collname END AS collation,CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT nspname FROM pg_namespace WHERE oid=co.collnamespace) END AS "collationSchema" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
 const constraints=await read(`SELECT ns.nspname AS schema,t.relname AS "table",c.conname AS name,c.contype::text AS kind,c.condeferrable AS "deferrable",c.condeferred AS deferred,c.convalidated AS validated,pns.nspname AS "parentSchema",p.relname AS "parentTable",c.confdeltype::text AS "onDelete",c.confupdtype::text AS "onUpdate",pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace LEFT JOIN pg_class p ON p.oid=c.confrelid LEFT JOIN pg_namespace pns ON pns.oid=p.relnamespace WHERE c.contype<>'n' AND ((ns.nspname=$1 AND t.relname=ANY($2::text[])) OR (pns.nspname=$1 AND p.relname=ANY($2::text[]))) ORDER BY ns.nspname,t.relname,c.conname`);
 const indexes=await read(`SELECT c.relname AS "table",ic.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,i.indisprimary AS "primary",i.indisunique AS "unique",i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,i.indisreplident AS "replicaIdentity",ic.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS "ownedByCurrentUser",ic.reloptions AS options FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname,ic.relname`);
 const triggers=await read(`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,t.tgtype::int AS mask,t.tgqual::text AS condition,ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=k.n ORDER BY k.p) AS "attributeNames",encode(t.tgargs,'hex') AS args,t.tgnargs::int AS "argumentCount",t.tgconstraint<>0 AS "constraintTrigger",t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,t.tgoldtable AS "oldTransitionTable",t.tgnewtable AS "newTransitionTable",pn.nspname AS "functionSchema",p.proname AS "functionName",p.prosrc AS body,p.prosecdef AS definer,l.lanname AS language,p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS "ownedByCurrentUser",p.prokind::text AS "functionKind",p.proretset AS "returnsSet",format_type(p.prorettype,NULL) AS "returnType",p.pronargs::int AS "functionArgumentCount",p.proargtypes::text AS "functionArgumentTypes",p.proconfig AS settings,p.proacl::text AS acl,p.probin AS binary,p.proisstrict AS strict,p.proleakproof AS leakproof,p.provolatile::text AS volatility,p.proparallel::text AS parallel,p.procost::text AS cost,p.prorows::text AS rows,p.prosupport::regproc::text AS support FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND NOT t.tgisinternal AND (c.relname=ANY($2::text[]) OR (c.relname='StoreProduct' AND t.tgname='mws_guard_package_stock_change')) ORDER BY c.relname,t.tgname`);
 // Only schema qualifiers generated by PostgreSQL are normalized. Function
 // source remains byte-for-byte exact and cannot hide an executable change.
 const normalize=(value,key)=>{
  if(Array.isArray(value))return value.map(item=>normalize(item));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
  if(typeof value!=='string'||key==='body')return value;
  if(['schema','parentSchema','functionSchema'].includes(key)&&value===schema)return '__SCHEMA__';
  if(key==='definition')return value.replaceAll(quote(schema)+'.','__SCHEMA__.').replaceAll(schema+'.','__SCHEMA__.');
  return value;
 };
 return normalize({relations,columns,constraints,indexes,triggers});
}

export async function prepareOperationalReportInspection(tx,schema){
 if(typeof schema!=='string'||!schema||schema.length>128)fail();
 const fixture=document(),names=fixture.tables.map(t=>t.name),allowed=new Set(names);
 const catalogue=await readOperationalReportCatalogue(tx,schema,names);
 if(canonical(catalogue)!==canonical(fixture.catalogue))fail();
 const packageTrigger={...fixture.packageTrigger,functionSchema:schema};
 const legacyMetadataQuery=sql=>{
  if(sql.startsWith('SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,')&&sql.includes('FROM pg_class c'))return 'relations';
  if(sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,')&&sql.includes('FROM pg_attribute a'))return 'columns';
  if(sql.startsWith('SELECT child.relname AS child,parent.relname AS parent,')&&sql.includes('FROM pg_constraint c'))return 'fks';
  if(sql.startsWith('SELECT c.relname AS "table",ARRAY(SELECT a.attname::text FROM unnest(i.indkey)')&&sql.includes('FROM pg_index i'))return 'keys';
  if(sql.startsWith('SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,')&&sql.includes('p.prosrc AS body'))return 'triggers';
  if(sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,k.p::int AS position')&&sql.includes('FROM pg_index i'))return 'keys';
  return null;
 };
 const proxy=new Proxy(tx,{get(target,key){
  if(key!=='$queryRawUnsafe'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
  return async(sql,...args)=>{
   const result=await target.$queryRawUnsafe(sql,...args);
   if(args.length!==1||args[0]!==schema)return result;
   const kind=legacyMetadataQuery(sql);if(!kind)return result;
   return result.filter(row=>{
    if(kind==='relations')return !allowed.has(row.name);
    if(kind==='fks')return !((row.childSchema===schema&&allowed.has(row.child))||(row.parentSchema===schema&&allowed.has(row.parent)));
    if(allowed.has(row.table))return false;
    return !(kind==='triggers'&&row.table==='StoreProduct'&&row.name===packageTrigger.name);
   });
  };
 }});
 return {tx:proxy,packageTrigger,evidence:{format:fixture.format,catalogueSha256:digest(catalogue),preservedTables:names,executionEnabled:false}};
}

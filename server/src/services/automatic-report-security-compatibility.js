// Standalone Stage A proof only. No runtime registration, proxy or SQL writer.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const definitionBytes=readFileSync(new URL('../../../ops/backup/lifecycle/report-security-compatibility.proposed.json',import.meta.url),'utf8');
const definition=JSON.parse(definitionBytes);
const definitionSha256='bb105475e3e14a3425d4fc67e5b2d855ee4c23f8c161d4c688bae5bbceca203f';
const name='StoreChatAccessRevocation',names=['companyId','storeId','userId'];
const fail=()=>{throw Object.assign(new Error('Security compatibility catalogue differs.'),{code:'REPORT_SECURITY_CATALOGUE_CHANGED',status:409})};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>JSON.parse(JSON.stringify(value));
export function validateReportSecurityCatalogue(c){
 if(createHash('sha256').update(definitionBytes).digest('hex')!==definitionSha256)fail();
 if(definition.name!==name||!same(definition.columns,names)||definition.productionWiring!==false)fail();
 if(!c||!same(Object.keys(c).sort(),['schema','name','kind','persistence','ownerEqualsStore','rls','forced','partition','inherited','rewritten','policies','triggers','dropped','acl','options','replica','tablespace','columns','constraints','indexes','notNullConstraintAnomalies'].sort())||['ownerEqualsStore','rls','forced','partition','inherited','rewritten'].some(k=>typeof c[k]!=='boolean')||c.ownerEqualsStore!==true||typeof c.schema!=='string'||!c.schema||c.name!==name||c.kind!=='r'||c.persistence!=='p'||!c.ownerEqualsStore||c.rls||c.forced||c.partition||c.inherited||c.rewritten||c.policies!==0||c.triggers!==0||c.dropped!==0||c.acl!==null||c.options!==null||c.replica!=='d'||c.tablespace!==0||c.notNullConstraintAnomalies!==0)fail();
 if(!same(c.columns,names.map((n,i)=>({name:n,position:i+1,type:'text',notNull:true,default:null,identity:'',generated:'',acl:null,collation:'default',collationSchema:'pg_catalog'}))))fail();
 if(!same(c.constraints,[{name:name+'_pkey',kind:'p',definition:'PRIMARY KEY ("companyId", "storeId", "userId")',validated:true,deferrable:false,deferred:false}]))fail();
 if(!same(c.indexes,[{name:name+'_pkey',method:'btree',primary:true,unique:true,valid:true,ready:true,live:true,immediate:true,exclusion:false,keys:names,expression:null,predicate:null,options:null,sameOwner:true,opclasses:['text_ops','text_ops','text_ops'],opclassSchemas:['pg_catalog','pg_catalog','pg_catalog'],collations:['default','default','default'],collationSchemas:['pg_catalog','pg_catalog','pg_catalog'],indoptions:[0,0,0],keyCount:3,totalCount:3,acl:null,tablespace:0}]))fail();
 return Object.freeze({format:definition.format,kind:'SNAPSHOT_ONLY',schema:c.schema,integrationRequiresFreshLockedValidation:true,definitionSha256,catalogueSha256:createHash('sha256').update(JSON.stringify(c)).digest('hex'),preservedTable:name,productionWiring:false});
}
// A single read-only catalogue snapshot and pure projection proof only.
// It guarantees no future DDL exclusion: a later installer must independently
// revalidate under its own authorized schema locks before applying anything.
export async function inspectReportSecurityCatalogue(tx,schema='public'){
 if(typeof schema!=='string'||!schema||schema.length>128)fail();
 const rows=await tx.$queryRawUnsafe(`SELECT jsonb_build_object(
 'schema',$1::text,'name',c.relname,'notNullConstraintAnomalies',(SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='n' AND (NOT k.convalidated OR k.condeferrable OR k.condeferred OR COALESCE(to_jsonb(k)->>'conenforced','true')<>'true' OR cardinality(k.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum=k.conkey[1] AND a.attname=ANY(ARRAY['companyId','storeId','userId']) AND k.conname='StoreChatAccessRevocation_'||a.attname||'_not_null'))), 'kind',c.relkind::text,'persistence',c.relpersistence::text,'ownerEqualsStore',c.relowner=(SELECT relowner FROM pg_class WHERE oid=to_regclass(format('%I.%I',$1::text,'Store'))),
 'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'partition',c.relispartition,'replica',c.relreplident::text,'tablespace',c.reltablespace::int,'acl',c.relacl::text,'options',c.reloptions,
 'inherited',EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=c.oid OR inhrelid=c.oid),'rewritten',EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=c.oid),'policies',(SELECT count(*)::int FROM pg_policy WHERE polrelid=c.oid),'triggers',(SELECT count(*)::int FROM pg_trigger WHERE tgrelid=c.oid),'dropped',(SELECT count(*)::int FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND attisdropped),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum::int,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity::text,'generated',a.attgenerated::text,'acl',a.attacl::text,'collation',co.collname,'collationSchema',cn.nspname) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype::text,'definition',pg_get_constraintdef(k.oid,true),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE (k.conrelid=c.oid OR k.confrelid=c.oid) AND k.contype<>'n'),'[]'::jsonb),
 'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ic.relname,'method',am.amname,'primary',i.indisprimary,'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'immediate',i.indimmediate,'exclusion',i.indisexclusion,'keys',ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY p(n,o) LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=p.n ORDER BY p.o),'expression',pg_get_expr(i.indexprs,i.indrelid),'predicate',pg_get_expr(i.indpred,i.indrelid),'options',ic.reloptions,'sameOwner',ic.relowner=c.relowner,'opclasses',ARRAY(SELECT op.opcname::text FROM unnest(i.indclass) WITH ORDINALITY k(o,p) JOIN pg_opclass op ON op.oid=k.o ORDER BY k.p),'opclassSchemas',ARRAY(SELECT n.nspname::text FROM unnest(i.indclass) WITH ORDINALITY k(o,p) JOIN pg_opclass op ON op.oid=k.o JOIN pg_namespace n ON n.oid=op.opcnamespace ORDER BY k.p),'collations',ARRAY(SELECT co.collname::text FROM unnest(i.indcollation) WITH ORDINALITY k(o,p) JOIN pg_collation co ON co.oid=k.o ORDER BY k.p),'collationSchemas',ARRAY(SELECT n.nspname::text FROM unnest(i.indcollation) WITH ORDINALITY k(o,p) JOIN pg_collation co ON co.oid=k.o JOIN pg_namespace n ON n.oid=co.collnamespace ORDER BY k.p),'indoptions',i.indoption::smallint[],'keyCount',i.indnkeyatts::int,'totalCount',i.indnatts::int,'acl',ic.relacl::text,'tablespace',ic.reltablespace::int) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam WHERE i.indrelid=c.oid),'[]'::jsonb)) AS catalogue
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,schema,name);
 if(rows.length!==1)fail();
 const catalogue=clone(rows[0].catalogue);
 // jsonb object key order is not semantic. Normalize only known field order.
 const ordered=(obj,keys)=>Object.fromEntries(keys.map(k=>[k,obj[k]]));
 catalogue.columns=catalogue.columns?.map(o=>ordered(o,['name','position','type','notNull','default','identity','generated','acl','collation','collationSchema']));
 catalogue.constraints=catalogue.constraints?.map(o=>ordered(o,['name','kind','definition','validated','deferrable','deferred']));
 catalogue.indexes=catalogue.indexes?.map(o=>ordered(o,['name','method','primary','unique','valid','ready','live','immediate','exclusion','keys','expression','predicate','options','sameOwner','opclasses','opclassSchemas','collations','collationSchemas','indoptions','keyCount','totalCount','acl','tablespace']));
 const evidence=validateReportSecurityCatalogue(catalogue);
 return {catalogue:clone(catalogue),evidence};
}
// Pure explicit projection of a supplied snapshot, never a live query proxy.
// Future integration must bind public schema and trusted knownTables itself.
// This export is not a production installer admission gate.
// Unknown relations are rejected rather than hidden. Returned evidence retains
// the full security descriptor; the caller's snapshot is never mutated.
export function projectReportSecurityCatalogue({schema,relations,security},{knownTables}){
 validateReportSecurityCatalogue(security);
 if(schema!==security.schema)fail();
 if(!Array.isArray(relations)||!Array.isArray(knownTables)||new Set(knownTables).size!==knownTables.length||knownTables.includes(name)||relations.filter(r=>r.name===name).length!==1||relations.some(r=>r.name===name&&(!same(Object.keys(r).sort(),['catalogue','name'])||!same(r.catalogue,security)))||relations.some(r=>!knownTables.includes(r.name)&&r.name!==name))fail();
 return {relations:clone(relations.filter(r=>r.name!==name)),preservedSecurity:clone(security),evidence:validateReportSecurityCatalogue(security)};
}

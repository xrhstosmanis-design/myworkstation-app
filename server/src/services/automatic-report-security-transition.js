// Explicit No7 V3→V4 metadata compatibility only. Never reads security rows.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectReportSecurityCatalogue,projectReportSecurityCatalogue} from './automatic-report-security-compatibility.js';
const bytes=readFileSync(new URL('../../../ops/backup/lifecycle/report-security-profile.proposed.json',import.meta.url),'utf8');
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value)}return value};
export const reportSecurityDefinition=deepFreeze(JSON.parse(bytes));
export const reportSecurityDefinitionHash='467ebede27b7b9b8e0aefddfb274b5c32e89a0a056f65eb4e7443c42f651a074';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=()=>{throw Object.assign(new Error('Report security profile differs.'),{code:'REPORT_SECURITY_PROFILE_CHANGED',status:409})};
const definition=()=>{if(createHash('sha256').update(bytes).digest('hex')!==reportSecurityDefinitionHash)fail();return reportSecurityDefinition};
export function withReportSecurityCompatibility(base){
 const d=definition();if(hash(base)!==d.sourcePlanHash)fail();const result=structuredClone(base);
 result.id+='__REVIEWED_REPORT_SECURITY_V1';
 result.preservedReportSecurityTables=[d.table];result.knownTables.push(d.table);result.knownColumns[d.table]=structuredClone(d.columns);result.reviewedColumns.push(...d.reviewedColumns);
 result.reportSecurityCompatibility={format:d.format,definitionSha256:reportSecurityDefinitionHash};return result;
}
export function assertReportSecurityProfile(manifest){
 const d=definition(),base=structuredClone(manifest);
 if(base.executionDisabled!==true||JSON.stringify(base.reportSecurityCompatibility)!==JSON.stringify({format:d.format,definitionSha256:reportSecurityDefinitionHash}))fail();
 delete base.reportSecurityCompatibility;base.id=base.id.replace(/__REVIEWED_REPORT_SECURITY_V1$/,'');
 if(JSON.stringify(base.preservedReportSecurityTables)!==JSON.stringify([d.table]))fail();delete base.preservedReportSecurityTables;
 if(base.knownTables.pop()!==d.table||JSON.stringify(base.knownColumns[d.table])!==JSON.stringify(d.columns))fail();delete base.knownColumns[d.table];
 for(const column of [...d.reviewedColumns].reverse())if(base.reviewedColumns.pop()!==column)fail();
 if(hash(base)!==d.sourcePlanHash||JSON.stringify(withReportSecurityCompatibility(base))!==JSON.stringify(manifest))fail();return base;
}
export async function inspectReportSecurityProfile(tx,schema){
 if(typeof schema!=='string'||!schema)fail();
 const proof=await inspectReportSecurityCatalogue(tx,schema);if(proof.evidence.definitionSha256!==definition().stageADefinitionSha256)fail();return proof;
}
export async function prepareReportSecuritySource(tx,schema,source){
 if(hash(source)!==definition().sourcePlanHash)fail();
 const proof=await inspectReportSecurityProfile(tx,schema),security=definition().table;
 const knownTables=[...source.knownTables,'StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone','StoreLifecycleRuntime'];
 const proxy=new Proxy(tx,{get(target,key){const original=Reflect.get(target,key);if(key!=='$queryRawUnsafe')return typeof original==='function'?original.bind(target):original;
 return async(sql,...args)=>{
  const rows=await original.call(target,sql,...args);if(args.length!==1||args[0]!==schema)return rows;
  if(sql.startsWith('SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,')){
   projectReportSecurityCatalogue({schema,security:proof.catalogue,relations:rows.map(row=>row.name===security?{name:security,catalogue:proof.catalogue}:{name:row.name})},{knownTables});
   return rows.filter(row=>row.name!==security);
  }
  if(sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,')||sql.startsWith('SELECT c.relname AS "table",ARRAY(SELECT a.attname::text FROM unnest(i.indkey)')||sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,k.p::int AS position'))return rows.filter(row=>row.table!==security);
  return rows;
 }}});
 return {tx:proxy,evidence:proof.evidence};
}

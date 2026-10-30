// Explicit, unmounted D5 schema. Imports and validation never ensure tables,
// enroll stores, activate grants or create jobs. Canonical profiles are unchanged.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getReviewedMonthlyCaptureLifecycleGuardDefinitions} from './store-lifecycle-executor.js';
import {monthlyInventorySnapshotLifecycleManifestProposal} from './monthly-inventory-snapshot-schema.js';
const grant='MonthlyInventoryCaptureGrant',job='MonthlyInventoryCaptureJob',names=[grant,job],q=s=>'"'+s.replaceAll('"','""')+'"',sha=s=>createHash('sha256').update(s).digest('hex');
const fields={
 [grant]:[['id','text',true,null],['companyId','text',true,null],['storeId','text',true,null],['purpose','text',true,null],['purposeVersion','integer',true,'1'],['lifecycleGeneration','bigint',true,null],['revision','bigint',true,'1'],['active','boolean',true,'false'],['delegatorUserId','text',true,null],['delegatorSessionVersion','integer',true,null],['activationId','text',false,null],['firstIssueMonth','text',false,null],['firstScheduledFor','timestamp with time zone',false,null],['createdByUserId','text',true,null],['createdAt','timestamp with time zone',true,'clock_timestamp()'],['grantedByUserId','text',false,null],['grantedAt','timestamp with time zone',false,null],['revokedByUserId','text',false,null],['revokedAt','timestamp with time zone',false,null],['updatedByUserId','text',true,null],['updatedAt','timestamp with time zone',true,'clock_timestamp()']],
 [job]:[['id','text',true,null],['companyId','text',true,null],['storeId','text',true,null],['purpose','text',true,null],['purposeVersion','integer',true,'1'],['lifecycleGeneration','bigint',true,null],['issueMonth','text',true,null],['scheduledFor','timestamp with time zone',true,null],['grantId','text',true,null],['grantRevision','bigint',true,null],['activationId','text',true,null],['status','text',true,"'PENDING'::text"],['attempt','integer',true,'0'],['leaseTokenHash','text',false,null],['leaseExpiresAt','timestamp with time zone',false,null],['claimedSourceRevision','text',false,null],['holdReason','text',false,null],['nextAttemptAt','timestamp with time zone',false,null],['createdAt','timestamp with time zone',true,'clock_timestamp()'],['updatedAt','timestamp with time zone',true,'clock_timestamp()']]
};
const fail=(code='MONTHLY_CAPTURE_SCHEMA_CHANGED')=>{throw Object.assign(new Error('Monthly capture schema is unavailable or differs from its reviewed definition.'),{status:409,code})};
const ids=cols=>cols.map(c=>`(${q(c)} IS NULL OR (octet_length(${q(c)})>=1 AND octet_length(${q(c)})<=160 AND ${q(c)}=btrim(${q(c)}) AND ${q(c)} !~ '[[:cntrl:]]'))`).join(' AND ');
const finite=cols=>cols.map(c=>`(${q(c)} IS NULL OR isfinite(${q(c)}))`).join(' AND ');
const month=col=>`${q(col)} ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`;
const slot=col=>`(to_date(${q(col)}||'-01','YYYY-MM-DD')+interval '1 month'+interval '7 hours') AT TIME ZONE 'Europe/Athens'`;
const checks={
 [grant]:{
  mws_capture_grant_ids:ids(['id','companyId','storeId','delegatorUserId','activationId','createdByUserId','grantedByUserId','revokedByUserId','updatedByUserId']),
  mws_capture_grant_purpose:`"purpose"='MONTHLY_INVENTORY_CAPTURE' AND "purposeVersion"=1`,
  mws_capture_grant_epoch:'"lifecycleGeneration">=0 AND "revision">=1 AND "delegatorSessionVersion">=0',
  mws_capture_grant_times:finite(['firstScheduledFor','createdAt','grantedAt','revokedAt','updatedAt'])+' AND "createdAt"<="updatedAt" AND ("grantedAt" IS NULL OR "grantedAt">="createdAt") AND ("revokedAt" IS NULL OR "revokedAt">="createdAt")',
  mws_capture_grant_activation:`(("activationId" IS NULL AND "firstIssueMonth" IS NULL AND "firstScheduledFor" IS NULL AND "grantedByUserId" IS NULL AND "grantedAt" IS NULL) OR ("activationId" IS NOT NULL AND "firstIssueMonth" IS NOT NULL AND ${month('firstIssueMonth')} AND "firstScheduledFor" IS NOT NULL AND "grantedByUserId" IS NOT NULL AND "grantedAt" IS NOT NULL AND "firstScheduledFor"=${slot('firstIssueMonth')} AND "firstScheduledFor">="grantedAt")) AND (NOT "active" OR ("activationId" IS NOT NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL))`,
  mws_capture_grant_revocation:'("revokedByUserId" IS NULL)=("revokedAt" IS NULL) AND ("revokedAt" IS NULL OR NOT "active")'
 },
 [job]:{
  mws_capture_job_ids:ids(['id','companyId','storeId','grantId','activationId']),
  mws_capture_job_purpose:`"purpose"='MONTHLY_INVENTORY_CAPTURE' AND "purposeVersion"=1`,
  mws_capture_job_epoch:'"lifecycleGeneration">=0 AND "grantRevision">=1 AND "attempt">=0 AND "attempt"<=60',
  mws_capture_job_slot:`${month('issueMonth')} AND "scheduledFor"=${slot('issueMonth')}`,
  mws_capture_job_status:`("status"='PENDING' OR "status"='LEASED' OR "status"='SUCCEEDED' OR "status"='HOLD' OR "status"='FAILED')`,
  mws_capture_job_lease:`(("status"='LEASED' AND "attempt">=1 AND "leaseTokenHash" IS NOT NULL AND "leaseTokenHash" ~ '^[a-f0-9]{64}$' AND "leaseExpiresAt" IS NOT NULL AND "claimedSourceRevision" IS NOT NULL AND "claimedSourceRevision" ~ '^[a-f0-9]{40}$') OR ("status"<>'LEASED' AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL AND "claimedSourceRevision" IS NULL))`,
  mws_capture_job_hold:`("holdReason" IS NULL OR ("holdReason"='AUTHORITY_REVOKED' OR "holdReason"='LEASE_EXPIRED' OR "holdReason"='SOURCE_UNAVAILABLE' OR "holdReason"='SCHEMA_UNAVAILABLE' OR "holdReason"='MAINTENANCE' OR "holdReason"='RETRY_LIMIT'))`,
  mws_capture_job_times:finite(['scheduledFor','leaseExpiresAt','nextAttemptAt','createdAt','updatedAt'])+' AND "createdAt"<="updatedAt"'
 }
};
const scopeBody=()=>`PERFORM 1 FROM "public"."Company" WHERE "id"=NEW."companyId" FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'MONTHLY_CAPTURE_SCOPE_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM "public"."Store" WHERE "id"=NEW."storeId" AND "companyId"=NEW."companyId" FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'MONTHLY_CAPTURE_SCOPE_INVALID' USING ERRCODE='23514'; END IF;`;
const immutable=(columns)=>columns.map(c=>`NEW.${q(c)} IS DISTINCT FROM OLD.${q(c)}`).join(' OR ');
const origins={
 [grant]:['id','companyId','storeId','purpose','purposeVersion','lifecycleGeneration','createdByUserId','createdAt'],
 [job]:['id','companyId','storeId','purpose','purposeVersion','lifecycleGeneration','issueMonth','scheduledFor','grantId','grantRevision','activationId','createdAt']
};
const guardBody=table=>`BEGIN
 IF TG_OP='UPDATE' AND (${immutable(origins[table])}) THEN RAISE EXCEPTION 'MONTHLY_CAPTURE_ORIGIN_IMMUTABLE' USING ERRCODE='55000'; END IF;
 ${table===grant?`IF TG_OP='UPDATE' AND (OLD."revision"=9223372036854775807 OR NEW."revision"<>OLD."revision"+1) THEN RAISE EXCEPTION 'MONTHLY_CAPTURE_REVISION_INVALID' USING ERRCODE='23514'; END IF;`:''}
 ${scopeBody()}
 RETURN NEW;
END;`;
const guardName=table=>table===grant?'monthly_inventory_capture_grant_guard':'monthly_inventory_capture_job_guard';
const scoped=['id','companyId','storeId','lifecycleGeneration','purpose','purposeVersion'];
const fks=table=>[
 {name:table===grant?'mws_capture_grant_company':'mws_capture_job_company',parent:'Company',local:['companyId'],remote:['id']},
 {name:table===grant?'mws_capture_grant_store':'mws_capture_job_store',parent:'Store',local:['storeId'],remote:['id']},
 ...(table===grant?['delegatorUserId','createdByUserId','grantedByUserId','revokedByUserId','updatedByUserId'].map((col,i)=>({name:'mws_capture_grant_user_'+i,parent:'User',local:[col],remote:['id']})):[{name:'mws_capture_job_grant',parent:grant,local:['grantId',...scoped.slice(1)],remote:scoped}])
];
const unique=table=>table===grant?[['mws_capture_grant_scope',['companyId','storeId','purpose']],['mws_capture_grant_identity',scoped]]:[['mws_capture_job_slot',['companyId','storeId','lifecycleGeneration','issueMonth']]];
export const monthlyInventoryCaptureRecoveryColumns=()=>Object.fromEntries(names.map(n=>[n,fields[n].map(c=>c.slice(0,3))]));
export function monthlyInventoryCaptureLifecycleManifestProposal(){return JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json',import.meta.url),'utf8'))}
export function assertMonthlyInventoryCaptureLifecycleCatalogue(manifest=monthlyInventoryCaptureLifecycleManifestProposal()){
 const baseline=monthlyInventorySnapshotLifecycleManifestProposal(),without=structuredClone(manifest),columns=monthlyInventoryCaptureRecoveryColumns();
 for(const table of names){
  const expected={name:table,owner:{kind:'DIRECT'},reset:'REMOVE',existingTriggers:[{name:guardName(table),enabled:'A',mask:23,condition:null,attributes:'',functionSchema:'public',functionName:guardName(table),definer:false,language:'plpgsql',bodySha256:sha(guardBody(table))}]};
  if(manifest?.tables?.filter(n=>n.name===table).length!==1||JSON.stringify(manifest.tables.find(n=>n.name===table))!==JSON.stringify(expected)||JSON.stringify(manifest.knownColumns?.[table])!==JSON.stringify(columns[table])||manifest.knownTables.filter(n=>n===table).length!==1)fail('MONTHLY_CAPTURE_RECOVERY_REVIEW_REQUIRED');
 }
 without.id=baseline.id;without.tables=without.tables.filter(n=>!names.includes(n.name));without.knownTables=without.knownTables.filter(n=>!names.includes(n));for(const n of names)delete without.knownColumns[n];without.reviewedColumns=without.reviewedColumns.filter(c=>!names.some(n=>c.startsWith(n+'.')));
 if(JSON.stringify(without)!==JSON.stringify(baseline)||JSON.stringify(manifest.reviewedColumns.filter(c=>names.some(n=>c.startsWith(n+'.'))).sort())!==JSON.stringify(names.flatMap(n=>columns[n].map(([c])=>n+'.'+c)).sort()))fail('MONTHLY_CAPTURE_RECOVERY_REVIEW_REQUIRED');
}
export async function createMonthlyInventoryCaptureSchema(tx){
 const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(schema!=='public')fail();
 for(const table of names){
  const label=table===grant?'grant':'job';
  const definitions=[...fields[table].map(([c,type,required,def])=>q(c)+' '+type+(required?' NOT NULL':'')+(def===null?'':' DEFAULT '+def)),`CONSTRAINT ${q('mws_capture_'+label+'_primary')} PRIMARY KEY ("id")`,...unique(table).map(([n,cols])=>`CONSTRAINT ${q(n)} UNIQUE (${cols.map(q).join(',')})`),...Object.entries(checks[table]).map(([n,expression])=>`CONSTRAINT ${q(n)} CHECK (${expression})`),...fks(table).map(fk=>`CONSTRAINT ${q(fk.name)} FOREIGN KEY (${fk.local.map(q).join(',')}) REFERENCES ${q(schema)}.${q(fk.parent)} (${fk.remote.map(q).join(',')}) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE`)];
  await tx.$executeRawUnsafe(`CREATE TABLE ${q(schema)}.${q(table)} (${definitions.join(',')})`);
  await tx.$executeRawUnsafe(`CREATE FUNCTION ${q(schema)}.${q(guardName(table))}() RETURNS trigger LANGUAGE plpgsql AS $capture$${guardBody(table)}$capture$`);
  await tx.$executeRawUnsafe(`CREATE TRIGGER ${q(guardName(table))} BEFORE INSERT OR UPDATE ON ${q(schema)}.${q(table)} FOR EACH ROW EXECUTE FUNCTION ${q(schema)}.${q(guardName(table))}()`);
  await tx.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(table)} ENABLE ALWAYS TRIGGER ${q(guardName(table))}`);
 }
}
const normalize=v=>String(v).replace(/::(?:text|bigint|integer|interval)/g,'').replace(/[\s()"]/g,'').replace(/1mon(?=')/g,'1month').replace(/07:00:00/g,'7hours').replace(/interval'/g,"'");
export async function validateMonthlyInventoryCaptureSchema(tx){
 const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(schema!=='public')fail();
 const lifecycle=getReviewedMonthlyCaptureLifecycleGuardDefinitions(monthlyInventoryCaptureLifecycleManifestProposal(),schema);let lifecycleCount=0;
 for(const table of names){
  const relation=(await tx.$queryRawUnsafe(`SELECT c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,c.relowner=(SELECT s.relowner FROM pg_class s JOIN pg_namespace sn ON sn.oid=s.relnamespace WHERE sn.nspname=$1 AND s.relname='Store') AS owner_valid,EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS inherited,EXISTS(SELECT 1 FROM pg_rewrite r WHERE r.ev_class=c.oid) AS rules FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,schema,table))[0];
  if(!relation)fail('MONTHLY_CAPTURE_SCHEMA_UNAVAILABLE');if(relation.kind!=='r'||relation.partition||relation.rls||relation.forced||!relation.owner_valid||relation.inherited||relation.rules)fail();
  const columns=await tx.$queryRawUnsafe(`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS def FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,schema,table);
  if(JSON.stringify(columns.map(c=>[c.name,c.type,c.required,c.def]))!==JSON.stringify(fields[table])||columns.some(c=>c.identity||c.generated))fail();
  const constraints=await tx.$queryRawUnsafe(`SELECT k.conname AS name,k.contype::text AS kind,k.convalidated AS valid,k.condeferrable AS deferrable,pg_get_expr(k.conbin,k.conrelid) AS expression,ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(n,p) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.n ORDER BY x.p) AS columns FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND k.contype<>'n'`,schema,table);
  if(constraints.length!==1+unique(table).length+Object.keys(checks[table]).length+fks(table).length||constraints.some(c=>!c.valid||c.deferrable)||!constraints.some(c=>c.kind==='p'&&JSON.stringify(c.columns)==='["id"]'))fail();
  for(const [n,cols] of unique(table))if(!constraints.some(c=>c.kind==='u'&&c.name===n&&JSON.stringify(c.columns)===JSON.stringify(cols)))fail();
  for(const [n,expression] of Object.entries(checks[table]))if(!constraints.some(c=>c.kind==='c'&&c.name===n&&normalize(c.expression)===normalize(expression)))fail();
  const actualFks=await tx.$queryRawUnsafe(`SELECT k.conname AS name,k.confdeltype::text AS deletion,k.confupdtype::text AS "update",k.confmatchtype::text AS "match",p.relname AS parent,pn.nspname AS schema,ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(n,p) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.n ORDER BY x.p) AS local,ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(n,p) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.n ORDER BY x.p) AS remote FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND k.contype='f'`,schema,table);
  if(actualFks.length!==fks(table).length||fks(table).some(fk=>!actualFks.some(f=>f.name===fk.name&&f.deletion==='r'&&f.update==='r'&&f.match==='s'&&f.parent===fk.parent&&f.schema===schema&&JSON.stringify(f.local)===JSON.stringify(fk.local)&&JSON.stringify(f.remote)===JSON.stringify(fk.remote))))fail();
  const indexes=await tx.$queryRawUnsafe(`SELECT i.indisunique AS "unique",i.indisprimary AS "primary",i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_expr(i.indexprs,i.indrelid) AS expression,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY x(n,p) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=x.n ORDER BY x.p) AS columns FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,schema,table);
  const expected=[['id'],...unique(table).map(([,cols])=>cols)];if(indexes.length!==expected.length||indexes.some(i=>!i.unique||!i.valid||!i.ready||!i.immediate||i.predicate||i.expression)||indexes.filter(i=>i.primary).length!==1||expected.some(cols=>!indexes.some(i=>JSON.stringify(i.columns)===JSON.stringify(cols))))fail();
  const triggers=await tx.$queryRawUnsafe(`SELECT t.tgname AS name,t.tgenabled::text AS enabled,t.tgtype::int AS mask,t.tgqual::text AS condition,t.tgattr::text AS attributes,p.proname AS "function",p.prosrc AS body,p.prosecdef AS definer,p.pronargs::int AS "arguments",p.prorettype='trigger'::regtype AS returns_trigger,p.prokind::text AS kind,p.proowner=c.relowner AS owner_valid,pn.nspname AS schema,l.lanname AS language FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND c.relname=$2 AND NOT t.tgisinternal`,schema,table);
  const own=triggers.find(t=>t.name===guardName(table));if(!own||own.enabled!=='A'||own.mask!==23||own.function!==guardName(table)||own.body!==guardBody(table))fail();
  for(const t of triggers){const reviewed=t.name===guardName(table)?null:lifecycle.find(g=>g.table===table&&g.name===t.name);if(t.name!==guardName(table)&&(!reviewed||t.mask!==reviewed.mask||t.body!==reviewed.body))fail();if(t.enabled!=='A'||t.condition!==null||t.attributes!==''||t.definer||t.arguments!==0||!t.returns_trigger||t.kind!=='f'||!t.owner_valid||t.schema!==schema||t.language!=='plpgsql'||t.function!==t.name)fail();if(reviewed)lifecycleCount++;}
 }
 const reserved=[...names.map(guardName),...lifecycle.map(g=>g.name)];
 const functions=await tx.$queryRawUnsafe(`SELECT p.proname AS name,p.pronargs::int AS arguments,p.prorettype='trigger'::regtype AS returns_trigger,p.prokind::text AS kind FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=ANY($2::text[]) ORDER BY p.proname`,schema,reserved);
 if(functions.length!==2+lifecycleCount||functions.some(f=>f.arguments!==0||!f.returns_trigger||f.kind!=='f'))fail();
 if(lifecycleCount!==0&&lifecycleCount!==4)fail();
 return {available:true,lifecycleGuardsInstalled:lifecycleCount===4};
}
export async function provisionMonthlyInventoryCaptureSchema(db,{manifest=monthlyInventoryCaptureLifecycleManifestProposal()}={}){
 assertMonthlyInventoryCaptureLifecycleCatalogue(manifest);
 return db.$transaction(async tx=>{
  await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('mws:monthly-capture-schema-v1',0))");
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(schema!=='public')fail();
  const fence=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',$1,'StoreLifecycleFence'))::text AS name`,schema))[0]?.name;
  if(fence&&(await tx.$queryRawUnsafe('SELECT 1 FROM "StoreLifecycleFence" WHERE "maintenance" OR "retired" LIMIT 1')).length)fail('MONTHLY_CAPTURE_MAINTENANCE');
  const present=await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[])`,names);
  if(present.length===0)await createMonthlyInventoryCaptureSchema(tx);else if(present.length!==2)fail();
  const result=await validateMonthlyInventoryCaptureSchema(tx);
 for(const table of names)if((await tx.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM ${q(schema)}.${q(table)} x LEFT JOIN ${q(schema)}."Store" s ON s."id"=x."storeId" WHERE s."id" IS NULL OR s."companyId" IS DISTINCT FROM x."companyId") AS invalid`))[0]?.invalid)fail('MONTHLY_CAPTURE_SCOPE_INVALID');
  return {...result,productionActivated:false,captureEnabled:false};
 },{maxWait:5000,timeout:30000});
}

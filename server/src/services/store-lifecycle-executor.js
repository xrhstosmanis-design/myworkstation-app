// Internal execution core. No production manifest, recovery adapter or HTTP route is registered here.
import {createHash,randomUUID} from 'node:crypto';
import {requireLifecycleAdmin} from './store-lifecycle-preview.js';
import {RESET_KEEP,FRESH_STORE_KEEP} from './store-lifecycle-policy.js';
import {digestLifecycleRows,LIFECYCLE_ROW_DIGEST_FORMAT} from './store-lifecycle-recovery-stream.js';
import {lifecycleMyDataLockKey} from './store-lifecycle-generation.js';
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
const literal=x=>"'"+String(x).replaceAll("'","''")+"'";
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
const INTERNAL=new Set(['StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone','StoreLifecycleRuntime']);
const childOwner=node=>['CHILD','LINK'].includes(node.owner.kind);
const validColumns=cols=>Array.isArray(cols)&&cols.length>0&&cols.length<=8&&cols.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='string'&&v.length>0))&&new Set(cols.map(p=>p[0])).size===cols.length&&new Set(cols.map(p=>p[1])).size===cols.length;
const validMatch=match=>match===undefined||Boolean(match&&typeof match==='object'&&!Array.isArray(match)&&Object.keys(match).length>0&&Object.keys(match).length<=4&&Object.entries(match).every(([k,v])=>k.length>0&&k.length<=128&&typeof v==='string'&&v.length>0&&v.length<=128));
const matchExpression=(match,alias)=>Object.entries(match||{}).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>`COALESCE(${alias}.${q(name)}=${literal(value)},false)`).join(' AND ')||'true';
const ownerMatch=(node,alias)=>matchExpression(node.owner.match,alias);
const nodeReferences=node=>[...(node.owner.kind==='LINK'?[node.owner]:[]),...(node.references||[])];
const applicationEdges=(plan,schema)=>plan.ordered.flatMap(n=>[
 ...(n.owner.kind==='BASE_STORE'?[{parent:'Store',columns:[['baseStoreId','id']],owned:true}]:[]),
 ...(n.owner.kind==='LINK'?[{...n.owner,owned:true}]:[]),
 ...(n.references||[]).map(r=>({...r,owned:false}))
].map(r=>({child:n.name,parent:r.parent,childSchema:schema,parentSchema:schema,local:r.columns.map(p=>p[0]),remote:r.columns.map(p=>p[1]),applicationOwnership:r.owned,applicationReference:!r.owned,historical:r.historical===true,match:r.match||{}})));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v)}return value};
const drainFingerprint=(plan,scope,mode,operationId)=>hash({phase:'DRAINING',operationId,companyId:scope.companyId,storeId:scope.storeId,mode,planHash:plan.planHash,sourceRevision:plan.sourceRevision});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function planFor(manifest){
 if(!manifest?.id||!Array.isArray(manifest.tables)||manifest.tables.length<1||manifest.tables.length>300)fail('A reviewed server manifest is required.');
 if(manifest.resetPolicy!==undefined&&manifest.resetPolicy!=='FRESH_STORE_V1')fail('Unknown reset policy.');
 if(manifest.knownTables!==undefined&&(!Array.isArray(manifest.knownTables)||manifest.knownTables.length>600||manifest.knownTables.some(n=>typeof n!=='string'||!n)||new Set(manifest.knownTables).size!==manifest.knownTables.length))fail('Invalid reviewed database catalogue.');
 if(manifest.knownColumns!==undefined){
  const entries=Object.entries(manifest.knownColumns||{});
  if(!manifest.knownColumns||typeof manifest.knownColumns!=='object'||Array.isArray(manifest.knownColumns)||!manifest.knownTables||entries.length!==manifest.knownTables.length||entries.some(([name,cols])=>!manifest.knownTables.includes(name)||!Array.isArray(cols)||cols.length<1||cols.length>512||cols.some(c=>!Array.isArray(c)||c.length!==3||typeof c[0]!=='string'||!c[0]||typeof c[1]!=='string'||!c[1]||typeof c[2]!=='boolean')||new Set(cols.map(c=>c[0])).size!==cols.length))fail('Invalid reviewed column catalogue.');
 }
 const nodes=new Map();
 for(const row of manifest.tables){if(typeof row.name!=='string'||!row.name||INTERNAL.has(row.name)||nodes.has(row.name)||!['KEEP','REMOVE'].includes(row.reset)||!['ROOT','DIRECT','CHILD','LINK','BASE_STORE'].includes(row.owner?.kind))fail('Invalid reviewed manifest.');nodes.set(row.name,row)}
 for(const row of nodes.values()){
  if(row.owner.match!==undefined&&(row.owner.kind!=='LINK'||!validMatch(row.owner.match)))fail('Invalid typed application ownership.');
  if(row.existingTriggers!==undefined&&(!Array.isArray(row.existingTriggers)||row.existingTriggers.length>32||new Set(row.existingTriggers.map(t=>t?.name)).size!==row.existingTriggers.length))fail('Invalid reviewed existing triggers.');
  for(const trigger of row.existingTriggers||[])if(!trigger||['name','functionSchema','functionName','language'].some(k=>typeof trigger[k]!=='string'||!trigger[k]||trigger[k].length>128)||trigger.name.startsWith('mws_lifecycle_')||trigger.functionName.startsWith('mws_lifecycle_')||!['O','A'].includes(trigger.enabled)||!Number.isInteger(trigger.mask)||trigger.mask<1||trigger.mask>127||!((typeof trigger.attributes==='string')||(Array.isArray(trigger.attributeNames)&&trigger.attributeNames.length<=32&&trigger.attributeNames.every(n=>typeof n==='string'&&n.length>0&&n.length<=128)&&new Set(trigger.attributeNames).size===trigger.attributeNames.length))||!(trigger.condition===null||typeof trigger.condition==='string')||trigger.definer!==false||!/^[a-f0-9]{64}$/.test(trigger.bodySha256||''))fail('Invalid reviewed existing triggers.');
  if(row.references!==undefined&&(!Array.isArray(row.references)||row.references.length>16))fail('Invalid reviewed application references.');
  for(const ref of row.references||[])if(!nodes.has(ref?.parent)||!validColumns(ref.columns)||!validMatch(ref.match)||(ref.historical!==undefined&&typeof ref.historical!=='boolean'))fail('Invalid reviewed application references.');
  if(row.owner.historical!==undefined)fail('Ownership cannot be historical.');
 }
 if(manifest.valueGuards!==undefined&&(!Array.isArray(manifest.valueGuards)||manifest.valueGuards.length>32))fail('Invalid reviewed value guards.');
 for(const guard of manifest.valueGuards||[])if(!nodes.has(guard?.table)||typeof guard.column!=='string'||!guard.column||!Array.isArray(guard.allowed)||guard.allowed.length<1||guard.allowed.length>32||guard.allowed.some(v=>typeof v!=='string'||!v||v.length>128)||new Set(guard.allowed).size!==guard.allowed.length)fail('Invalid reviewed value guards.');
 // Installation identities and their credentials are inseparable from both
 // physical registers. A reviewed plan may not override this RESET boundary.
 const retained=manifest.resetPolicy==='FRESH_STORE_V1'?FRESH_STORE_KEEP:RESET_KEEP;
 for(const row of nodes.values())if(retained.has(row.name)&&row.reset!=='KEEP')fail('RESET must retain installation/configuration: '+row.name);
 if(manifest.resetPolicy==='FRESH_STORE_V1')for(const row of nodes.values())if(!retained.has(row.name)&&row.reset!=='REMOVE')fail('Fresh-store business rows must be removed: '+row.name);
 if(manifest.resetPolicy==='FRESH_STORE_V1'&&nodes.get('StoreIntegrationCredential')?.reset==='REMOVE'){
  const guard=(manifest.valueGuards||[]).find(g=>g.table==='StoreIntegrationCredential'&&g.column==='kind');
  if(!guard||JSON.stringify([...guard.allowed].sort())!==JSON.stringify(['MYDATA','VAT_LOOKUP']))fail('Fresh-store business credentials require the exact non-fiscal kind guard.');
 }
 if(nodes.get('Store')?.owner.kind!=='ROOT'||nodes.get('Store')?.reset!=='KEEP'||[...nodes.values()].filter(x=>x.owner.kind==='ROOT').length!==1)fail('Store root must be retained by RESET.');
 const visiting=new Set(),visited=new Set(),ordered=[];
 const visit=name=>{if(visiting.has(name))fail('Cyclic ownership requires a separate reviewed plan.');if(visited.has(name))return;const row=nodes.get(name);if(!row)fail('Missing ownership parent.');visiting.add(name);if(childOwner(row)){if(!validColumns(row.owner.columns))fail('Invalid ownership columns.');visit(row.owner.parent)}if(row.owner.kind==='BASE_STORE')visit('Store');visiting.delete(name);visited.add(name);ordered.push(row)};
 for(const name of nodes.keys())visit(name);
 if(manifest.streaming!==undefined&&typeof manifest.streaming!=='boolean')fail('Invalid streaming policy.');
 return {id:manifest.id,nodes,ordered,knownTables:manifest.knownTables,knownColumns:manifest.knownColumns,valueGuards:manifest.valueGuards||[],streaming:manifest.streaming===true,planHash:hash(manifest)};
}
function predicate(plan,schema,node,alias,depth=0){
 if(node.owner.kind==='ROOT')return `${alias}."id"=$1`;
 if(node.owner.kind==='DIRECT')return `COALESCE(${alias}."storeId"=$1,false)`;
 if(node.owner.kind==='BASE_STORE')return `COALESCE(${alias}."baseStoreId"=$1,false)`;
 const parent=plan.nodes.get(node.owner.parent),p='p'+depth;
 return `((${ownerMatch(node,alias)}) AND EXISTS (SELECT 1 FROM ${q(schema)}.${q(parent.name)} ${p} WHERE ${node.owner.columns.map(([local,remote])=>`${alias}.${q(local)}=${p}.${q(remote)}`).join(' AND ')} AND (${predicate(plan,schema,parent,p,depth+1)})))`;
}
function storeExpression(plan,schema,node,record,depth=0){
 if(node.owner.kind==='ROOT')return `${record}."id"`;
 if(node.owner.kind==='DIRECT')return `${record}."storeId"`;
 if(node.owner.kind==='BASE_STORE')return `${record}."baseStoreId"`;
 const parent=plan.nodes.get(node.owner.parent),p='o'+depth;
 return `(CASE WHEN ${ownerMatch(node,record)} THEN (SELECT ${storeExpression(plan,schema,parent,p,depth+1)} FROM ${q(schema)}.${q(parent.name)} ${p} WHERE ${node.owner.columns.map(([local,remote])=>`${record}.${q(local)}=${p}.${q(remote)}`).join(' AND ')} LIMIT 1) ELSE NULL END)`;
}
const truncateBody="BEGIN RAISE EXCEPTION 'STORE_LIFECYCLE_TRUNCATE_FORBIDDEN' USING ERRCODE='55000'; END;";
const guardName=node=>'mws_lifecycle_'+hash(node.name).slice(0,16);
function retiredLinkGuard(plan,schema,node){
 return nodeReferences(node).map(ref=>{
 const parent=plan.nodes.get(ref.parent),remote=ref.columns.map(p=>p[1]);
 return [['NEW',"TG_OP<>'DELETE'"],['OLD',"TG_OP<>'INSERT'"]].map(([record,condition])=>`IF ${condition} THEN
 IF (${matchExpression(ref.match,record)}) AND ${ref.columns.map(([local])=>`${record}.${q(local)} IS NOT NULL`).join(' AND ')} THEN
 IF NOT EXISTS (SELECT 1 FROM ${q(schema)}.${q(parent.name)} p WHERE ${ref.columns.map(([local,key])=>`${record}.${q(local)}=p.${q(key)}`).join(' AND ')}) AND EXISTS (
 SELECT 1 FROM ${q(schema)}."StoreLifecycleTombstone" t JOIN ${q(schema)}."StoreLifecycleFence" f ON f."storeId"=t."storeId" AND f."companyId"=t."companyId"
 WHERE t."schemaName"=${literal(schema)} AND t."parentTable"=${literal(parent.name)} AND t."refColumns"=${literal(JSON.stringify(remote))}::jsonb AND t."refValues"=jsonb_build_array(${ref.columns.map(([local])=>`${record}.${q(local)}::text`).join(',')})
 AND NOT COALESCE(f."maintenance" AND COALESCE(current_setting('mws.lifecycle_operation',true),'')=f."operationId",false)
 ) THEN RAISE EXCEPTION 'STORE_LIFECYCLE_RETIRED_REFERENCE' USING ERRCODE='55000'; END IF;
 END IF;
 END IF;`).join('\n');
 }).join('\n');
}
const referenceStores=(plan,schema,node,record)=>`ARRAY[${[...(node.references||[]),...(plan.databaseReferences?.get(node.name)||[])].map(ref=>storeExpression(plan,schema,{owner:{...ref,kind:'LINK'}},record)).join(',')}]::text[]`;
function guardBody(plan,schema,node){return `DECLARE old_store text; new_store text; old_references text[] := ARRAY[]::text[]; new_references text[] := ARRAY[]::text[]; sid text; fence record; BEGIN
 IF TG_OP<>'INSERT' THEN old_store := ${storeExpression(plan,schema,node,'OLD')}; old_references := ${referenceStores(plan,schema,node,'OLD')}; END IF;
 IF TG_OP<>'DELETE' THEN new_store := ${storeExpression(plan,schema,node,'NEW')}; new_references := ${referenceStores(plan,schema,node,'NEW')}; END IF;
 ${retiredLinkGuard(plan,schema,node)}
 FOR sid IN SELECT DISTINCT x.s FROM unnest(ARRAY[old_store,new_store]||old_references||new_references) AS x(s) WHERE x.s IS NOT NULL ORDER BY x.s LOOP
  IF sid IS NULL THEN CONTINUE; END IF;
  SELECT * INTO fence FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=sid;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF fence."maintenance" AND current_setting('mws.lifecycle_operation',true)=fence."operationId" THEN CONTINUE; END IF;
  IF fence."retired" OR fence."maintenance" THEN RAISE EXCEPTION 'STORE_LIFECYCLE_MAINTENANCE' USING ERRCODE='55000'; END IF;
  BEGIN
   SELECT * INTO fence FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=sid FOR SHARE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'STORE_LIFECYCLE_MAINTENANCE' USING ERRCODE='55000'; END;
  IF fence."retired" OR fence."maintenance" THEN RAISE EXCEPTION 'STORE_LIFECYCLE_MAINTENANCE' USING ERRCODE='55000'; END IF;
  IF COALESCE((NULLIF(current_setting('mws.lifecycle_generations',true),'')::jsonb->>sid),'0')::bigint<>fence."generation" THEN RAISE EXCEPTION 'STORE_LIFECYCLE_STALE_GENERATION' USING ERRCODE='55000'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;`}
async function schemaFor(tx){const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS name'))[0]?.name;if(!schema)fail('Schema unavailable.');return schema}
async function readForeignKeys(tx,schema){ return await tx.$queryRawUnsafe(`SELECT child.relname AS child,parent.relname AS parent,pn.nspname AS "parentSchema",cn.nspname AS "childSchema",ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.p) AS local,ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.p) AS remote FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace JOIN pg_namespace pn ON pn.oid=parent.relnamespace WHERE c.contype='f' AND (cn.nspname=$1 OR pn.nspname=$1) ORDER BY cn.nspname,child.relname,c.conname`,schema);
}
function bindDatabaseReferences(plan,schema,fks){
 const references=new Map();
 for(const fk of fks){if(fk.childSchema!==schema||fk.parentSchema!==schema||!plan.nodes.has(fk.child)||!plan.nodes.has(fk.parent))continue;
 const ref={parent:fk.parent,columns:fk.local.map((name,i)=>[name,fk.remote[i]])};
 const entries=references.get(fk.child)||[];if(!entries.some(r=>JSON.stringify(r)===JSON.stringify(ref)))entries.push(ref);references.set(fk.child,entries);
 }
 for(const entries of references.values())entries.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 plan.databaseReferences=references;
}
async function validateDatabase(tx,plan,schema,{allowUninstalled=false}={}){
 const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited,EXISTS(SELECT 1 FROM pg_rewrite w WHERE w.ev_class=c.oid AND w.rulename<>'_RETURN') AS rewritten FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname`,schema);
 const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema);
 if(plan.knownTables){for(const relation of relations)if(!INTERNAL.has(relation.name)&&!plan.knownTables.includes(relation.name))fail('Unreviewed database relation: '+relation.name);for(const name of plan.knownTables)if(!relations.some(r=>r.name===name))fail('Reviewed database relation missing: '+name)}
 if(plan.knownColumns)for(const [name,expected] of Object.entries(plan.knownColumns))if(JSON.stringify(columns.filter(c=>c.table===name).map(c=>[c.name,c.type,c.notNull]))!==JSON.stringify(expected))fail('Reviewed column catalogue changed: '+name);
 for(const node of plan.ordered){const r=relations.find(r=>r.name===node.name);if(!r||r.kind!=='r'||r.partition||r.rls||r.forced||r.inherited||r.rewritten)fail('Complex or RLS relation requires a separate executor.');}
 if(columns.length>20000)fail('Schema review limit exceeded.');
 const byTable=new Map();for(const col of columns){if(!byTable.has(col.table))byTable.set(col.table,new Set());byTable.get(col.table).add(col.name);if(col.name==='storeId'&&!INTERNAL.has(col.table)&&!plan.nodes.has(col.table))fail('Unreviewed store table: '+col.table)}
 for(const node of plan.ordered){const cols=byTable.get(node.name);if(!cols||node.owner.kind==='ROOT'&&!cols.has('id')||node.owner.kind==='DIRECT'&&!cols.has('storeId')||node.owner.kind==='BASE_STORE'&&!cols.has('baseStoreId'))fail('Reviewed table layout changed.');}
 for(const guard of plan.valueGuards)if(!columns.some(c=>c.table===guard.table&&c.name===guard.column&&c.type==='text'))fail('Reviewed value guard layout changed.');
 const fks=await readForeignKeys(tx,schema);
 bindDatabaseReferences(plan,schema,fks);
 if(fks.length>10000)fail('Dependency review limit exceeded.');
 for(const fk of fks){if(fk.parentSchema===schema&&plan.nodes.has(fk.parent)&&(fk.childSchema!==schema||!plan.nodes.has(fk.child)))fail('Unreviewed incoming dependency: '+fk.child)}
 for(const node of plan.ordered.filter(n=>n.owner.kind==='CHILD'))if(!fks.some(f=>f.childSchema===schema&&f.parentSchema===schema&&f.child===node.name&&f.parent===node.owner.parent&&JSON.stringify(f.local)===JSON.stringify(node.owner.columns.map(p=>p[0]))&&JSON.stringify(f.remote)===JSON.stringify(node.owner.columns.map(p=>p[1]))))fail('Reviewed ownership FK changed.');
 const links=applicationEdges(plan,schema);
 const uniqueKeys=links.length?await tx.$queryRawUnsafe(`SELECT c.relname AS "table",ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n WHERE k.p<=i.indnkeyatts ORDER BY k.p) AS columns FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL ORDER BY c.relname,2`,schema):[];
 if(uniqueKeys.length>10000)fail('Application key review limit exceeded.');
 for(const link of links){
  const child=plan.nodes.get(link.child),cols=byTable.get(link.child),parentCols=byTable.get(link.parent);
  if(link.local.some(c=>!cols?.has(c))||link.remote.some(c=>!parentCols?.has(c))||!uniqueKeys.some(k=>k.table===link.parent&&JSON.stringify(k.columns)===JSON.stringify(link.remote)))fail('Application ownership requires an exact immediate unique parent key.');
  if(link.applicationOwnership&&child.owner.kind==='LINK'&&(cols.has('storeId')||link.local.some(name=>!columns.find(c=>c.table===link.child&&c.name===name)?.notNull)))fail('Raw ownership requires non-null keys and no competing storeId.');
  if(Object.keys(link.match).some(name=>!columns.some(c=>c.table===link.child&&c.name===name&&c.type==='text')))fail('Typed ownership discriminator schema changed.');
  const join=link.local.map((c,i)=>`c.${q(c)}=p.${q(link.remote[i])}`).join(' AND ');
  const required=`(${matchExpression(link.match,'c')}) AND ${link.local.map(c=>`c.${q(c)} IS NOT NULL`).join(' AND ')}`;
  if(!(link.applicationReference&&link.historical)&&(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(link.child)} c WHERE ${required} AND NOT EXISTS (SELECT 1 FROM ${q(schema)}.${q(link.parent)} p WHERE ${join}) LIMIT 1`)).length)fail('Unowned application reference requires explicit review.');
 }
 const triggers=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,t.tgtype::int AS mask,t.tgqual::text AS condition,t.tgattr::text AS attributes,ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=k.n ORDER BY k.p) AS "attributeNames",p.prosrc AS body,pn.nspname AS "functionSchema",p.proname AS "functionName",p.prosecdef AS definer,l.lanname AS language FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND NOT t.tgisinternal`,schema);
 const installedCounts=plan.ordered.map(node=>triggers.filter(t=>t.table===node.name&&[guardName(node),guardName(node)+'_truncate'].includes(t.name)).length);
 if(allowUninstalled&&installedCounts.some(n=>n>0)&&installedCounts.some(n=>n===0))fail('Partially installed lifecycle guards.');
 const requireOwn=!allowUninstalled||installedCounts.some(n=>n>0);
 for(const node of plan.ordered){const own=triggers.filter(t=>t.table===node.name),name=guardName(node);if(own.length!==(requireOwn?2:0)+(node.existingTriggers||[]).length)fail('Missing or additional database guards: '+node.name);for(const reviewed of node.existingTriggers||[]){const existing=own.find(t=>t.name===reviewed.name);if(!existing||Object.entries(reviewed).some(([key,value])=>key==='bodySha256'?createHash('sha256').update(existing.body).digest('hex')!==value:key==='attributeNames'?JSON.stringify(existing.attributeNames)!==JSON.stringify(value):existing[key]!==value))fail('Changed reviewed database guard: '+node.name+'.'+reviewed.name)}if(requireOwn)for(const [triggerName,mask,body] of [[name,31,guardBody(plan,schema,node)],[name+'_truncate',34,truncateBody]]){const trigger=own.find(t=>t.name===triggerName);if(!trigger||trigger.enabled!=='A'||trigger.mask!==mask||trigger.condition!==null||trigger.attributes!==''||trigger.body!==body||trigger.functionSchema!==schema||trigger.functionName!==triggerName||trigger.definer||trigger.language!=='plpgsql')fail('Changed database guard: '+node.name)}}
 // ID/JSON/attachment semantics must be reviewed in server code; this core cannot infer them.
 const reviewed=new Set((plan.reviewedColumns||[]));
 for(const col of columns.filter(c=>!INTERNAL.has(c.table))){
  if((/Id$/.test(col.name)&&!['companyId','storeId'].includes(col.name)&&!fks.some(f=>f.childSchema===schema&&f.child===col.table&&f.local.includes(col.name)))||['json','jsonb','bytea'].includes(col.type)||/storageKey|contentData|attachmentData|dataUrl|filePath|imageUrl|photoUrl/i.test(col.name))if(!reviewed.has(col.table+'.'+col.name))fail('Unreviewed application or attachment field: '+col.table+'.'+col.name);
 }
 const primaryKeys=plan.streaming?await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,k.p::int AS position FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(n,p) ON k.p<=i.indnkeyatts JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.n WHERE n.nspname=$1 AND i.indisprimary ORDER BY c.relname,k.p`,schema):[];
 if(plan.streaming)for(const node of plan.ordered)if(!primaryKeys.some(k=>k.table===node.name))fail('Streaming requires a reviewed primary key: '+node.name);
 const descriptor={relations:relations.filter(r=>plan.nodes.has(r.name)),columns:columns.filter(c=>plan.nodes.has(c.table)),fks,links,uniqueKeys:uniqueKeys.filter(k=>links.some(l=>l.parent===k.table)),...(plan.streaming?{primaryKeys}: {})};
 return {columns:byTable,fks:[...fks,...links],primaryKeys,descriptor,guardsInstalled:installedCounts.every(n=>n===2),signature:hash(descriptor)};
}
async function* scopedRows(tx,plan,schema,scope,node,meta){
 const keys=meta.primaryKeys.filter(k=>k.table===node.name);if(!keys.length)fail('Streaming primary key unavailable.');
 let cursor=null;
 while(true){
  const columns=keys.map(k=>'t.'+q(k.name)),after=cursor?` AND (${columns.join(',')})>(${keys.map((k,i)=>'$'+(i+2)+'::'+k.type).join(',')})`:'';
  const records=await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row,${columns.map((c,i)=>c+'::text AS '+q('key'+i)).join(',')} FROM ${q(schema)}.${q(node.name)} t WHERE (${predicate(plan,schema,node,'t')})${after} ORDER BY ${columns.join(',')} LIMIT 1`,scope.storeId,...(cursor||[]));
  if(!records.length)return;
  const record=records[0];if(Buffer.byteLength(record.row)>8*1024*1024)fail('A source row exceeds the bounded streaming limit.');
  cursor=keys.map((_,i)=>record['key'+i]);yield record.row;
 }
}
const tableCount=table=>Array.isArray(table.rows)?table.rows.length:table.rowCount;
async function assertQuiescent(tx,plan,schema,scope,meta,{connectors=true,lockBackground=true}={}){
 for(const [name,condition,required] of [
 ['CashShiftSession',`"status"='OPEN'`,['status']],
 ['StoreOperatorSession',`"revokedAt" IS NULL AND "expiresAt">NOW()`,['revokedAt','expiresAt']],
 ['PosInvoiceBackgroundTask',`"state"='RUNNING'`,['state']],
 ['AiReaderJob',`"status" IN ('RUNNING','PROCESSING','LOCAL_PROCESSING','AI_PROCESSING','POS_PROCESSING','POS_REPROCESSING','POS_RECOVERING')`,['status']],
 ['RbsCapDriverV1Request',`"status" NOT IN ('DECLINED','SALE_COMMITTED')`,['status']],
 ['AiOwnerWalletEntry',`"status" IN ('RESERVED','REVIEW')`,['status']],
 ['FtextCashRequest',`"status" <> 'SALE_COMMITTED'`,['status']],
 ['NetlinkTransaction',`"status" NOT IN ('COMPLETED','FAILED')`,['status']],
 ['CloudDevice',`"status"='ACTIVE' AND "lastSeenAt">NOW()-INTERVAL '60 seconds'`,['status','lastSeenAt']]
 ])if(plan.nodes.has(name)&&(connectors||name!=='CloudDevice')){if(required.some(c=>!meta.columns.get(name).has(c)))fail('Busy-work guard schema changed.');if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(name)} t WHERE (${predicate(plan,schema,plan.nodes.get(name),'t')}) AND (${condition}) LIMIT 1`,scope.storeId)).length)fail('Active shift, operator, Writer or fiscal work blocks maintenance.');}
 // The existing receiving service already holds this exact transaction lock
 // across remote fetches, including jobs started before fence enrollment.
 if(lockBackground&&plan.nodes.has('MyDataInboundDocument')){const held=(await tx.$queryRawUnsafe(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS held`,lifecycleMyDataLockKey(scope)))[0]?.held;if(!held)fail('Active shift, operator, Writer or fiscal work blocks maintenance.');}
}
async function assertScopedRelations(tx,plan,schema,scope,meta,mode){
 // Company financial history must never be removed by deleting a store.
 // RESET keeps its attributed rows; DELETE refuses until a separate reviewed
 // financial retention workflow exists. No generic KEEP/DELETE rule changes.
 if(mode==='DELETE'&&plan.nodes.has('AiOwnerWalletEntry')&&(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."AiOwnerWalletEntry" WHERE "storeId"=$1 LIMIT 1`,scope.storeId)).length)fail('AI wallet financial history blocks store deletion.');
 for(const guard of plan.valueGuards)if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(guard.table)} t WHERE (${predicate(plan,schema,plan.nodes.get(guard.table),'t')}) AND NOT COALESCE(t.${q(guard.column)}=ANY($2::text[]),false) LIMIT 1`,scope.storeId,guard.allowed)).length)fail('Unreviewed value in selected store: '+guard.table+'.'+guard.column);
 for(const node of plan.ordered){
  const where=predicate(plan,schema,node,'t');
  const cols=meta.columns.get(node.name),scopeChecks=[];
  if(cols.has('companyId'))scopeChecks.push('t."companyId" IS DISTINCT FROM $2');
  if(cols.has('storeId'))scopeChecks.push('t."storeId" IS DISTINCT FROM $1');
  if(scopeChecks.length&&(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(node.name)} t WHERE (${where}) AND (${scopeChecks.join(' OR ')}) LIMIT 1`,scope.storeId,...(cols.has('companyId')?[scope.companyId]:[]))).length)fail('Cross-store dependency or company mismatch blocks execution.');
 }
 // An owned FK must not cross to a different store, nor may deletion touch retained children.
 for(const fk of meta.fks.filter(f=>f.parentSchema===schema&&f.childSchema===schema&&plan.nodes.has(f.parent)&&plan.nodes.has(f.child))){
  const child=plan.nodes.get(fk.child),parent=plan.nodes.get(fk.parent),join=fk.local.map((c,i)=>`c.${q(c)}=p.${q(fk.remote[i])}`).join(' AND ')+(fk.applicationOwnership||fk.applicationReference?` AND (${matchExpression(fk.match,'c')})`:'');
  const bad=await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(child.name)} c JOIN ${q(schema)}.${q(parent.name)} p ON ${join} WHERE ((${predicate(plan,schema,child,'c')}) IS DISTINCT FROM (${predicate(plan,schema,parent,'p')})) LIMIT 1`,scope.storeId);if(bad.length)fail('Cross-store dependency blocks execution.');
  const childAction=mode==='DELETE'?'REMOVE':child.reset,parentAction=mode==='DELETE'?'REMOVE':parent.reset;
  if(childAction==='KEEP'&&parentAction==='REMOVE'){const refs=await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(child.name)} c JOIN ${q(schema)}.${q(parent.name)} p ON ${join} WHERE ${predicate(plan,schema,parent,'p')} LIMIT 1`,scope.storeId);if(refs.length)fail('Deletion would change a retained dependency.');}
 }
}
async function capture(tx,plan,schema,scope,mode){
 const meta=await validateDatabase(tx,plan,schema),tables=[];let sourceBytes=0,totalRows=0;
 await assertQuiescent(tx,plan,schema,scope,meta);
 await assertScopedRelations(tx,plan,schema,scope,meta,mode);
 for(const node of plan.ordered){
  const where=predicate(plan,schema,node,'t');
  const size=(await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,COALESCE(SUM(octet_length(row_to_json(t)::text)),0)::text AS bytes FROM ${q(schema)}.${q(node.name)} t WHERE ${where}`,scope.storeId))[0];
  const byteLimit=plan.streaming?1024*1024*1024:16*1024*1024;
  if(size.count>100000||BigInt(size.bytes)>BigInt(byteLimit-sourceBytes)||totalRows+size.count>500000)fail('Snapshot size limit exceeded before materialization.');sourceBytes+=Number(size.bytes);totalRows+=size.count;
  if(plan.streaming){
   const tableDigest=await digestLifecycleRows(scopedRows(tx,plan,schema,scope,node,meta));
   if(tableDigest.rowCount!==size.count||BigInt(tableDigest.sourceBytes)!==BigInt(size.bytes))fail('Source changed while streaming.');
   tables.push({name:node.name,action:mode==='DELETE'||node.reset==='REMOVE'?'REMOVE':'KEEP',...tableDigest});continue;
  }
  const rows=await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(schema)}.${q(node.name)} t WHERE ${where} ORDER BY row_to_json(t)::text LIMIT 100001`,scope.storeId);
  if(rows.length>100000)fail('Snapshot row limit exceeded.');tables.push({name:node.name,action:mode==='DELETE'||node.reset==='REMOVE'?'REMOVE':'KEEP',rows:rows.map(r=>r.row)});
 }
 const snapshot={scope:{...scope,mode},planHash:plan.planHash,sourceRevision:plan.sourceRevision,schemaSignature:meta.signature,...(plan.streaming?{rowDigestFormat:LIFECYCLE_ROW_DIGEST_FORMAT}:{}),tables};const encoded=JSON.stringify(snapshot);if(Buffer.byteLength(encoded)>32*1024*1024)fail('Snapshot byte limit exceeded.');return {...snapshot,snapshotHash:lifecycleExecutionSnapshotHash(snapshot)};
}
async function persistOwnershipTombstones(tx,plan,schema,snapshot,operationId,generation){
 const seen=new Set();
 for(const edge of applicationEdges(plan,schema).filter(e=>e.applicationReference||plan.nodes.get(e.child).owner.kind==='LINK')){
  const parent=plan.nodes.get(edge.parent),table=snapshot.tables.find(t=>t.name===edge.parent);
  if(table.action!=='REMOVE')continue;
  const key=JSON.stringify([edge.parent,edge.remote]);if(seen.has(key))continue;seen.add(key);
  const values=edge.remote.map(name=>`t.${q(name)}::text`).join(',');
  const count=Number(await tx.$executeRawUnsafe(`INSERT INTO ${q(schema)}."StoreLifecycleTombstone" ("id","companyId","storeId","schemaName","parentTable","refColumns","refValues","generation","operationId")
   SELECT concat($3::text,':',$4::text,':',(row_number() OVER ())::text),$2,$1,$5,$6,$7::jsonb,jsonb_build_array(${values}),$8::bigint,$3
   FROM ${q(schema)}.${q(parent.name)} t WHERE ${predicate(plan,schema,parent,'t')}`,snapshot.scope.storeId,snapshot.scope.companyId,operationId,hash(key).slice(0,24),schema,parent.name,JSON.stringify(edge.remote),String(generation)));
  if(count!==tableCount(table))fail('Application-key retirement count differs.');
 }
}
function inspectionFor(plan){return async(db,actor,scope)=>{
 requireLifecycleAdmin(actor);
 if(typeof scope?.companyId!=='string'||!scope.companyId||typeof scope?.storeId!=='string'||!scope.storeId)fail('Explicit selected company and store required.',400);
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL TimeZone='UTC'");await tx.$executeRawUnsafe("SET LOCAL DateStyle='ISO,YMD'");await tx.$executeRawUnsafe("SET LOCAL extra_float_digits=3");await tx.$executeRawUnsafe("SET LOCAL bytea_output='hex'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
  const schema=await schemaFor(tx);
  if(!(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope.storeId,scope.companyId)).length)fail('Store not found in selected company.',404);
  const meta=await validateDatabase(tx,plan,schema,{allowUninstalled:true});
  await assertScopedRelations(tx,plan,schema,scope,meta,'RESET');
  let activeWork=false;
  try{await assertQuiescent(tx,plan,schema,scope,meta,{lockBackground:false})}catch(error){if(error.message==='Active shift, operator, Writer or fiscal work blocks maintenance.')activeWork=true;else throw error}
  const counts=[];
  for(const node of plan.ordered){const row=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,COALESCE(sum(octet_length(row_to_json(t)::text)),0)::text AS bytes,COALESCE(max(octet_length(row_to_json(t)::text)),0)::int AS "maxRowBytes" FROM ${q(schema)}.${q(node.name)} t WHERE ${predicate(plan,schema,node,'t')}`,scope.storeId))[0];counts.push({table:node.name,action:node.reset,count:row.count,sourceBytes:row.bytes,maxRowBytes:row.maxRowBytes})}
  const totalRows=counts.reduce((sum,t)=>sum+t.count,0),sourceBytes=counts.reduce((sum,t)=>sum+BigInt(t.sourceBytes),0n),withinSnapshotLimits=totalRows<=500000&&sourceBytes<=BigInt(plan.streaming?1024*1024*1024:16*1024*1024)&&counts.every(t=>t.count<=100000&&t.maxRowBytes<=8*1024*1024);
  const result={scope:{companyId:scope.companyId,storeId:scope.storeId},mode:'RESET',planHash:plan.planHash,sourceRevision:plan.sourceRevision,schemaSignature:meta.signature,counts,totalRows,sourceBytes:sourceBytes.toString(),withinSnapshotLimits,activeWork,backgroundLocksChecked:false,guardsInstalled:meta.guardsInstalled,executionAvailable:false,recoveryVerified:false};
  return {...result,inspectionFingerprint:hash(result)};
 },{isolationLevel:'RepeatableRead',timeout:120000,maxWait:5000});
}}
export function createLifecycleInspectionCore(manifest,{sourceRevision}={}){
 const reviewed=structuredClone(manifest),plan=planFor(reviewed);plan.reviewedColumns=reviewed.reviewedColumns||[];plan.sourceRevision=sourceRevision;
 if(!/^[a-f0-9]{40}$/.test(sourceRevision||''))fail('Exact server source revision is required.');
 return Object.freeze({inspect:inspectionFor(plan)});
}
export function createLifecycleExecutionCore(manifest,{persistAndVerifyRecovery,sourceRevision}={}){
 const reviewed=structuredClone(manifest),plan=planFor(reviewed);plan.reviewedColumns=reviewed.reviewedColumns||[];plan.sourceRevision=sourceRevision;
 if(typeof persistAndVerifyRecovery!=='function')fail('A durable full-restore verification adapter is required.');if(!/^[a-f0-9]{40}$/.test(sourceRevision||''))fail('Exact server source revision is required.');
 const transaction=(db,fn)=>db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL TimeZone='UTC'");await tx.$executeRawUnsafe("SET LOCAL DateStyle='ISO,YMD'");await tx.$executeRawUnsafe("SET LOCAL extra_float_digits=3");await tx.$executeRawUnsafe("SET LOCAL bytea_output='hex'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");return fn(tx)},{isolationLevel:'ReadCommitted',timeout:120000,maxWait:5000});
 return {
  inspect:inspectionFor(plan),
  async install(db,actor,scope){requireLifecycleAdmin(actor);return transaction(db,async tx=>{
   const schema=await schemaFor(tx);
   if(!(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope?.storeId,scope?.companyId)).length)fail('Store not found in selected company.',404);
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${q(schema)}."StoreLifecycleFence" ("storeId" text PRIMARY KEY,"companyId" text NOT NULL,"generation" bigint NOT NULL DEFAULT 0,"maintenance" boolean NOT NULL DEFAULT false,"retired" boolean NOT NULL DEFAULT false,"operationId" text,"planHash" text NOT NULL)`);
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${q(schema)}."StoreLifecycleExecution" ("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL,"mode" text NOT NULL,"planHash" text NOT NULL,"snapshotHash" text NOT NULL,"state" text NOT NULL,"expiresAt" timestamptz NOT NULL,"result" jsonb)`);
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${q(schema)}."StoreLifecycleTombstone" ("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL,"schemaName" text NOT NULL,"parentTable" text NOT NULL,"refColumns" jsonb NOT NULL,"refValues" jsonb NOT NULL,"generation" bigint NOT NULL,"operationId" text NOT NULL)`);
   await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreLifecycleTombstone_parent_idx" ON ${q(schema)}."StoreLifecycleTombstone" ("schemaName","parentTable")`);
   if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."StoreLifecycleFence" WHERE "maintenance" LIMIT 1`)).length)fail('Cannot change guards during maintenance.');
   bindDatabaseReferences(plan,schema,await readForeignKeys(tx,schema));
   for(const node of plan.ordered){const name=guardName(node);for(const [fn,body,event,row] of [[name,guardBody(plan,schema,node),'INSERT OR UPDATE OR DELETE','ROW'],[name+'_truncate',truncateBody,'TRUNCATE','STATEMENT']]){await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${q(schema)}.${q(fn)}() RETURNS trigger LANGUAGE plpgsql AS $mws$${body}$mws$`);await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${q(fn)} ON ${q(schema)}.${q(node.name)}`);await tx.$executeRawUnsafe(`CREATE TRIGGER ${q(fn)} BEFORE ${event} ON ${q(schema)}.${q(node.name)} FOR EACH ${row} EXECUTE FUNCTION ${q(schema)}.${q(fn)}()`);await tx.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(node.name)} ENABLE ALWAYS TRIGGER ${q(fn)}`)}}
   await validateDatabase(tx,plan,schema);
   await tx.$executeRawUnsafe(`INSERT INTO ${q(schema)}."StoreLifecycleFence" ("storeId","companyId","planHash") VALUES($1,$2,$3) ON CONFLICT("storeId") DO NOTHING`,scope.storeId,scope.companyId,plan.planHash);
   const enrolled=(await tx.$queryRawUnsafe(`SELECT "companyId","planHash" FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1`,scope.storeId))[0];if(enrolled.companyId!==scope.companyId||enrolled.planHash!==plan.planHash)fail('Guard enrollment differs.');
   return {installed:true,planHash:plan.planHash};
  })},
  async beginDrain(db,actor,scope,mode){requireLifecycleAdmin(actor);if(mode!=='RESET')fail('Explicit RESET drain required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx);if(!(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope.storeId,scope.companyId)).length)fail('Store not found in selected company.',404);
   const fence=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,scope.storeId))[0];if(!fence||fence.companyId!==scope.companyId||fence.retired||fence.maintenance||fence.planHash!==plan.planHash)fail('Store maintenance cannot be acquired.');
   const meta=await validateDatabase(tx,plan,schema);await assertQuiescent(tx,plan,schema,scope,meta,{connectors:false});
   const operationId=randomUUID(),snapshotHash=drainFingerprint(plan,scope,mode,operationId);
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "maintenance"=true,"operationId"=$2 WHERE "storeId"=$1`,scope.storeId,operationId);
   await tx.$executeRawUnsafe(`INSERT INTO ${q(schema)}."StoreLifecycleExecution" ("id","companyId","storeId","mode","planHash","snapshotHash","state","expiresAt") VALUES($1,$2,$3,$4,$5,$6,'DRAINING',NOW()+INTERVAL '30 minutes')`,operationId,scope.companyId,scope.storeId,mode,plan.planHash,snapshotHash);
   return {operationId,mode,state:'DRAINING',maintenance:true,executionAvailable:false};
  })},
  async prepare(db,actor,scope,mode,{drainOperationId}={}){requireLifecycleAdmin(actor);if(!['RESET','DELETE'].includes(mode))fail('Explicit mode required.',400);if(drainOperationId!==undefined&&!uuid.test(drainOperationId||''))fail('Exact drain operation required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx);
   const drain=drainOperationId?(await tx.$queryRawUnsafe(`SELECT *,"expiresAt">NOW() AS fresh FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE`,drainOperationId,scope.companyId,scope.storeId))[0]:null;
   if(drainOperationId&&(!drain||drain.state!=='DRAINING'||!drain.fresh||drain.mode!==mode||drain.planHash!==plan.planHash||drain.snapshotHash!==drainFingerprint(plan,scope,mode,drainOperationId)))fail('Drain operation expired or differs.');
   if(!(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope.storeId,scope.companyId)).length)fail('Store not found in selected company.',404);
   const fence=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,scope.storeId))[0];if(!fence||fence.companyId!==scope.companyId||fence.retired||fence.planHash!==plan.planHash||(drainOperationId?(!fence.maintenance||fence.operationId!==drainOperationId):fence.maintenance))fail('Store maintenance cannot be acquired.');
   const operationId=drainOperationId||randomUUID();await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "maintenance"=true,"operationId"=$2 WHERE "storeId"=$1`,scope.storeId,operationId);
   for(const node of [...plan.ordered].sort((a,b)=>a.name.localeCompare(b.name)))await tx.$executeRawUnsafe(`LOCK TABLE ${q(schema)}.${q(node.name)} IN ROW EXCLUSIVE MODE`);
   const snapshot=await capture(tx,plan,schema,scope,mode);
   if(drainOperationId)await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "snapshotHash"=$2,"state"='PREPARED',"expiresAt"=NOW()+INTERVAL '10 minutes' WHERE "id"=$1`,operationId,snapshot.snapshotHash);
   else await tx.$executeRawUnsafe(`INSERT INTO ${q(schema)}."StoreLifecycleExecution" ("id","companyId","storeId","mode","planHash","snapshotHash","state","expiresAt") VALUES($1,$2,$3,$4,$5,$6,'PREPARED',NOW()+INTERVAL '10 minutes')`,operationId,scope.companyId,scope.storeId,mode,plan.planHash,snapshot.snapshotHash);
   // Strings preserve the exact JSON property order used by the snapshot hash
   // across PostgreSQL jsonb. Only streaming metadata is queued, never row data.
   if(plan.streaming){const meta=await validateDatabase(tx,plan,schema);const recoveryRequest={protocol:'MWS_STORE_RECOVERY_JOB_V1',operationId,schema,snapshotMetadataJson:JSON.stringify(snapshot),schemaDescriptorJson:JSON.stringify(meta.descriptor)};await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "result"=$2::jsonb WHERE "id"=$1`,operationId,JSON.stringify({recoveryRequest}));}
   return {operationId,snapshotHash:snapshot.snapshotHash,mode,counts:snapshot.tables.map(t=>({table:t.name,count:tableCount(t),action:t.action})),maintenance:true};
  })},
  async abort(db,actor,{companyId,storeId,operationId}){requireLifecycleAdmin(actor);if(!uuid.test(operationId||''))fail('Exact prepared operation required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx),run=(await tx.$queryRawUnsafe(`SELECT "state" FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE`,operationId,companyId,storeId))[0];if(!run||!['DRAINING','PREPARED'].includes(run.state))fail('Only an unexecuted preparation can be aborted.');
   const fence=(await tx.$queryRawUnsafe(`SELECT "operationId","companyId" FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,storeId))[0];if(!fence||fence.companyId!==companyId||fence.operationId!==operationId)fail('Maintenance fence differs.');
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "state"='ABORTED' WHERE "id"=$1`,operationId);await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "maintenance"=false,"operationId"=NULL WHERE "storeId"=$1`,storeId);return {aborted:true,operationId};
  })},
  async execute(db,actor,{companyId,storeId,operationId,snapshotHash}){requireLifecycleAdmin(actor);if(!uuid.test(operationId||'')||!/^[a-f0-9]{64}$/.test(snapshotHash||''))fail('Exact prepared operation required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx),run=(await tx.$queryRawUnsafe(`SELECT *,"expiresAt">NOW() AS fresh FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE`,operationId,companyId,storeId))[0];if(!run)fail('Operation not found in selected store.',404);if(run.snapshotHash!==snapshotHash||run.planHash!==plan.planHash)fail('Prepared operation differs.');if(['COMPLETED','REOPENED'].includes(run.state))return {...run.result,idempotentReplay:true};if(run.state!=='PREPARED'||!run.fresh)fail('Prepared operation expired or unavailable.');
   const fence=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,storeId))[0];if(!fence||!fence.maintenance||fence.operationId!==operationId||fence.companyId!==companyId||fence.planHash!==plan.planHash)fail('Maintenance fence differs.');
   for(const node of [...plan.ordered].sort((a,b)=>a.name.localeCompare(b.name)))await tx.$executeRawUnsafe(`LOCK TABLE ${q(schema)}.${q(node.name)} IN ROW EXCLUSIVE MODE`);
   const snapshot=await capture(tx,plan,schema,{companyId,storeId},run.mode);if(snapshot.snapshotHash!==snapshotHash)fail('Rows changed after preview.');
   const recoveryMeta=plan.streaming?await validateDatabase(tx,plan,schema):null;
   const reader=plan.streaming?{readRows:name=>{const node=plan.nodes.get(name);if(!node)fail('Unknown recovery table.');return scopedRows(tx,plan,schema,{companyId,storeId},node,recoveryMeta)}}:undefined;
   const proof=await persistAndVerifyRecovery(freeze(snapshot),{...reader,operationId});if(proof?.sourceRevision!==sourceRevision||proof?.manifestHash!==plan.planHash||proof?.companyId!==companyId||proof?.storeId!==storeId||proof?.mode!==run.mode||proof?.snapshotHash!==snapshotHash||proof?.restoredSnapshotHash!==snapshotHash||proof?.storageReadbackVerified!==true||!/^[a-f0-9]{64}$/.test(proof?.artifactSha256||''))fail('Durable recovery and complete restore are not verified.');
   await persistOwnershipTombstones(tx,plan,schema,snapshot,operationId,fence.generation);
   await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_operation',$1,true)`,operationId);
   // All declared FK dependencies, not just the ownership edge, determine deletion order.
   const meta=await validateDatabase(tx,plan,schema),pending=new Set(snapshot.tables.filter(t=>t.action==='REMOVE').map(t=>t.name)),order=[];
   // Non-owning raw references do not constrain DELETE order: they have no FK
   // cascade and predicates do not depend on them. They still participate in
   // scope validation, write fencing and pre-delete retired-key capture. Keep
   // every real FK and ownership join in the dependency order.
   while(pending.size){const ready=[...pending].filter(name=>!meta.fks.some(f=>!f.applicationReference&&f.childSchema===schema&&f.parentSchema===schema&&f.parent===name&&f.child!==name&&pending.has(f.child)));if(!ready.length)fail('Cyclic deletion dependencies require a reviewed executor.');for(const name of ready.sort()){order.push(name);pending.delete(name)}}
   const deleted=[];for(const name of order){const node=plan.nodes.get(name),expected=tableCount(snapshot.tables.find(t=>t.name===name));const count=Number(await tx.$executeRawUnsafe(`DELETE FROM ${q(schema)}.${q(name)} t WHERE ${predicate(plan,schema,node,'t')}`,storeId));if(count!==expected)fail('Unexpected delete count.');deleted.push({table:name,count})}
   for(const t of snapshot.tables.filter(t=>t.action==='KEEP')){if(plan.streaming){const observed=await digestLifecycleRows(scopedRows(tx,plan,schema,{companyId,storeId},plan.nodes.get(t.name),meta));if(observed.rowCount!==t.rowCount||observed.sha256!==t.sha256||observed.sourceBytes!==t.sourceBytes)fail('Retained records changed.');continue;}const rows=await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(schema)}.${q(t.name)} t WHERE ${predicate(plan,schema,plan.nodes.get(t.name),'t')} ORDER BY row_to_json(t)::text`,storeId);if(JSON.stringify(rows.map(r=>r.row))!==JSON.stringify(t.rows))fail('Retained records changed.');}
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "generation"="generation"+1,"retired"=$2 WHERE "storeId"=$1`,storeId,run.mode==='DELETE');
   const kept=[];for(const t of snapshot.tables.filter(t=>t.action==='KEEP'))kept.push({name:t.name,...(plan.streaming?{rowCount:t.rowCount,sha256:t.sha256,sourceBytes:t.sourceBytes}:await digestLifecycleRows(t.rows))});
   const result={operationId,companyId,storeId,mode:run.mode,deleted,kept,keptDigestFormat:LIFECYCLE_ROW_DIGEST_FORMAT,executedBy:actor.id,physicalEvidence:run.result?.physicalEvidence||null,recovery:{objectKey:proof.objectKey||null,objectVersion:proof.objectVersion||null,verifiedAt:proof.verifiedAt||null},sourceRevision,generation:(BigInt(fence.generation)+1n).toString(),completedAt:new Date().toISOString(),artifactSha256:proof.artifactSha256,maintenance:true,reopenRequired:true,idempotentReplay:false};await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "state"='COMPLETED',"result"=$2::jsonb WHERE "id"=$1`,operationId,JSON.stringify(result));return result;
  })},
  async reopen(db,actor,{companyId,storeId,operationId}){requireLifecycleAdmin(actor);if(!uuid.test(operationId||''))fail('Exact completed operation required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx),run=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE`,operationId,companyId,storeId))[0];
   if(!run||run.mode!=='RESET'||!['COMPLETED','REOPENED'].includes(run.state)||run.planHash!==plan.planHash||!Array.isArray(run.result?.kept))fail('A verified completed RESET is required.');
   const fence=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,storeId))[0];
   if(!fence||fence.companyId!==companyId||fence.retired||fence.planHash!==plan.planHash||String(fence.generation)!==run.result.generation)fail('Completed store generation differs.');
   if(run.state==='REOPENED'){if(fence.maintenance||fence.operationId!==null)fail('Reopened fence differs.');return {...run.result,idempotentReplay:true}}
   if(!fence.maintenance||fence.operationId!==operationId)fail('Completed maintenance fence differs.');
   const meta=await validateDatabase(tx,plan,schema);await assertQuiescent(tx,plan,schema,{companyId,storeId},meta);await assertScopedRelations(tx,plan,schema,{companyId,storeId},meta,'RESET');
   for(const node of plan.ordered){
    if(node.reset==='REMOVE'){if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(node.name)} t WHERE ${predicate(plan,schema,node,'t')} LIMIT 1`,storeId)).length)fail('New-start rows are not empty.');continue}
    const expected=run.result.kept.find(t=>t.name===node.name);if(!expected)fail('Retained snapshot missing.');
    const rows=plan.streaming?scopedRows(tx,plan,schema,{companyId,storeId},node,meta):(await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(schema)}.${q(node.name)} t WHERE ${predicate(plan,schema,node,'t')} ORDER BY row_to_json(t)::text`,storeId)).map(r=>r.row);
    const observed=await digestLifecycleRows(rows);if(['rowCount','sha256','sourceBytes'].some(k=>observed[k]!==expected[k]))fail('Retained installation changed before reopen.');
   }
   const result={...run.result,maintenance:false,reopenRequired:false,reopenedAt:new Date().toISOString()};
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "maintenance"=false,"operationId"=NULL WHERE "storeId"=$1`,storeId);
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "state"='REOPENED',"result"=$2::jsonb WHERE "id"=$1`,operationId,JSON.stringify(result));return result;
  })}
 };
}

export function lifecycleExecutionSnapshotHash(snapshot){const {snapshotHash,...value}=snapshot;return hash(value)}

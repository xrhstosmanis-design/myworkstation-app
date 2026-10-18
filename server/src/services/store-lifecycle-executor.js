// Internal execution core. No production manifest, recovery adapter or HTTP route is registered here.
import {createHash,randomUUID} from 'node:crypto';
import {requireLifecycleAdmin} from './store-lifecycle-preview.js';
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
const INTERNAL=new Set(['StoreLifecycleFence','StoreLifecycleExecution']);
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v)}return value};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function planFor(manifest){
 if(!manifest?.id||!Array.isArray(manifest.tables)||manifest.tables.length<1||manifest.tables.length>300)fail('A reviewed server manifest is required.');
 const nodes=new Map();
 for(const row of manifest.tables){if(typeof row.name!=='string'||!row.name||INTERNAL.has(row.name)||nodes.has(row.name)||!['KEEP','REMOVE'].includes(row.reset)||!['ROOT','DIRECT','CHILD'].includes(row.owner?.kind))fail('Invalid reviewed manifest.');nodes.set(row.name,row)}
 if(nodes.get('Store')?.owner.kind!=='ROOT'||nodes.get('Store')?.reset!=='KEEP'||[...nodes.values()].filter(x=>x.owner.kind==='ROOT').length!==1)fail('Store root must be retained by RESET.');
 const visiting=new Set(),visited=new Set(),ordered=[];
 const visit=name=>{if(visiting.has(name))fail('Cyclic ownership requires a separate reviewed plan.');if(visited.has(name))return;const row=nodes.get(name);if(!row)fail('Missing ownership parent.');visiting.add(name);if(row.owner.kind==='CHILD'){if(!Array.isArray(row.owner.columns)||!row.owner.columns.length||row.owner.columns.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='string'||!v)))fail('Invalid ownership columns.');visit(row.owner.parent)}visiting.delete(name);visited.add(name);ordered.push(row)};
 for(const name of nodes.keys())visit(name);
 return {id:manifest.id,nodes,ordered,planHash:hash(manifest)};
}
function predicate(plan,schema,node,alias,depth=0){
 if(node.owner.kind==='ROOT')return `${alias}."id"=$1`;
 if(node.owner.kind==='DIRECT')return `${alias}."storeId"=$1`;
 const parent=plan.nodes.get(node.owner.parent),p='p'+depth;
 return `EXISTS (SELECT 1 FROM ${q(schema)}.${q(parent.name)} ${p} WHERE ${node.owner.columns.map(([local,remote])=>`${alias}.${q(local)}=${p}.${q(remote)}`).join(' AND ')} AND (${predicate(plan,schema,parent,p,depth+1)}))`;
}
function storeExpression(plan,schema,node,record,depth=0){
 if(node.owner.kind==='ROOT')return `${record}."id"`;
 if(node.owner.kind==='DIRECT')return `${record}."storeId"`;
 const parent=plan.nodes.get(node.owner.parent),p='o'+depth;
 return `(SELECT ${storeExpression(plan,schema,parent,p,depth+1)} FROM ${q(schema)}.${q(parent.name)} ${p} WHERE ${node.owner.columns.map(([local,remote])=>`${record}.${q(local)}=${p}.${q(remote)}`).join(' AND ')} LIMIT 1)`;
}
const truncateBody="BEGIN RAISE EXCEPTION 'STORE_LIFECYCLE_TRUNCATE_FORBIDDEN' USING ERRCODE='55000'; END;";
const guardName=node=>'mws_lifecycle_'+hash(node.name).slice(0,16);
function guardBody(plan,schema,node){return `DECLARE old_store text; new_store text; sid text; fence record; BEGIN
 IF TG_OP<>'INSERT' THEN old_store := ${storeExpression(plan,schema,node,'OLD')}; END IF;
 IF TG_OP<>'DELETE' THEN new_store := ${storeExpression(plan,schema,node,'NEW')}; END IF;
 FOR sid IN SELECT DISTINCT x.s FROM unnest(ARRAY[old_store,new_store]) AS x(s) WHERE x.s IS NOT NULL ORDER BY x.s LOOP
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
async function validateDatabase(tx,plan,schema){
 const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname`,schema);
 const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema);
 for(const node of plan.ordered){const r=relations.find(r=>r.name===node.name);if(!r||r.kind!=='r'||r.partition||r.rls||r.forced)fail('Complex or RLS relation requires a separate executor.');}
 if(columns.length>20000)fail('Schema review limit exceeded.');
 const byTable=new Map();for(const col of columns){if(!byTable.has(col.table))byTable.set(col.table,new Set());byTable.get(col.table).add(col.name);if(col.name==='storeId'&&!INTERNAL.has(col.table)&&!plan.nodes.has(col.table))fail('Unreviewed store table: '+col.table)}
 for(const node of plan.ordered){const cols=byTable.get(node.name);if(!cols||node.owner.kind==='ROOT'&&!cols.has('id')||node.owner.kind==='DIRECT'&&!cols.has('storeId'))fail('Reviewed table layout changed.');}
 const fks=await tx.$queryRawUnsafe(`SELECT child.relname AS child,parent.relname AS parent,pn.nspname AS "parentSchema",cn.nspname AS "childSchema",ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.p) AS local,ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.p) AS remote FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace JOIN pg_namespace pn ON pn.oid=parent.relnamespace WHERE c.contype='f' AND (cn.nspname=$1 OR pn.nspname=$1) ORDER BY cn.nspname,child.relname,c.conname`,schema);
 if(fks.length>10000)fail('Dependency review limit exceeded.');
 for(const fk of fks){if(fk.parentSchema===schema&&plan.nodes.has(fk.parent)&&(fk.childSchema!==schema||!plan.nodes.has(fk.child)))fail('Unreviewed incoming dependency: '+fk.child)}
 for(const node of plan.ordered.filter(n=>n.owner.kind==='CHILD'))if(!fks.some(f=>f.childSchema===schema&&f.parentSchema===schema&&f.child===node.name&&f.parent===node.owner.parent&&JSON.stringify(f.local)===JSON.stringify(node.owner.columns.map(p=>p[0]))&&JSON.stringify(f.remote)===JSON.stringify(node.owner.columns.map(p=>p[1]))))fail('Reviewed ownership FK changed.');
 const triggers=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,t.tgtype::int AS mask,t.tgqual::text AS condition,t.tgattr::text AS attributes,p.prosrc AS body,pn.nspname AS "functionSchema",p.proname AS "functionName",p.prosecdef AS definer,l.lanname AS language FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND NOT t.tgisinternal`,schema);
 for(const node of plan.ordered){const own=triggers.filter(t=>t.table===node.name),name=guardName(node);if(own.length!==2)fail('Missing or additional database guards: '+node.name);for(const [triggerName,mask,body] of [[name,31,guardBody(plan,schema,node)],[name+'_truncate',34,truncateBody]]){const trigger=own.find(t=>t.name===triggerName);if(!trigger||trigger.enabled!=='A'||trigger.mask!==mask||trigger.condition!==null||trigger.attributes!==''||trigger.body!==body||trigger.functionSchema!==schema||trigger.functionName!==triggerName||trigger.definer||trigger.language!=='plpgsql')fail('Changed database guard: '+node.name)}}
 // ID/JSON/attachment semantics must be reviewed in server code; this core cannot infer them.
 const reviewed=new Set((plan.reviewedColumns||[]));
 for(const col of columns.filter(c=>!INTERNAL.has(c.table))){
  if((/Id$/.test(col.name)&&!['companyId','storeId'].includes(col.name)&&!fks.some(f=>f.childSchema===schema&&f.child===col.table&&f.local.includes(col.name)))||['json','jsonb','bytea'].includes(col.type)||/storageKey|contentData|attachmentData|dataUrl|filePath|imageUrl|photoUrl/i.test(col.name))if(!reviewed.has(col.table+'.'+col.name))fail('Unreviewed application or attachment field: '+col.table+'.'+col.name);
 }
 return {columns:byTable,fks,signature:hash({relations:relations.filter(r=>plan.nodes.has(r.name)),columns:columns.filter(c=>plan.nodes.has(c.table)),fks})};
}
async function capture(tx,plan,schema,scope,mode){
 const meta=await validateDatabase(tx,plan,schema),tables=[];let sourceBytes=0,totalRows=0;
 for(const [name,condition,required] of [
 ['CashShiftSession',`"status"='OPEN'`,['status']],
 ['StoreOperatorSession',`"revokedAt" IS NULL AND "expiresAt">NOW()`,['revokedAt','expiresAt']],
 ['RbsCapDriverV1Request',`"status" NOT IN ('DECLINED','SALE_COMMITTED')`,['status']],
 ['CloudDevice',`"status"='ACTIVE' AND "lastSeenAt">NOW()-INTERVAL '60 seconds'`,['status','lastSeenAt']]
 ])if(plan.nodes.has(name)){if(required.some(c=>!meta.columns.get(name).has(c)))fail('Busy-work guard schema changed.');if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(name)} t WHERE (${predicate(plan,schema,plan.nodes.get(name),'t')}) AND (${condition}) LIMIT 1`,scope.storeId)).length)fail('Active shift, operator, Writer or fiscal work blocks maintenance.');}
 for(const node of plan.ordered){
  const where=predicate(plan,schema,node,'t');
  if(meta.columns.get(node.name).has('companyId')){const bad=await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(node.name)} t WHERE (${where}) AND t."companyId" IS DISTINCT FROM $2 LIMIT 1`,scope.storeId,scope.companyId);if(bad.length)fail('Inconsistent company/store ownership.');}
  const size=(await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,COALESCE(SUM(octet_length(row_to_json(t)::text)),0)::text AS bytes FROM ${q(schema)}.${q(node.name)} t WHERE ${where}`,scope.storeId))[0];
  if(size.count>100000||BigInt(size.bytes)>BigInt(16*1024*1024-sourceBytes)||totalRows+size.count>500000)fail('Snapshot size limit exceeded before materialization.');sourceBytes+=Number(size.bytes);totalRows+=size.count;
  const rows=await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(schema)}.${q(node.name)} t WHERE ${where} ORDER BY row_to_json(t)::text LIMIT 100001`,scope.storeId);
  if(rows.length>100000)fail('Snapshot row limit exceeded.');tables.push({name:node.name,action:mode==='DELETE'||node.reset==='REMOVE'?'REMOVE':'KEEP',rows:rows.map(r=>r.row)});
 }
 // An owned FK must not cross to a different store, nor may deletion touch retained children.
 for(const fk of meta.fks.filter(f=>f.parentSchema===schema&&f.childSchema===schema&&plan.nodes.has(f.parent)&&plan.nodes.has(f.child))){
  const child=plan.nodes.get(fk.child),parent=plan.nodes.get(fk.parent),join=fk.local.map((c,i)=>`c.${q(c)}=p.${q(fk.remote[i])}`).join(' AND ');
  const bad=await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(child.name)} c JOIN ${q(schema)}.${q(parent.name)} p ON ${join} WHERE ((${predicate(plan,schema,child,'c')}) IS DISTINCT FROM (${predicate(plan,schema,parent,'p')})) LIMIT 1`,scope.storeId);if(bad.length)fail('Cross-store dependency blocks execution.');
  const childAction=tables.find(t=>t.name===child.name).action,parentAction=tables.find(t=>t.name===parent.name).action;
  if(childAction==='KEEP'&&parentAction==='REMOVE'){const refs=await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}.${q(child.name)} c JOIN ${q(schema)}.${q(parent.name)} p ON ${join} WHERE ${predicate(plan,schema,parent,'p')} LIMIT 1`,scope.storeId);if(refs.length)fail('Deletion would change a retained dependency.');}
 }
 const snapshot={scope:{...scope,mode},planHash:plan.planHash,sourceRevision:plan.sourceRevision,schemaSignature:meta.signature,tables};const encoded=JSON.stringify(snapshot);if(Buffer.byteLength(encoded)>32*1024*1024)fail('Snapshot byte limit exceeded.');return {...snapshot,snapshotHash:lifecycleExecutionSnapshotHash(snapshot)};
}
export function createLifecycleExecutionCore(manifest,{persistAndVerifyRecovery,sourceRevision}={}){
 const reviewed=structuredClone(manifest),plan=planFor(reviewed);plan.reviewedColumns=reviewed.reviewedColumns||[];plan.sourceRevision=sourceRevision;
 if(typeof persistAndVerifyRecovery!=='function')fail('A durable full-restore verification adapter is required.');if(!/^[a-f0-9]{40}$/.test(sourceRevision||''))fail('Exact server source revision is required.');
 const transaction=(db,fn)=>db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");return fn(tx)},{isolationLevel:'ReadCommitted',timeout:120000,maxWait:5000});
 return {
  async install(db,actor,scope){requireLifecycleAdmin(actor);return transaction(db,async tx=>{
   const schema=await schemaFor(tx);
   if(!(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope?.storeId,scope?.companyId)).length)fail('Store not found in selected company.',404);
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${q(schema)}."StoreLifecycleFence" ("storeId" text PRIMARY KEY,"companyId" text NOT NULL,"generation" bigint NOT NULL DEFAULT 0,"maintenance" boolean NOT NULL DEFAULT false,"retired" boolean NOT NULL DEFAULT false,"operationId" text,"planHash" text NOT NULL)`);
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${q(schema)}."StoreLifecycleExecution" ("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL,"mode" text NOT NULL,"planHash" text NOT NULL,"snapshotHash" text NOT NULL,"state" text NOT NULL,"expiresAt" timestamptz NOT NULL,"result" jsonb)`);
   if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."StoreLifecycleFence" WHERE "maintenance" LIMIT 1`)).length)fail('Cannot change guards during maintenance.');
   for(const node of plan.ordered){const name=guardName(node);for(const [fn,body,event,row] of [[name,guardBody(plan,schema,node),'INSERT OR UPDATE OR DELETE','ROW'],[name+'_truncate',truncateBody,'TRUNCATE','STATEMENT']]){await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${q(schema)}.${q(fn)}() RETURNS trigger LANGUAGE plpgsql AS $mws$${body}$mws$`);await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${q(fn)} ON ${q(schema)}.${q(node.name)}`);await tx.$executeRawUnsafe(`CREATE TRIGGER ${q(fn)} BEFORE ${event} ON ${q(schema)}.${q(node.name)} FOR EACH ${row} EXECUTE FUNCTION ${q(schema)}.${q(fn)}()`);await tx.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(node.name)} ENABLE ALWAYS TRIGGER ${q(fn)}`)}}
   await validateDatabase(tx,plan,schema);
   await tx.$executeRawUnsafe(`INSERT INTO ${q(schema)}."StoreLifecycleFence" ("storeId","companyId","planHash") VALUES($1,$2,$3) ON CONFLICT("storeId") DO NOTHING`,scope.storeId,scope.companyId,plan.planHash);
   const enrolled=(await tx.$queryRawUnsafe(`SELECT "companyId","planHash" FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1`,scope.storeId))[0];if(enrolled.companyId!==scope.companyId||enrolled.planHash!==plan.planHash)fail('Guard enrollment differs.');
   return {installed:true,planHash:plan.planHash};
  })},
  async prepare(db,actor,scope,mode){requireLifecycleAdmin(actor);if(!['RESET','DELETE'].includes(mode))fail('Explicit mode required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx);if(!(await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope.storeId,scope.companyId)).length)fail('Store not found in selected company.',404);
   const fence=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,scope.storeId))[0];if(!fence||fence.companyId!==scope.companyId||fence.retired||fence.maintenance||fence.planHash!==plan.planHash)fail('Store maintenance cannot be acquired.');
   const operationId=randomUUID();await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "maintenance"=true,"operationId"=$2 WHERE "storeId"=$1`,scope.storeId,operationId);
   for(const node of [...plan.ordered].sort((a,b)=>a.name.localeCompare(b.name)))await tx.$executeRawUnsafe(`LOCK TABLE ${q(schema)}.${q(node.name)} IN ROW EXCLUSIVE MODE`);
   const snapshot=await capture(tx,plan,schema,scope,mode);
   await tx.$executeRawUnsafe(`INSERT INTO ${q(schema)}."StoreLifecycleExecution" ("id","companyId","storeId","mode","planHash","snapshotHash","state","expiresAt") VALUES($1,$2,$3,$4,$5,$6,'PREPARED',NOW()+INTERVAL '10 minutes')`,operationId,scope.companyId,scope.storeId,mode,plan.planHash,snapshot.snapshotHash);
   return {operationId,snapshotHash:snapshot.snapshotHash,mode,counts:snapshot.tables.map(t=>({table:t.name,count:t.rows.length,action:t.action})),maintenance:true};
  })},
  async abort(db,actor,{companyId,storeId,operationId}){requireLifecycleAdmin(actor);if(!uuid.test(operationId||''))fail('Exact prepared operation required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx),run=(await tx.$queryRawUnsafe(`SELECT "state" FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE`,operationId,companyId,storeId))[0];if(!run||run.state!=='PREPARED')fail('Only an unexecuted preparation can be aborted.');
   const fence=(await tx.$queryRawUnsafe(`SELECT "operationId","companyId" FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,storeId))[0];if(!fence||fence.companyId!==companyId||fence.operationId!==operationId)fail('Maintenance fence differs.');
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "state"='ABORTED' WHERE "id"=$1`,operationId);await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "maintenance"=false,"operationId"=NULL WHERE "storeId"=$1`,storeId);return {aborted:true,operationId};
  })},
  async execute(db,actor,{companyId,storeId,operationId,snapshotHash}){requireLifecycleAdmin(actor);if(!uuid.test(operationId||'')||!/^[a-f0-9]{64}$/.test(snapshotHash||''))fail('Exact prepared operation required.',400);return transaction(db,async tx=>{
   const schema=await schemaFor(tx),run=(await tx.$queryRawUnsafe(`SELECT *,"expiresAt">NOW() AS fresh FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE`,operationId,companyId,storeId))[0];if(!run)fail('Operation not found in selected store.',404);if(run.snapshotHash!==snapshotHash||run.planHash!==plan.planHash)fail('Prepared operation differs.');if(run.state==='COMPLETED')return {...run.result,idempotentReplay:true};if(run.state!=='PREPARED'||!run.fresh)fail('Prepared operation expired or unavailable.');
   const fence=(await tx.$queryRawUnsafe(`SELECT * FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=$1 FOR UPDATE`,storeId))[0];if(!fence||!fence.maintenance||fence.operationId!==operationId||fence.companyId!==companyId||fence.planHash!==plan.planHash)fail('Maintenance fence differs.');
   for(const node of [...plan.ordered].sort((a,b)=>a.name.localeCompare(b.name)))await tx.$executeRawUnsafe(`LOCK TABLE ${q(schema)}.${q(node.name)} IN ROW EXCLUSIVE MODE`);
   const snapshot=await capture(tx,plan,schema,{companyId,storeId},run.mode);if(snapshot.snapshotHash!==snapshotHash)fail('Rows changed after preview.');
   const proof=await persistAndVerifyRecovery(freeze(snapshot));if(proof?.sourceRevision!==sourceRevision||proof?.manifestHash!==plan.planHash||proof?.companyId!==companyId||proof?.storeId!==storeId||proof?.mode!==run.mode||proof?.snapshotHash!==snapshotHash||proof?.restoredSnapshotHash!==snapshotHash||proof?.storageReadbackVerified!==true||!/^[a-f0-9]{64}$/.test(proof?.artifactSha256||''))fail('Durable recovery and complete restore are not verified.');
   await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_operation',$1,true)`,operationId);
   // All declared FK dependencies, not just the ownership edge, determine deletion order.
   const meta=await validateDatabase(tx,plan,schema),pending=new Set(snapshot.tables.filter(t=>t.action==='REMOVE').map(t=>t.name)),order=[];
   while(pending.size){const ready=[...pending].filter(name=>!meta.fks.some(f=>f.childSchema===schema&&f.parentSchema===schema&&f.parent===name&&f.child!==name&&pending.has(f.child)));if(!ready.length)fail('Cyclic deletion dependencies require a reviewed executor.');for(const name of ready.sort()){order.push(name);pending.delete(name)}}
   const deleted=[];for(const name of order){const node=plan.nodes.get(name),expected=snapshot.tables.find(t=>t.name===name).rows.length;const count=Number(await tx.$executeRawUnsafe(`DELETE FROM ${q(schema)}.${q(name)} t WHERE ${predicate(plan,schema,node,'t')}`,storeId));if(count!==expected)fail('Unexpected delete count.');deleted.push({table:name,count})}
   for(const t of snapshot.tables.filter(t=>t.action==='KEEP')){const rows=await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(schema)}.${q(t.name)} t WHERE ${predicate(plan,schema,plan.nodes.get(t.name),'t')} ORDER BY row_to_json(t)::text`,storeId);if(JSON.stringify(rows.map(r=>r.row))!==JSON.stringify(t.rows))fail('Retained records changed.');}
   await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleFence" SET "generation"="generation"+1,"retired"=$2 WHERE "storeId"=$1`,storeId,run.mode==='DELETE');
   const result={operationId,companyId,storeId,mode:run.mode,deleted,artifactSha256:proof.artifactSha256,maintenance:true,reopenRequired:true,idempotentReplay:false};await tx.$executeRawUnsafe(`UPDATE ${q(schema)}."StoreLifecycleExecution" SET "state"='COMPLETED',"result"=$2::jsonb WHERE "id"=$1`,operationId,JSON.stringify(result));return result;
  })}
 };
}

export function lifecycleExecutionSnapshotHash(snapshot){const {snapshotHash,...value}=snapshot;return hash(value)}

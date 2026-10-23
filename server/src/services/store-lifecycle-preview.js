import {createHash} from 'node:crypto';
import {STORE_TABLES,RESET_KEEP} from './store-lifecycle-policy.js';
import {reviewLifecycleApplicationLinks} from './store-lifecycle-application-links.js';
import {reviewLifecycleDependencies} from './store-lifecycle-dependencies.js';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
export function requireLifecycleAdmin(actor){if(!actor?.id||!(actor.isSuperAdmin===true||actor.platformRole==='SUPER_ADMIN'))fail('Απαιτείται πρόσβαση Platform Super Admin.',403)}
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
export function classifyLifecycleTable(name,mode){if(name==='Store')return mode==='DELETE'?'REMOVE':'KEEP';if(!STORE_TABLES.has(name))return 'REVIEW';return mode==='RESET'&&RESET_KEEP.has(name)?'KEEP':'REMOVE'}
export async function lifecyclePreview(db,actor,{companyId,storeId},mode){
 requireLifecycleAdmin(actor);if(!['RESET','DELETE'].includes(mode))fail('Επίλεξε εκκαθάριση ή οριστική διαγραφή.',400);
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8s'");
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS name'))[0]?.name;
  if(!schema)fail('Δεν είναι διαθέσιμο το σχήμα της βάσης.',503);
  const store=(await tx.$queryRawUnsafe(`SELECT "id","name","companyId" FROM ${quote(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,storeId,companyId))[0];
  if(!store)fail('Δεν βρέθηκε το κατάστημα στη συγκεκριμένη εταιρεία.',404);
  const columns=await tx.$queryRawUnsafe(`SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE' WHERE c.table_schema=$1 ORDER BY c.table_name,c.ordinal_position`,schema);
  const tables=new Map();for(const row of columns){if(!tables.has(row.table_name))tables.set(row.table_name,new Set());tables.get(row.table_name).add(row.column_name)}
  if(tables.size>600)fail('Η απογραφή υπερβαίνει το διαθέσιμο όριο. Απαιτείται ειδικός έλεγχος.',422);
  const inventory=[],blockers=[];
  for(const [name,cols] of tables){
   if(name==='Store'||!cols.has('storeId'))continue;
   const qualified=quote(schema)+'.'+quote(name),params=cols.has('companyId')?[storeId,companyId]:[storeId];
   const counts=(await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, ${cols.has('companyId')?'COUNT(*) FILTER (WHERE "companyId" IS DISTINCT FROM $2)':'0'}::int AS inconsistent FROM ${qualified} WHERE "storeId"=$1`,...params))[0];
   const count=Number(counts.count),action=classifyLifecycleTable(name,mode);inventory.push({table:name,count,action});
   if(Number(counts.inconsistent))blockers.push({code:'INCONSISTENT_SCOPE',table:name,count:Number(counts.inconsistent)});
   if(action==='REVIEW')blockers.push({code:'UNREVIEWED_TABLE',table:name,count});
   const condition=name==='CashShiftSession'&&cols.has('status')?'"status"=\'OPEN\'':['RbsCapDriverV1Request','FtextCashRequest'].includes(name)&&cols.has('status')?'"status" NOT IN (\'DECLINED\',\'SALE_COMMITTED\')':name==='StoreOperatorSession'&&cols.has('expiresAt')&&cols.has('revokedAt')?'"revokedAt" IS NULL AND "expiresAt">NOW()':name==='CloudDevice'&&cols.has('lastSeenAt')&&cols.has('status')?'"status"=\'ACTIVE\' AND "lastSeenAt">NOW()-INTERVAL \'60 seconds\'':null;
   if(condition){const busy=Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${qualified} WHERE "storeId"=$1${cols.has('companyId')?' AND "companyId"=$2':''} AND (${condition})`,...params))[0].count);if(busy)blockers.push({code:{CashShiftSession:'OPEN_SHIFT',RbsCapDriverV1Request:'FISCAL_REQUEST',FtextCashRequest:'FISCAL_REQUEST',StoreOperatorSession:'ACTIVE_OPERATOR',CloudDevice:'ACTIVE_CONNECTOR'}[name],table:name,count:busy})}
  }
  const dependencies=await tx.$queryRawUnsafe(`SELECT child.relname AS child,parent.relname AS parent,ns.nspname AS "childSchema",pns.nspname AS "parentSchema",c.conname AS "constraint",c.confdeltype AS deletion FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace pns ON pns.oid=parent.relnamespace WHERE c.contype='f' AND ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' ORDER BY ns.nspname,child.relname,pns.nspname,parent.relname,c.conname LIMIT 10001`);
  if(dependencies.length>10000)fail('Οι εξαρτήσεις υπερβαίνουν το διαθέσιμο όριο. Απαιτείται ειδικός έλεγχος.',422);
  const selected=new Set(inventory.filter(row=>row.action==='REMOVE').map(row=>row.table));if(mode==='DELETE')selected.add('Store');
  const indirect=reviewLifecycleDependencies({schema,selected,inventory,dependencies});
  const applicationLinks=await reviewLifecycleApplicationLinks(tx,{schema,tables,companyId,storeId,inventory});
  for(const link of applicationLinks)if(link.status==='SCHEMA_CHANGED'||link.inconsistent)blockers.push({code:link.status==='SCHEMA_CHANGED'?'APPLICATION_LINK_SCHEMA_CHANGED':'INCONSISTENT_APPLICATION_LINK',table:link.table,count:link.inconsistent||1});
  blockers.push({code:'APPLICATION_LINK_REVIEW_REQUIRED',count:applicationLinks.length});
  blockers.push({code:'DEPENDENCY_REVIEW_REQUIRED',count:indirect.length},{code:'RECOVERY_VERIFICATION_REQUIRED',count:1},{code:'OFFLINE_QUEUES_REQUIRE_DEVICE_CHECK',count:1});
  const fingerprint=createHash('sha256').update(JSON.stringify({version:1,companyId,storeId,mode,inventory,indirect,applicationLinks})).digest('hex');
  return {store,mode,checkedAt:new Date().toISOString(),fingerprint,inventory,indirect,applicationLinks,blockers,executionAvailable:false,
   preservedShared:['Εταιρεία και άλλα καταστήματα','Κοινός κατάλογος προϊόντων/προμηθευτών','Εταιρικοί λογαριασμοί χρηστών'],
   limitations:['Τα πλήθη αφορούν άμεσες εγγραφές και δηλωμένες εξαρτήσεις, όχι πλήρη απογραφή έμμεσων συνδέσεων ή αντίγραφο ασφαλείας.','Η εκτέλεση εκκαθάρισης/διαγραφής δεν έχει ενεργοποιηθεί.','Οι φυσικές αποδείξεις και οι τραπεζικές χρεώσεις δεν διαγράφονται από την εφαρμογή.']};
 },{isolationLevel:'RepeatableRead',timeout:20000,maxWait:3000});
}
export function registerStoreLifecyclePreview(router,db){router.get('/companies/:companyId/stores/:storeId/lifecycle/preview',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json(await lifecyclePreview(db,req.user,req.params,req.query.mode))}catch(error){next(error)}})}

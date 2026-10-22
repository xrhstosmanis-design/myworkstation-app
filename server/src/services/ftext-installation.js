import crypto from 'node:crypto';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {ensureFtextCashSchema,ftextCashTableExists} from './ftext-cash-schema.js';
import {assertCustomerDemoOutboundAllowed} from '../customer-demo-runtime.js';
import {assertLifecycleMutation,bindFreshLifecycleRead} from './store-lifecycle-generation.js';

export const FTEXT_PLATFORM='WINDOWS_FTEXT_V1';
const issuer='myworkstation-ftext',audience='ftext-device-v1';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const identifier=z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/);
const terminal=identifier.transform(s=>s.toUpperCase());
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const codeHash=code=>hash(String(code).replace(/[^A-Z0-9]/gi,'').toUpperCase());
const cp1253=new Set(Array.from({length:256},(_,i)=>new TextDecoder('windows-1253').decode(Uint8Array.of(i))).filter(c=>c!=='\uFFFD'));
const folder=z.string().trim().min(4).max(180).regex(/^[A-Za-z]:\\[^:"<>|?*\x00-\x1f]+$/).refine(s=>!s.includes('..')&&[...s].every(c=>cp1253.has(c)),'Ο φάκελος πρέπει να υποστηρίζει Windows-1253.').transform(s=>path.win32.normalize(s).replace(/\\+$/,''));
const cashDepartments=z.array(z.object({department:z.number().int().min(1).max(200),vatRate:z.number().min(0).max(100),vatCode:z.string().regex(/^[1-5]$/)}).strict()).min(1).max(200).refine(rows=>new Set(rows.map(r=>r.department)).size===rows.length);
export const ftextSettingsInput=z.object({terminalPos:terminal,serialNumber:identifier,workFolder:folder,confirmed:z.literal(true),cashEnabled:z.boolean().optional(),cashDepartments:cashDepartments.optional()}).strict().refine(v=>v.cashEnabled!==true||Boolean(v.cashDepartments?.length));
const settingsSchema=z.object({companyId:identifier,storeId:identifier,terminalPos:terminal,fiscalDeviceCode:terminal,serialNumber:identifier,workFolder:folder,protocol:z.literal('SOLIDUS(II)T'),configurationId:z.string().uuid(),lifecycleGeneration:z.string().regex(/^(0|[1-9]\d{0,18})$/),cashEnabled:z.boolean().optional(),cashDepartments:cashDepartments.optional()}).strict();
const reportSchema=z.object({requestId:z.string().regex(/^[a-f0-9]{32}$/),checkedAt:z.string().datetime({offset:true}),ok:z.boolean(),code:z.number().int().min(0).max(999),serialNumber:identifier.optional(),deviceTime:z.string().trim().min(1).max(80).optional(),description:z.string().trim().max(300).optional(),fiscalExecution:z.literal(false)}).strict();
export function ftextSettingsHash(settings){return hash(JSON.stringify(settingsSchema.parse(settings)))}
export function rejectReservedFtextPairing(body,existing=null){
 if(String(body.platform||'').toUpperCase()===FTEXT_PLATFORM||/^ftext:/i.test(body.deviceKey||'')||String(body.code||'').replace(/[^A-Z0-9]/gi,'').toUpperCase().startsWith('FT')||existing?.platform===FTEXT_PLATFORM)fail(409,'Η σύνδεση ftext γίνεται από το δικό της πακέτο και κωδικό ζεύξης.');
}
export function validateFtextReport(input,settings,now=new Date()){
 const r=reportSchema.parse(input),age=now.getTime()-Date.parse(r.checkedAt);
 if(age < -60000||age>300000)fail(409,'Ο έλεγχος επικοινωνίας είναι παλιός ή έχει λανθασμένη ώρα.');
 if(r.ok&&(r.code!==0||r.serialNumber!==settings.serialNumber||!r.deviceTime))fail(409,'Η απάντηση δεν επιβεβαιώνει τη συγκεκριμένη ταμειακή.');
 if(!r.ok&&r.code===0)fail(409,'Ασυνεπής απάντηση ftext.');
 return r;
}
export function createFtextInstallationService({db,moduleState,secret,clock=()=>new Date()}){
 const scopeOf=s=>({companyId:identifier.parse(s.companyId),storeId:identifier.parse(s.storeId),terminalPos:terminal.parse(s.terminalPos)});
 const key=s=>'ftext:'+s.terminalPos;
 const tx=fn=>db.$transaction(fn,{maxWait:5000,timeout:15000});
 async function licensed(t,s){const m=await moduleState(s.companyId,t);if(!m?.licenseAllowed||!m.activeModules.includes('CONNECTOR_FTEXT'))fail(403,'Απαιτείται ενεργή άδεια και τεχνική ενεργοποίηση CONNECTOR_FTEXT.');}
 async function store(t,s){assertCustomerDemoOutboundAllowed(s);const row=await t.store.findFirst({where:{id:s.storeId,companyId:s.companyId,active:true},select:{id:true,companyId:true,name:true}});if(!row)fail(404,'Δεν βρέθηκε ενεργό κατάστημα στην εταιρεία.');return row;}
 async function route(t,s){
  const rows=await t.$queryRaw`SELECT f."deviceCode" FROM "StoreInstallationTerminal" p JOIN "StoreFiscalDevice" f ON f."companyId"=p."companyId" AND f."storeId"=p."storeId" AND f."terminalPos"=p."terminalPos" AND f."active"=TRUE WHERE p."companyId"=${s.companyId} AND p."storeId"=${s.storeId} AND p."terminalPos"=${s.terminalPos} AND p."active"=TRUE FOR SHARE OF p,f`;
  if(rows.length!==1)fail(409,'Αντιστοίχισε πρώτα μία ενεργή ταμειακή στο συγκεκριμένο ενεργό POS.');return rows[0].deviceCode;
 }
 async function device(t,s,lock=false){return (await t.$queryRawUnsafe(`SELECT * FROM "CloudDevice" WHERE "companyId"=$1 AND "storeId"=$2 AND "deviceKey"=$3${lock?' FOR UPDATE':''}`,s.companyId,s.storeId,key(s)))[0]||null;}
 async function audit(t,s,actor,event,details={}){await t.$executeRaw`INSERT INTO "CloudAudit" ("id","companyId","storeId","actorType","actorId","eventType","details") VALUES (${crypto.randomUUID()},${s.companyId},${s.storeId},${actor.type},${actor.id},${event},${JSON.stringify(details)}::jsonb)`;}
 function config(d,s){
  if(!d||d.platform!==FTEXT_PLATFORM)fail(409,'Δεν έχουν αποθηκευτεί ρυθμίσεις ftext για αυτό το POS.');
  const c=settingsSchema.parse(d.metadata?.ftextSettings);
  if(c.companyId!==s.companyId||c.storeId!==s.storeId||c.terminalPos!==s.terminalPos)fail(409,'Οι ρυθμίσεις ανήκουν σε άλλο κατάστημα ή POS.');return c;
 }
 async function current(t,d,s,generation){await store(t,s);await licensed(t,s);const c=config(d,s);await assertLifecycleMutation(t,s,generation);if(c.lifecycleGeneration!==generation||await route(t,s)!==c.fiscalDeviceCode)fail(409,'Οι ρυθμίσεις ταμειακής άλλαξαν. Χρειάζεται νέο πακέτο και ζεύξη.');return c;}
 const signingKey=()=>{const value=secret();if(typeof value!=='string'||value.length<16)fail(503,'Η ασφαλής ζεύξη δεν είναι διαθέσιμη.');return value+':FTEXT_DEVICE';};
 const sign=(d,c)=>jwt.sign({tokenType:'FTEXT_DEVICE',deviceId:d.id,companyId:c.companyId,storeId:c.storeId,terminalPos:c.terminalPos,tokenVersion:d.tokenVersion,settingsHash:ftextSettingsHash(c),lifecycleGeneration:c.lifecycleGeneration},signingKey(),{algorithm:'HS256',issuer,audience,expiresIn:'30d'});
 function verify(token){try{const p=jwt.verify(token,signingKey(),{algorithms:['HS256'],issuer,audience});if(p.tokenType!=='FTEXT_DEVICE'||!p.deviceId||!p.settingsHash||!p.lifecycleGeneration)throw Error();return p}catch{fail(401,'Η ζεύξη ftext έληξε ή ανακλήθηκε.');}}
 async function authenticated(token,action){const p=verify(token),s=scopeOf(p);return tx(async t=>{
  const d=await device(t,s,true);if(!d||d.id!==p.deviceId||d.status!=='ACTIVE'||d.tokenVersion!==p.tokenVersion)fail(401,'Η συσκευή ftext δεν είναι ενεργή.');
  const c=await current(t,d,s,p.lifecycleGeneration);if(ftextSettingsHash(c)!==p.settingsHash)fail(409,'Οι ρυθμίσεις ftext άλλαξαν. Κατέβασε νέο πακέτο.');return action(t,d,c,s);
 });}
 return {
  authenticated,
  async cashContext(t,scope,{requireOnline=true}={}){const s=scopeOf(scope),d=await device(t,s,true),c=config(d,s);await current(t,d,s,c.lifecycleGeneration);if(d.status!=='ACTIVE'||c.cashEnabled!==true)fail(409,'Η έκδοση μετρητών ftext δεν έχει ενεργοποιηθεί/ζευγοποιηθεί.');if(requireOnline&&(!d.lastSeenAt||clock()-new Date(d.lastSeenAt)>=15000))fail(409,'Ο connector ftext είναι εκτός σύνδεσης.');if(!d.metadata?.ftextLastStatus?.ok||d.metadata.ftextLastStatus.serialNumber!==c.serialNumber)fail(409,'Χρειάζεται επιτυχής έλεγχος STATUS με τις τρέχουσες ρυθμίσεις.');return {device:d,settings:c,scope:{...s,fiscalDeviceCode:c.fiscalDeviceCode}};},
  async view(scope){const s=scopeOf(scope);await store(db,s);const d=await device(db,s);const m=await moduleState(s.companyId,db);if(!d)return {settings:null,paired:false,online:false,connectorAllowed:Boolean(m?.licenseAllowed&&m.activeModules.includes('CONNECTOR_FTEXT')),fiscalCheckoutEnabled:false};const c=config(d,s);let valid=true;try{await tx(t=>current(t,d,s,c.lifecycleGeneration))}catch(e){if(![403,404,409].includes(e.status))throw e;valid=false}const last=d.metadata?.ftextLastStatus||null;return {settings:c,settingsHash:ftextSettingsHash(c),paired:d.status==='ACTIVE'&&valid,online:Boolean(valid&&d.status==='ACTIVE'&&d.lastSeenAt&&clock()-new Date(d.lastSeenAt)<15000),lastSeenAt:d.lastSeenAt,lastStatus:last,connectorAllowed:Boolean(m?.licenseAllowed&&m.activeModules.includes('CONNECTOR_FTEXT')),settingsCurrent:valid,fiscalCheckoutEnabled:false};},
  async configure(scope,input,actorId){const b=ftextSettingsInput.parse(input),s=scopeOf({...scope,terminalPos:b.terminalPos});return tx(async t=>{
   await t.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${['ftext-config',s.companyId,s.storeId,s.terminalPos].join(':')},0))`;
   await store(t,s);const lifecycle=await bindFreshLifecycleRead(t,s),fiscalDeviceCode=await route(t,s);
   const table=(await t.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'StoreRbsInstallationSettings'))::text AS name`)[0];
   if(table?.name&&(await t.$queryRaw`SELECT 1 FROM "StoreRbsInstallationSettings" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "terminalPos"=${s.terminalPos}`).length)fail(409,'Υπάρχουν ρυθμίσεις RBS στο POS. Απαιτείται ελεγχόμενη αλλαγή τύπου σύνδεσης.');
   const old=await device(t,s,true);if(old&&old.platform!==FTEXT_PLATFORM)fail(409,'Η ταυτότητα συσκευής χρησιμοποιείται από άλλη σύνδεση.');
   if(await ftextCashTableExists(t)&&(await t.$queryRaw`SELECT "id" FROM "FtextCashRequest" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "terminalPos"=${s.terminalPos} AND "status"<>'SALE_COMMITTED' LIMIT 1`).length)fail(409,'Υπάρχει εκκρεμής εντολή ftext. Οι ρυθμίσεις δεν άλλαξαν.');
   const cashFields=b.cashEnabled===undefined?{}:{cashEnabled:b.cashEnabled,...(b.cashDepartments?{cashDepartments:b.cashDepartments}:{})};
   const common={...s,...cashFields,fiscalDeviceCode,serialNumber:b.serialNumber,workFolder:b.workFolder,protocol:'SOLIDUS(II)T',lifecycleGeneration:lifecycle.generation};
   if(old){const previous=config(old,s);if(ftextSettingsHash({...common,configurationId:previous.configurationId})===ftextSettingsHash(previous))return {settings:previous,settingsHash:ftextSettingsHash(previous),unchanged:true,fiscalCheckoutEnabled:false};}
   if(b.cashEnabled===true)await ensureFtextCashSchema(t);
   const c=settingsSchema.parse({...common,configurationId:crypto.randomUUID()}),metadata={ftextSettings:c};
   await t.$executeRaw`INSERT INTO "CloudDevice" ("id","companyId","storeId","deviceKey","name","platform","status","metadata") VALUES (${crypto.randomUUID()},${s.companyId},${s.storeId},${key(s)},${'ftext · '+s.terminalPos},${FTEXT_PLATFORM},'CONFIGURED',${JSON.stringify(metadata)}::jsonb) ON CONFLICT ("storeId","deviceKey") DO UPDATE SET "platform"=EXCLUDED."platform","status"='CONFIGURED',"tokenVersion"="CloudDevice"."tokenVersion"+1,"metadata"=EXCLUDED."metadata","lastSeenAt"=NULL,"revokedAt"=NOW()`;
   await audit(t,s,{type:'USER',id:actorId},'FTEXT_CONFIGURED',{terminalPos:s.terminalPos,settingsHash:ftextSettingsHash(c)});return {settings:c,settingsHash:ftextSettingsHash(c),unchanged:false,fiscalCheckoutEnabled:false};
  });},
  async createPairing(scope,actorId){const s=scopeOf(scope);return tx(async t=>{
   const d=await device(t,s,true),c=config(d,s);await current(t,d,s,c.lifecycleGeneration);
   const code='FT-'+crypto.randomInt(0,100000000).toString().padStart(8,'0'),id=crypto.randomUUID(),expiresAt=new Date(clock().getTime()+15*60000),h=codeHash(code);
   await t.$executeRaw`INSERT INTO "CloudPairingCode" ("id","companyId","storeId","codeHash","expiresAt","createdBy") VALUES (${id},${s.companyId},${s.storeId},${h},${expiresAt},${actorId})`;
   const metadata={...d.metadata,ftextPairing:{id,hash:h,expiresAt:expiresAt.toISOString()}};
   await t.$executeRaw`UPDATE "CloudDevice" SET "metadata"=${JSON.stringify(metadata)}::jsonb WHERE "id"=${d.id}`;
   await audit(t,s,{type:'USER',id:actorId},'FTEXT_PAIRING_CREATED',{terminalPos:s.terminalPos});return {code,expiresAt,terminalPos:s.terminalPos};
  });},
  async pair(input){const b=z.object({code:z.string().regex(/^FT-\d{8}$/),expectedCompanyId:identifier,expectedStoreId:identifier,terminalPos:terminal,settingsHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input);const s=scopeOf({companyId:b.expectedCompanyId,storeId:b.expectedStoreId,terminalPos:b.terminalPos});return tx(async t=>{
   const pair=(await t.$queryRaw`SELECT * FROM "CloudPairingCode" WHERE "codeHash"=${codeHash(b.code)} AND "usedAt" IS NULL AND "expiresAt">NOW() FOR UPDATE`)[0];
   if(!pair||pair.companyId!==s.companyId||pair.storeId!==s.storeId)fail(409,'Μη έγκυρος ή ληγμένος κωδικός για το επιλεγμένο κατάστημα.');
   const d=await device(t,s,true),c=config(d,s);await current(t,d,s,c.lifecycleGeneration);
   if(d.metadata?.ftextPairing?.id!==pair.id||d.metadata?.ftextPairing?.hash!==pair.codeHash||b.settingsHash!==ftextSettingsHash(c))fail(409,'Ο κωδικός ή το πακέτο δεν αντιστοιχεί στις τρέχουσες ρυθμίσεις αυτού του POS.');
   const metadata={ftextSettings:c};
   const used=await t.$executeRaw`UPDATE "CloudPairingCode" SET "usedAt"=NOW() WHERE "id"=${pair.id} AND "usedAt" IS NULL`;if(Number(used)!==1)fail(409,'Ο κωδικός χρησιμοποιήθηκε ήδη.');
   const paired=(await t.$queryRaw`UPDATE "CloudDevice" SET "status"='ACTIVE',"tokenVersion"="tokenVersion"+1,"metadata"=${JSON.stringify(metadata)}::jsonb,"pairedAt"=NOW(),"lastSeenAt"=NULL,"revokedAt"=NULL WHERE "id"=${d.id} RETURNING *`)[0];
   const token=sign(paired,c);await audit(t,s,{type:'DEVICE',id:d.id},'FTEXT_PAIRED',{terminalPos:s.terminalPos});return {token,settings:c,settingsHash:ftextSettingsHash(c),companyId:s.companyId,storeId:s.storeId,terminalPos:s.terminalPos,fiscalCheckoutEnabled:false};
  });},
  ping(token){return authenticated(token,async(t,d,c,s)=>{await t.$executeRaw`UPDATE "CloudDevice" SET "lastSeenAt"=NOW() WHERE "id"=${d.id}`;return {...s,settings:c,settingsHash:ftextSettingsHash(c),serialNumber:c.serialNumber,fiscalCheckoutEnabled:false};});},
  report(token,input){return authenticated(token,async(t,d,c,s)=>{
   const body=reportSchema.parse(input),old=d.metadata?.ftextLastStatus;
   if(old?.requestId===body.requestId){if(old.reportHash!==hash(JSON.stringify(body)))fail(409,'Το ίδιο αίτημα έχει διαφορετικό αποτέλεσμα.');return {ok:true,idempotentReplay:true};}
   validateFtextReport(body,c,clock());
   if(old&&Date.parse(body.checkedAt)<=Date.parse(old.checkedAt))fail(409,'Παραλήφθηκε παλαιότερη απάντηση ftext.');
   const sample={...body,receivedAt:clock().toISOString(),reportHash:hash(JSON.stringify(body))},metadata={...d.metadata,ftextLastStatus:sample};
   await t.$executeRaw`UPDATE "CloudDevice" SET "metadata"=${JSON.stringify(metadata)}::jsonb,"lastSeenAt"=NOW() WHERE "id"=${d.id}`;
   await audit(t,s,{type:'DEVICE',id:d.id},'FTEXT_STATUS_REPORTED',{terminalPos:s.terminalPos,requestId:body.requestId,ok:body.ok,code:body.code});return {ok:true,idempotentReplay:false};
  });}
 };
}

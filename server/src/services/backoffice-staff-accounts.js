import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {staffCapabilities,validStaffCapabilities} from '../../../shared/backoffice-staff.mjs';
import {staffError} from './backoffice-staff-access.js';
import {bindFreshLifecycleRead} from './store-lifecycle-generation.js';
const pin=z.string().regex(/^\d{4,12}$/,'Το PIN πρέπει να έχει 4–12 ψηφία.');
const password=z.string().min(10).max(100).refine(value=>Buffer.byteLength(value,'utf8')<=72,'Ο κωδικός είναι πολύ μεγάλος.');
const grants=z.array(z.object({storeId:z.string().trim().min(1).max(200),profile:z.enum(['MANAGER','STOCKTAKER','AUDITOR']),capabilities:z.array(z.enum(staffCapabilities)).max(staffCapabilities.length)}).strict()).max(100).refine(rows=>new Set(rows.map(r=>r.storeId)).size===rows.length,'Διπλό κατάστημα.').refine(rows=>rows.every(r=>validStaffCapabilities(r.capabilities)),'Μη έγκυρα δικαιώματα χειριστή.');
export const createStaffInput=z.object({username:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),fullName:z.string().trim().min(2).max(180),password:password.optional(),pin,grants}).strict();
export const updateStaffInput=z.object({expectedRevision:z.number().int().positive(),active:z.boolean(),grants,password:password.optional(),pin:pin.optional()}).strict();
export async function authorizeStaffAdmin(db,user){
  if(user?.tokenType!=='BACKOFFICE_USER'||!user.id||!user.sessionId||user.staffAccess)throw staffError();
  const rows=await db.$queryRaw`SELECT u."id",u."companyId",u."role",u."fullName" FROM "User" u JOIN "UserSession" s ON s."userId"=u."id" WHERE u."id"=${user.id} AND s."id"=${user.sessionId} AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND u."sessionVersion"=${user.sessionVersion} AND u."mustChangePassword"=false FOR SHARE OF u,s`;
  const actual=rows[0];
  if(!actual||!['OWNER','SUPER_ADMIN'].includes(actual.role))throw staffError();
  if(actual.role==='SUPER_ADMIN'){
    if(!user.isSuperAdmin||user.platformRole!=='SUPER_ADMIN')throw staffError();
    if(user.supportContext&&user.supportContext.companyId!==user.companyId)throw staffError();
  }else{
    if(user.role!=='OWNER'||user.isSuperAdmin||user.supportContext)throw staffError();
    if(actual.companyId!==user.companyId){
      const access=await db.$queryRaw`SELECT "ownerId" FROM "OwnerCompanyAccess" WHERE "ownerId"=${user.id} AND "companyId"=${user.companyId} FOR SHARE`;
      if(!access.length)throw staffError();
    }
  }
  const company=await db.company.findFirst({where:{id:user.companyId,active:true},select:{id:true}});
  if(!company)throw staffError();
  return actual;
}
async function validateGrants(tx,companyId,rows){
  if(!rows.length)return;
  const stores=await tx.store.findMany({where:{id:{in:rows.map(r=>r.storeId)},companyId,active:true},select:{id:true}});
  if(stores.length!==rows.length)throw staffError(400,'STAFF_STORE_INVALID','Επίλεξε μόνο ενεργά καταστήματα της εταιρείας.');
}
async function writeGrants(tx,companyId,userId,rows){
  // Security configuration is derived anew under its account revision fence.
  // Lock all referenced store epochs before writing any retained grant rows.
  const old=await tx.$queryRaw`SELECT "storeId" FROM "BackofficeStaffGrant" WHERE "userId"=${userId} AND "companyId"=${companyId}`;
  const stores=[...new Set([...old.map(r=>r.storeId),...rows.map(r=>r.storeId)])].sort(),generations={};
  for(const storeId of stores){const state=await bindFreshLifecycleRead(tx,{companyId,storeId});generations[storeId]=state.generation;}
  if(stores.length)await tx.$executeRaw`SELECT set_config('mws.lifecycle_generations',${JSON.stringify(generations)},true)`;
  await tx.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false,"revision"="revision"+1,"updatedAt"=NOW() WHERE "userId"=${userId} AND "companyId"=${companyId}`;
  for(const row of rows)await tx.$executeRaw`INSERT INTO "BackofficeStaffGrant" ("userId","companyId","storeId","profile","capabilities") VALUES (${userId},${companyId},${row.storeId},${row.profile},${JSON.stringify(row.capabilities)}::jsonb) ON CONFLICT ("userId","storeId") DO UPDATE SET "active"=true,"profile"=EXCLUDED."profile","capabilities"=EXCLUDED."capabilities","updatedAt"=NOW()`;
}
async function audit(tx,user,target,event,detail){
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail") VALUES (${crypto.randomUUID()},${user.companyId},${user.id},${target},${event},${JSON.stringify(detail)}::jsonb)`;
}
export async function createStaffAccount(db,user,input){
  const b=createStaffInput.parse(input),userId=crypto.randomUUID();
  // PIN-only identities never reuse the short PIN as an ordinary password.
  // The random fallback is not returned, stored in plaintext or shared.
  const [passwordHash,pinHash]=await Promise.all([bcrypt.hash(b.password??crypto.randomBytes(32).toString('hex'),12),bcrypt.hash(b.pin,12)]);
  return db.$transaction(async tx=>{
    await authorizeStaffAdmin(tx,user);await validateGrants(tx,user.companyId,b.grants);
    // New identity only: never attach privileges to an existing company User.
    await tx.user.create({data:{id:userId,email:`${userId}@staff.myworkstation.invalid`,fullName:b.fullName,passwordHash,role:'EMPLOYEE',companyId:user.companyId,mustChangePassword:false},select:{id:true}});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAccount" ("userId","companyId","username","pinHash") VALUES (${userId},${user.companyId},${b.username},${pinHash})`;
    await writeGrants(tx,user.companyId,userId,b.grants);
    await audit(tx,user,userId,'CREATED',{username:b.username,fullName:b.fullName,active:true,grants:b.grants});
    return {id:userId,username:b.username,revision:1};
  },{timeout:15000});
}
export async function updateStaffAccount(db,user,userId,input){
  const b=updateStaffInput.parse(input);
  const passwordHash=b.password?await bcrypt.hash(b.password,12):null,pinHash=b.pin?await bcrypt.hash(b.pin,12):null;
  return db.$transaction(async tx=>{
    await authorizeStaffAdmin(tx,user);await validateGrants(tx,user.companyId,b.grants);
    const rows=await tx.$queryRaw`SELECT "userId","active","revision" FROM "BackofficeStaffAccount" WHERE "userId"=${userId} AND "companyId"=${user.companyId} FOR UPDATE`;
    const before=rows[0];if(!before)throw staffError(404,'STAFF_NOT_FOUND','Δεν βρέθηκε ο λογαριασμός.');
    if(before.revision!==b.expectedRevision)throw staffError(409,'STAFF_STALE','Υπάρχει νεότερη αλλαγή. Ανανέωσε πριν αποθηκεύσεις.');
    const previous=await tx.$queryRaw`SELECT "storeId","profile","capabilities","active" FROM "BackofficeStaffGrant" WHERE "userId"=${userId} AND "companyId"=${user.companyId} ORDER BY "storeId"`;
    await tx.$executeRaw`UPDATE "BackofficeStaffAccount" SET "active"=${b.active},"revision"="revision"+1,"updatedAt"=NOW() WHERE "userId"=${userId} AND "companyId"=${user.companyId}`;
    if(pinHash)await tx.$executeRaw`UPDATE "BackofficeStaffAccount" SET "pinHash"=${pinHash} WHERE "userId"=${userId} AND "companyId"=${user.companyId}`;
    await writeGrants(tx,user.companyId,userId,b.grants);
    await tx.user.update({where:{id:userId},data:{sessionVersion:{increment:1},...(passwordHash?{passwordHash}:{})},select:{id:true}});
    await tx.userSession.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});
    await audit(tx,user,userId,'UPDATED',{before:{active:before.active,revision:before.revision,grants:previous},after:{active:b.active,revision:before.revision+1,grants:b.grants},passwordChanged:Boolean(passwordHash),pinChanged:Boolean(pinHash)});
    return {id:userId,revision:before.revision+1};
  },{timeout:15000});
}
export const staffLoginInput=z.object({username:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),password:z.string().min(1).max(100).optional(),pin:pin.optional()}).strict().refine(b=>Boolean(b.password)!==Boolean(b.pin),'Συμπλήρωσε κωδικό ή PIN.');
// Durable per-IP AND per-username limits include nonexistent accounts. Guard
// keys are HMACs, never raw identifiers. Failed credentials commit the attempts.
export async function verifyStaffLogin(db,input,ip,secret,issue){
  const b=staffLoginInput.parse(input);
  if(!secret)throw staffError(503,'STAFF_LOGIN_UNAVAILABLE');
  const key=value=>crypto.createHmac('sha256',secret).update(value).digest('hex');
  return db.$transaction(async tx=>{
    const keys=[{key:key('ip:'+String(ip||'unknown').slice(0,200)),limit:300},{key:key('user:'+b.username),limit:5}];
    for(const row of keys){
      await tx.$executeRaw`INSERT INTO "BackofficeStaffLoginGuard" ("key") VALUES (${row.key}) ON CONFLICT DO NOTHING`;
      await tx.$queryRaw`SELECT "key" FROM "BackofficeStaffLoginGuard" WHERE "key"=${row.key} FOR UPDATE`;
      await tx.$executeRaw`UPDATE "BackofficeStaffLoginGuard" SET "attempts"=0,"windowStartedAt"=NOW(),"blockedUntil"=NULL WHERE "key"=${row.key} AND "windowStartedAt"<NOW()-INTERVAL '15 minutes' AND ("blockedUntil" IS NULL OR "blockedUntil"<=NOW())`;
      const state=(await tx.$queryRaw`SELECT "attempts","blockedUntil">NOW() AS "blocked" FROM "BackofficeStaffLoginGuard" WHERE "key"=${row.key}`)[0];
      if(state.blocked||state.attempts>=row.limit)return {ok:false,limited:true};
    }
    for(const row of keys)await tx.$executeRaw`UPDATE "BackofficeStaffLoginGuard" SET "attempts"="attempts"+1,"blockedUntil"=CASE WHEN "attempts"+1>=${row.limit} THEN NOW()+INTERVAL '15 minutes' ELSE NULL END WHERE "key"=${row.key}`;
    const rows=await tx.$queryRaw`SELECT a."userId",a."companyId",a."pinHash",a."active",u."passwordHash" FROM "BackofficeStaffAccount" a JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId" JOIN "Company" c ON c."id"=u."companyId" WHERE a."username"=${b.username} AND u."role"::text='EMPLOYEE' AND c."active"=true FOR SHARE OF a,u,c`;
    const account=rows[0],hash=b.pin?account?.pinHash:account?.passwordHash;
    // Fixed valid dummy bcrypt hash equalizes absent-user work without issuance.
    const valid=await bcrypt.compare(b.pin||b.password,hash||'$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
    if(!account?.active||!valid)return {ok:false};
    const usernameKey=key('user:'+b.username);
    await tx.$executeRaw`UPDATE "BackofficeStaffLoginGuard" SET "attempts"=0,"blockedUntil"=NULL WHERE "key"=${usernameKey}`;
    const user=await tx.user.findUnique({where:{id:account.userId},select:{id:true,email:true,fullName:true,role:true,companyId:true,mustChangePassword:true,sessionVersion:true,company:{select:{id:true,name:true,active:true}}}});
    if(!user)return {ok:false};
    return {ok:true,userId:account.userId,...(issue?{session:await issue(tx,user)}:{})};
  },{timeout:15000});
}

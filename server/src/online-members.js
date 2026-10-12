import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';

export const onlineRegistrationSchema=z.object({
 fullName:z.string().trim().min(3).max(120),phone:z.string().trim().min(8).max(40),
 memberType:z.enum(['CUSTOMER','DOCTOR','STAFF']).default('CUSTOMER'),
 pin:z.string().regex(/^\d{6}$/,{message:'Ο προσωπικός PIN πρέπει να έχει 6 ψηφία.'}),
 pinConfirmation:z.string().regex(/^\d{6}$/,{message:'Επιβεβαίωσε τον προσωπικό PIN.'})
}).refine(v=>v.pin===v.pinConfirmation,{path:['pinConfirmation'],message:'Οι δύο PIN δεν ταιριάζουν.'});
export const onlineMemberChangeSchema=z.object({active:z.boolean(),decision:z.enum(['APPROVE','REJECT']).optional()});
export const normalizeMemberPhone=value=>String(value||'').replace(/\D/g,'');
const reject=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export function memberDiscountPercent(config,type){
 const key={DOCTOR:'doctorDiscountPercent',NURSE:'nurseDiscountPercent',STAFF:'staffDiscountPercent'}[type];
 const value=key?Number(config?.[key]||0):0;
 return Number.isFinite(value)?Math.round(Math.min(100,Math.max(0,value))*100)/100:0;
}

const schemas=new WeakMap();
export function ensureOnlineMemberSchema(db){
 if(!schemas.has(db))schemas.set(db,(async()=>{
  await db.$executeRawUnsafe(`ALTER TABLE "OnlineStoreMember" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED' CHECK ("approvalStatus" IN ('PENDING','APPROVED','REJECTED'))`);
  await db.$executeRawUnsafe(`DO $member_schema$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"OnlineStoreMember"'::regclass AND conname='OnlineStoreMember_member_type_check' AND POSITION('STAFF' IN pg_get_constraintdef(oid))>0) THEN
    ALTER TABLE "OnlineStoreMember" DROP CONSTRAINT IF EXISTS "OnlineStoreMember_member_type_check", ADD CONSTRAINT "OnlineStoreMember_member_type_check" CHECK ("memberType" IN ('DOCTOR','NURSE','STAFF','CUSTOMER'));
   END IF;
  END $member_schema$`);
 })().catch(error=>{schemas.delete(db);throw error}));
 return schemas.get(db);
}

// Shared hospital Wi-Fi must allow many different customers; repeated attempts
// for one phone are separately bounded. Keys never contain the plain phone/PIN.
export function createRegistrationLimiter({now=Date.now,maxKeys=10000}={}){
 const buckets=new Map(),windowMs=15*60*1000;
 return ({storeId,ip,phone})=>{
  const time=now();for(const [key,row] of buckets)if(row.until<=time)buckets.delete(key);
  const phoneHash=crypto.createHash('sha256').update(String(phone)).digest('hex');
  const limits=[[`${storeId}:ip:${ip}`,50],[`${storeId}:phone:${phoneHash}`,5]];
  if(buckets.size+limits.filter(([key])=>!buckets.has(key)).length>maxKeys)reject('Πολλές προσπάθειες εγγραφής. Δοκίμασε ξανά σε 15 λεπτά.',429);
  for(const [key,limit] of limits){const row=buckets.get(key);if(row?.count>=limit)reject('Πολλές προσπάθειες εγγραφής. Δοκίμασε ξανά σε 15 λεπτά.',429)}
  for(const [key] of limits){const row=buckets.get(key)||{count:0,until:time+windowMs};row.count++;buckets.set(key,row)}
 };
}

export async function registerOnlineMember(db,store,input){
 const body=onlineRegistrationSchema.parse(input),phone=normalizeMemberPhone(body.phone);
 if(!/^\d{8,15}$/.test(phone))reject('Βάλε έγκυρο κινητό ή τηλέφωνο.');
 const approved=body.memberType==='CUSTOMER',status=approved?'APPROVED':'PENDING',id=crypto.randomUUID();
 const pinHash=await bcrypt.hash(body.pin,12);
 const created=await db.$transaction(async tx=>{
  const rows=await tx.$queryRaw`INSERT INTO "OnlineStoreMember" ("id","companyId","storeId","fullName","phoneNormalized","pinHash","memberType","active","approvalStatus") VALUES (${id},${store.companyId},${store.id},${body.fullName},${phone},${pinHash},${body.memberType},${approved},${status}) ON CONFLICT ("storeId","phoneNormalized") DO NOTHING RETURNING "id"`;
  if(!rows.length)return false;
  await tx.authAudit.create({data:{email:'online-member-registration',event:'ONLINE_STORE_MEMBER_REGISTRATION',success:true,deviceName:`${store.companyId} / ${store.id} / ${id} / ${body.memberType} / ${status}`},select:{id:true}});
  return true;
 });
 if(!created)return{status:202,body:{ok:true,message:'Αν έχεις ήδη λογαριασμό, συνδέσου με τον προσωπικό PIN. Οι αιτήσεις έκπτωσης ελέγχονται από το κατάστημα.'}};
 return{status:approved?201:202,body:{ok:true,approvalStatus:status,message:approved?'Η εγγραφή ολοκληρώθηκε. Μπορείς να συνδεθείς.':'Η αίτηση καταχωρίστηκε. Η έκπτωση θα ενεργοποιηθεί μετά την έγκριση του καταστήματος.'}};
}

export async function changeOnlineMember(db,store,memberId,input,actor){
 const body=onlineMemberChangeSchema.parse(input);
 if((body.decision==='REJECT'&&body.active)||(body.decision==='APPROVE'&&!body.active))reject('Μη έγκυρη απόφαση αίτησης.');
 return db.$transaction(async tx=>{
  const rows=await tx.$queryRaw`SELECT "id","approvalStatus" FROM "OnlineStoreMember" WHERE "id"=${memberId} AND "companyId"=${store.companyId} AND "storeId"=${store.id} FOR UPDATE`;
  const member=rows[0];if(!member)reject('Δεν βρέθηκε δικαιούχος.',404);
  if(body.decision==='REJECT'&&member.approvalStatus!=='PENDING')reject('Η αίτηση έχει ήδη ελεγχθεί.',409);
  const status=body.decision==='REJECT'?'REJECTED':body.active?'APPROVED':member.approvalStatus;
  await tx.$executeRaw`UPDATE "OnlineStoreMember" SET "active"=${body.active},"approvalStatus"=${status},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${member.id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}`;
  await tx.authAudit.create({data:{userId:actor.id,email:actor.email||'super-admin',event:'ONLINE_STORE_MEMBER_APPROVAL',success:true,deviceName:`${store.companyId} / ${store.id} / ${member.id} / ${status} / ${body.active?'ACTIVE':'INACTIVE'}`},select:{id:true}});
  return{ok:true,active:body.active,approvalStatus:status};
 });
}

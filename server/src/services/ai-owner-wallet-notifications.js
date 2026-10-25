import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {getMailConfig} from './mail.js';
import {assertCustomerDemoOutboundAllowed} from '../customer-demo-runtime.js';

const euros=micros=>(Number(micros)/1000000).toLocaleString('el-GR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:6});
export function walletNoticeText(notice,instructions='Η ανανέωση πληρώνεται στο MyWorkStation. Επικοινώνησε μαζί μας για τα στοιχεία πληρωμής.'){
  const intro=notice.kind==='CREDIT'?`Πιστώθηκαν ${euros(notice.amountMicros)} στο υπόλοιπο AI.`:notice.kind==='LOW'?'Το υπόλοιπο AI είναι χαμηλό (20% ή λιγότερο της τελευταίας ανανέωσης).':'Το υπόλοιπο AI εξαντλήθηκε. Χρειάζεται ανανέωση για να συνεχιστεί η χρήση AI.';
  return {subject:notice.kind==='CREDIT'?'MyWorkStation · Επιβεβαίωση πίστωσης AI':notice.kind==='LOW'?'MyWorkStation · Χαμηλό υπόλοιπο AI':'MyWorkStation · Ανανέωση υπολοίπου AI',text:`${intro}\nΥπόλοιπο κατά την ειδοποίηση: ${euros(notice.balanceMicros)}.\nΤο υπόλοιπο αφορά συνολικά την εταιρεία σου.\n${instructions}\nΟι πωλήσεις και το υπόλοιπο πρόγραμμα συνεχίζουν κανονικά.\nΆνοιξε το MyWorkStation για το τρέχον υπόλοιπο.`};
}
export async function sendWalletNotice({to,subject,text,companyId},env=process.env){
  assertCustomerDemoOutboundAllowed({companyId});
  const config=getMailConfig(env);
  if(!config.host||!config.user||!config.password||!config.from)throw new Error('SMTP_NOT_CONFIGURED');
  const transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  try{return await transport.sendMail({from:`MyWorkStation <${config.from}>`,to,subject,text})}finally{transport.close()}
}
export function acceptedWalletMail(result,to){
  // Require complete positive SMTP evidence. An uncertain result is terminal
  // UNKNOWN and never automatically retried, including after process restart.
  const address=v=>typeof v==='string'?v:typeof v?.address==='string'?v.address:null;
  return typeof result?.messageId==='string'&&Boolean(result.messageId.trim())&&Array.isArray(result.accepted)&&result.accepted.length===1&&address(result.accepted[0])?.toLowerCase()===to.toLowerCase()&&Array.isArray(result.rejected)&&result.rejected.length===0&&(!Object.hasOwn(result,'pending')||Array.isArray(result.pending)&&result.pending.length===0);
}
export function createWalletNotificationDispatcher({repository,send=sendWalletNotice,enabled=()=>process.env.AI_OWNER_WALLET_ENABLED==='true'&&process.env.AI_OWNER_WALLET_EMAIL_ENABLED==='true',instructions=()=>process.env.AI_OWNER_WALLET_PAYMENT_INSTRUCTIONS}={}){
  return async function drain(){
    if(!enabled())return {attempted:0};
    await repository.ensure();const db=repository.db;
    let attempted=0;
    for(let i=0;i<10;i++){
      if(!enabled())break;
      const notice=await db.$transaction(async tx=>{
        const rows=await tx.$queryRaw`SELECT n.* FROM "AiOwnerWalletNotice" n WHERE n."emailStatus"='PENDING' ORDER BY n."createdAt",n."id" FOR UPDATE SKIP LOCKED LIMIT 1`;
        const item=rows[0];if(!item)return null;
        const valid=await tx.$queryRaw`SELECT u."id" FROM "AiOwnerWallet" w JOIN "Company" c ON c."id"=w."companyId" JOIN "User" u ON u."id"=w."notificationOwnerId" WHERE w."companyId"=${item.companyId} AND c."active"=TRUE AND (u."companyId"=w."companyId" OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=w."companyId")) AND w."emailEnabled"=TRUE AND u."role"::text='OWNER' AND u."mustChangePassword"=FALSE AND u."id"=${item.ownerId} AND u."email"=${item.email}`;
        if(!valid.length){await tx.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"='REVOKED' WHERE "id"=${item.id}`;return {revoked:true}}
        await tx.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"='ATTEMPTING',"attemptedAt"=NOW(),"messageId"=${'attempt-'+randomUUID()} WHERE "id"=${item.id}`;
        return item;
      });
      if(!notice)break;if(notice.revoked)continue;
      // The ATTEMPTING commit precedes SMTP. Crash/timeout or process death
      // cannot requeue this notice and cause a duplicate external message.
      let status='UNKNOWN',messageId=null;attempted++;
      try{
        if(enabled()){
          const result=await send({companyId:notice.companyId,to:notice.email,...walletNoticeText(notice,instructions())});
          if(acceptedWalletMail(result,notice.email)){status='ACCEPTED';messageId=result.messageId.slice(0,250)}
        }else status='REVOKED';
      }catch{/* Do not log SMTP credentials, address or raw provider response. */}
      await db.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"=${status},"messageId"=${messageId} WHERE "id"=${notice.id} AND "emailStatus"='ATTEMPTING'`;
    }
    return {attempted};
  };
}

import fs from "fs";

const path=new URL("./routes/cash-control.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_SAFE_VAULT_CLOSE_ALERT_V1";
if(src.includes(marker)){
  console.log("Safe vault close alert patch already installed.");
  process.exit(0);
}

if(src.includes('import { sendCashShiftClosedEmail } from "../services/mail.js";')){
  src=src.replace('import { sendCashShiftClosedEmail } from "../services/mail.js";','import { sendCashShiftClosedEmail, sendEmail } from "../services/mail.js";');
}

const schemaOld='const closeSchema=z.object({cashSales:amount,cardSales:amount,eftposTotal:amount,expenses:amount,drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable()});';
const schemaNew='const closeSchema=z.object({cashSales:amount,cardSales:amount,eftposTotal:amount,expenses:amount,drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable(),safeReason:z.string().trim().max(1000).optional().nullable()});';
if(src.includes(schemaOld))src=src.replace(schemaOld,schemaNew);

const sessionAnchor='    const session=normalize(found[0]);if(!session)return null;assertStoreAccess(req,session.storeId);';
const sessionReplacement=`    const session=normalize(found[0]);if(!session)return null;assertStoreAccess(req,session.storeId);\n    // ${marker}\n    const previousSafe=money(session.openingSafe),safeDelta=Number((body.safe-previousSafe).toFixed(2)),safeReason=String(body.safeReason||"").trim();\n    if(safeDelta < -0.009 && safeReason.length < 3){const error=new Error(\`Το Χρηματοκιβώτιο μειώθηκε από \${previousSafe.toFixed(2)} € σε \${body.safe.toFixed(2)} €. Απαιτείται αιτιολογία πριν κλείσει η βάρδια.\`);error.status=409;throw error}`;
if(!src.includes(sessionAnchor)){
  console.error("Safe vault close session anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(sessionAnchor,sessionReplacement);

const duplicateAnchor='    const duplicateReview=Math.abs(cardVariance)>0.009?await findConsecutiveDuplicateSales(tx,req.user.companyId,session.storeId,session.openedAt,new Date()):[],duplicateReviewJson=JSON.stringify(duplicateReview);';
const duplicateReplacement=`    const duplicateReview=Math.abs(cardVariance)>0.009?await findConsecutiveDuplicateSales(tx,req.user.companyId,session.storeId,session.openedAt,new Date()):[],duplicateReviewJson=JSON.stringify(duplicateReview);\n    if(Math.abs(safeDelta)>0.009){const description=[\`Χρηματοκιβώτιο στο κλείσιμο: \${previousSafe.toFixed(2)} € → \${body.safe.toFixed(2)} €\`,safeReason?\`Αιτιολογία: \${safeReason}\`:null].filter(Boolean).join(" · ");await tx.$executeRaw\`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","actorId","actorName","occurredAt","createdAt") VALUES (\${crypto.randomUUID()},\${req.user.companyId},\${session.storeId},\${session.id},'SAFE_ADJUSTMENT',\${safeDelta},\${description},false,\${req.user.id},\${actorName},NOW(),NOW())\`;}`;
if(!src.includes(duplicateAnchor)){
  console.error("Safe vault close audit anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(duplicateAnchor,duplicateReplacement);

const returnOld='    return rows[0]?{closed:normalize(rows[0]),storeId:session.storeId}:null;';
const returnNew='    return rows[0]?{closed:normalize(rows[0]),storeId:session.storeId,safeChange:Math.abs(safeDelta)>0.009?{previousSafe,newSafe:body.safe,delta:safeDelta,reason:safeReason||null}:null}:null;';
if(!src.includes(returnOld)){
  console.error("Safe vault close return anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(returnOld,returnNew);

const destructureOld='  const {closed,storeId}=closeResult;';
const destructureNew='  const {closed,storeId,safeChange}=closeResult;';
if(!src.includes(destructureOld)){
  console.error("Safe vault close destructure anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(destructureOld,destructureNew);

const responseOld='  res.json({...closed,emailNotification});';
const responseNew=`  let safeEmailNotification={status:"SKIPPED",recipients:[]};\n  if(safeChange?.delta < -0.009){\n    const safeRecipients=[...new Set([...recipients,String(process.env.MAIL_TEST_RECIPIENT||"").trim()].filter(Boolean))];\n    if(safeRecipients.length){try{const subject=\`ΠΡΟΣΟΧΗ · Μείωση Χρηματοκιβωτίου · \${store?.name||"Κατάστημα"}\`;const text=[subject,"",\`Κατάστημα: \${store?.name||"Κατάστημα"}\`,\`Βάρδια: \${closed.shiftLabel}\`,\`Χειριστής: \${actorName}\`,\`Προηγούμενο ποσό: \${Number(safeChange.previousSafe).toFixed(2)} €\`,\`Νέο ποσό: \${Number(safeChange.newSafe).toFixed(2)} €\`,\`Μείωση: \${Math.abs(Number(safeChange.delta)).toFixed(2)} €\`,\`Αιτιολογία: \${safeChange.reason||"—"}\`,"","Αυτόματο μήνυμα από το MyWorkStation."].join("\\n");const sent=await sendEmail({to:safeRecipients,subject,text,html:\`<div style="font-family:Arial,sans-serif"><h2>\${subject}</h2><p><b>Κατάστημα:</b> \${store?.name||"Κατάστημα"}</p><p><b>Βάρδια:</b> \${closed.shiftLabel}</p><p><b>Χειριστής:</b> \${actorName}</p><p><b>Προηγούμενο:</b> \${Number(safeChange.previousSafe).toFixed(2)} €</p><p><b>Νέο:</b> \${Number(safeChange.newSafe).toFixed(2)} €</p><p><b>Μείωση:</b> \${Math.abs(Number(safeChange.delta)).toFixed(2)} €</p><p><b>Αιτιολογία:</b> \${safeChange.reason||"—"}</p></div>\`});safeEmailNotification={status:"SENT",recipients:sent.recipients}}catch(error){console.error("Safe close decrease email failed",error?.message||error);safeEmailNotification={status:"FAILED",recipients:safeRecipients}}}\n  }\n  res.json({...closed,emailNotification,safeChange,safeEmailNotification});`;
if(!src.includes(responseOld)){
  console.error("Safe vault close response anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(responseOld,responseNew);

fs.writeFileSync(path,src);
console.log("Safe vault close reason, audit and email alert installed.");

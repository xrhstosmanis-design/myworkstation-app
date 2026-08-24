import fs from "fs";

const path=new URL("./routes/cash-control.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_SAFE_VAULT_ADJUSTMENT_ALERT_V1";
if(src.includes(marker)){
  console.log("Safe vault adjustment alert patch already installed.");
  process.exit(0);
}

const importOld='import { sendCashShiftClosedEmail } from "../services/mail.js";';
const importNew='import { sendCashShiftClosedEmail, sendEmail } from "../services/mail.js";';
if(src.includes(importOld)) src=src.replace(importOld,importNew);

const schemaOld='const openSchema=z.object({shiftLabel:z.string().trim().min(2).max(80).default("Βάρδια"),drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable()});';
const schemaNew='const openSchema=z.object({shiftLabel:z.string().trim().min(2).max(80).default("Βάρδια"),drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable(),safeReason:z.string().trim().max(1000).optional().nullable()});';
if(src.includes(schemaOld)) src=src.replace(schemaOld,schemaNew);

const routePattern=/  const operational=body\.drawer\+body\.custody\+body\.coins;\n  const lastClosedRows=await prisma\.\$queryRaw`SELECT "nextOpeningTotal" FROM "CashShiftSession" WHERE "storeId"=\$\{store\.id\} AND "companyId"=\$\{req\.user\.companyId\} AND "status"='CLOSED' ORDER BY "closedAt" DESC LIMIT 1`;\n  const expectedOpening=[\s\S]*?\n  res\.status\(201\)\.json\(normalize\(rows\[0\]\)\);/;

const newBlock=`  // ${marker}
  const operational=body.drawer+body.custody+body.coins; // ΧΡΗΜΑΤΟΚΙΒΩΤΙΟ ΔΕΝ ΜΕΤΡΑΕΙ ΣΤΟ ΛΕΙΤΟΥΡΓΙΚΟ ΤΑΜΕΙΟ
  const lastClosedRows=await prisma.$queryRaw\`SELECT "nextOpeningTotal","closingSafe" FROM "CashShiftSession" WHERE "storeId"=\${store.id} AND "companyId"=\${req.user.companyId} AND "status"='CLOSED' ORDER BY "closedAt" DESC LIMIT 1\`;
  const previousSafe=lastClosedRows[0]?money(lastClosedRows[0].closingSafe):body.safe;
  const safeDelta=Number((body.safe-previousSafe).toFixed(2));
  const safeReason=String(body.safeReason||body.note||"").trim();
  if(safeDelta < -0.009 && !safeReason){
    return res.status(409).json({error:\`Το Χρηματοκιβώτιο μειώθηκε από \${previousSafe.toFixed(2)} € σε \${body.safe.toFixed(2)} €. Απαιτείται αιτιολογία πριν ανοίξει η βάρδια.\`,code:"SAFE_DECREASE_REASON_REQUIRED",previousSafe,newSafe:body.safe,delta:safeDelta});
  }
  const expectedOpening=lastClosedRows[0]?money(lastClosedRows[0].nextOpeningTotal):operational,openingVariance=operational-expectedOpening,actorName=req.user.fullName||"Χρήστης";
  const sessionId=crypto.randomUUID();
  const rows=await prisma.$queryRaw\`
    INSERT INTO "CashShiftSession" ("id","companyId","storeId","shiftLabel","openedBy","openedByName","openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","openingNote")
    VALUES (\${sessionId},\${req.user.companyId},\${store.id},\${body.shiftLabel},\${req.user.id},\${actorName},\${body.drawer},\${body.custody},\${body.coins},\${body.safe},\${operational},\${expectedOpening},\${openingVariance},\${body.note||null}) RETURNING *\`;

  let safeChange=null;
  if(Math.abs(safeDelta)>0.009){
    const description=[\`Χρηματοκιβώτιο: \${previousSafe.toFixed(2)} € → \${body.safe.toFixed(2)} €\`,safeReason?\`Αιτιολογία: \${safeReason}\`:null].filter(Boolean).join(" · ");
    await prisma.$executeRaw\`
      INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","actorId","actorName","occurredAt","createdAt")
      VALUES (\${crypto.randomUUID()},\${req.user.companyId},\${store.id},\${sessionId},'SAFE_ADJUSTMENT',\${safeDelta},\${description},false,\${req.user.id},\${actorName},NOW(),NOW())
    \`;
    safeChange={previousSafe,newSafe:body.safe,delta:safeDelta,reason:safeReason||null,emailAlerted:false};
    if(safeDelta<0){
      try{
        const owners=await prisma.user.findMany({where:{companyId:req.user.companyId,role:"OWNER"},select:{email:true}});
        const recipients=[store.responsibleEmail,...owners.map(row=>row.email)].filter(Boolean);
        if(recipients.length){
          const now=new Date();
          const subject=\`ΠΡΟΣΟΧΗ · Μείωση Χρηματοκιβωτίου · \${store.name}\`;
          const text=[subject,"",\`Κατάστημα: \${store.name}\`,\`Βάρδια: \${body.shiftLabel}\`,\`Χειριστής: \${actorName}\`,\`Ημερομηνία / ώρα: \${now.toLocaleString("el-GR")}\`,\`Προηγούμενο ποσό: \${previousSafe.toFixed(2)} €\`,\`Νέο ποσό: \${body.safe.toFixed(2)} €\`,\`Μείωση: \${Math.abs(safeDelta).toFixed(2)} €\`,\`Αιτιολογία: \${safeReason}\`,"","Αυτόματο μήνυμα από το MyWorkStation."].join("\\n");
          await sendEmail({to:recipients,subject,text,html:\`<div style="font-family:Arial,sans-serif"><h2>\${subject}</h2><p><b>Κατάστημα:</b> \${store.name}</p><p><b>Βάρδια:</b> \${body.shiftLabel}</p><p><b>Χειριστής:</b> \${actorName}</p><p><b>Προηγούμενο:</b> \${previousSafe.toFixed(2)} €</p><p><b>Νέο:</b> \${body.safe.toFixed(2)} €</p><p><b>Μείωση:</b> \${Math.abs(safeDelta).toFixed(2)} €</p><p><b>Αιτιολογία:</b> \${safeReason}</p></div>\`});
          safeChange.emailAlerted=true;
        }
      }catch(mailError){console.error("Safe decrease email alert failed:",mailError?.message||mailError)}
    }
  }
  res.status(201).json({...normalize(rows[0]),safeChange});`;

if(!routePattern.test(src)){
  console.error("Safe vault patch route anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(routePattern,newBlock);
fs.writeFileSync(path,src);
console.log("Safe vault adjustment tracking and decrease alert installed.");

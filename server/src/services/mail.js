import nodemailer from "nodemailer";

const DEFAULT_PORT=465;

export function getMailConfig(env=process.env){
  const port=Number(env.SMTP_PORT||DEFAULT_PORT);
  return {
    host:String(env.SMTP_HOST||"").trim(),
    port:Number.isInteger(port)&&port>0?port:DEFAULT_PORT,
    secure:String(env.SMTP_SECURE??"true").toLowerCase()!=="false",
    user:String(env.SMTP_USER||"").trim(),
    password:String(env.SMTP_PASSWORD||""),
    from:String(env.MAIL_FROM||env.SMTP_USER||"").trim(),
    testRecipient:String(env.MAIL_TEST_RECIPIENT||"").trim()
  };
}

export function getMailStatus(env=process.env){
  const config=getMailConfig(env);
  const missing=[];
  if(!config.host)missing.push("SMTP_HOST");
  if(!config.user)missing.push("SMTP_USER");
  if(!config.password)missing.push("SMTP_PASSWORD");
  if(!config.from)missing.push("MAIL_FROM");
  if(!config.testRecipient)missing.push("MAIL_TEST_RECIPIENT");
  return {
    configured:missing.length===0,
    missing,
    host:config.host||null,
    port:config.port,
    secure:config.secure,
    from:config.from||null,
    testRecipient:config.testRecipient||null
  };
}

function requireMailConfig(){
  const status=getMailStatus();
  if(!status.configured){
    const error=new Error(`Η υπηρεσία email δεν έχει ρυθμιστεί πλήρως: ${status.missing.join(", ")}`);
    error.status=503;
    throw error;
  }
  return getMailConfig();
}

function createTransport(config){
  return nodemailer.createTransport({
    host:config.host,
    port:config.port,
    secure:config.secure,
    auth:{user:config.user,pass:config.password},
    connectionTimeout:15000,
    greetingTimeout:15000,
    socketTimeout:20000
  });
}

export async function sendEmail({to,subject,text,html,attachments=[]}){
  const config=requireMailConfig();
  const recipients=[...new Set((Array.isArray(to)?to:[to]).map(value=>String(value||"").trim().toLowerCase()).filter(Boolean))];
  if(!recipients.length){
    const error=new Error("Δεν έχει οριστεί παραλήπτης email.");
    error.status=422;
    throw error;
  }
  const transport=createTransport(config);
  const result=await transport.sendMail({from:`MyWorkStation <${config.from}>`,to:recipients,subject,text,html,attachments});
  return {messageId:result.messageId,recipients};
}

export async function sendTestEmail(){
  const config=requireMailConfig();
  const sentAt=new Date();
  const result=await sendEmail({
    to:config.testRecipient,
    subject:"ΔΟΚΙΜΗ EMAIL MYWORKSTATION",
    text:`Η ασφαλής σύνδεση email του MyWorkStation λειτουργεί.\n\nΗμερομηνία δοκιμής: ${sentAt.toISOString()}`,
    html:`<h2>MyWorkStation</h2><p>Η ασφαλής σύνδεση email λειτουργεί.</p><p><strong>Ημερομηνία δοκιμής:</strong> ${sentAt.toISOString()}</p>`
  });
  return {messageId:result.messageId,sentAt:sentAt.toISOString(),recipient:config.testRecipient};
}

const eur=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

export async function sendCashShiftClosedEmail({to,storeName,session}){
  const variance=Number(session.variance||0);
  const cardVariance=Number(session.cardVariance||0);
  const openingVariance=Number(session.openingVariance||0);
  const duplicateReview=Array.isArray(session.duplicateReview)?session.duplicateReview:[];
  const alert=Math.abs(variance)>0.009||Math.abs(cardVariance)>0.009||Math.abs(openingVariance)>0.009||duplicateReview.length>0;
  const closedAt=session.closedAt?new Date(session.closedAt):new Date();
  const subject=`${alert?"ΠΡΟΣΟΧΗ · ":""}Κλείσιμο ταμείου · ${storeName} · ${closedAt.toLocaleDateString("el-GR")}`;
  const rows=[
    ["Κατάστημα",storeName],["Βάρδια",session.shiftLabel],["Υπεύθυνος",session.closedByName||"—"],
    ["Μετρητά πωλήσεων",eur(session.cashSales)],["Κάρτες POS",eur(session.cardSales)],
    ["EFTPOS",eur(session.eftposTotal)],["Διαφορά POS–EFTPOS",eur(cardVariance)],
    ["Αναμενόμενη έναρξη",eur(session.expectedOpeningOperational)],["Δηλωμένη έναρξη",eur(session.openingOperational)],
    ["Διαφορά έναρξης",eur(openingVariance)],
    ["Έξοδα",eur(session.expenses)],["Αναμενόμενο ταμείο",eur(session.expectedOperational)],
    ["Πραγματικό ταμείο",eur(session.actualOperational)],["Διαφορά ταμείου",eur(variance)],
    ["Έναρξη επόμενης",eur(session.nextOpeningTotal)]
  ];
  const duplicateText=duplicateReview.length
    ?duplicateReview.map(item=>`${new Date(item.firstAt).toLocaleString("el-GR")} → ${new Date(item.secondAt).toLocaleString("el-GR")} · ${eur(item.total)} · ${(item.products||[]).join(", ")}`).join("\n")
    :"Δεν βρέθηκαν διαδοχικές ίδιες συναλλαγές.";
  const text=[subject,"",...rows.map(([label,value])=>`${label}: ${value}`),"",`Έλεγχος διπλών συναλλαγών:\n${duplicateText}`,session.closingNote?`\nΣημείωση: ${session.closingNote}`:""].join("\n");
  const htmlRows=rows.map(([label,value])=>`<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const html=`<div style="font-family:Arial,sans-serif;max-width:680px"><h2>${escapeHtml(subject)}</h2><table style="width:100%;border-collapse:collapse">${htmlRows}</table><h3>Έλεγχος διπλών συναλλαγών</h3><pre style="white-space:pre-wrap;background:#f5f7fa;padding:12px">${escapeHtml(duplicateText)}</pre>${session.closingNote?`<p><strong>Σημείωση:</strong> ${escapeHtml(session.closingNote)}</p>`:""}<p style="color:#64748b">Αυτόματο μήνυμα από το MyWorkStation.</p></div>`;
  return sendEmail({to,subject,text,html});
}

export async function sendLedgerAlertEmail({to,kind,storeName,amount,actorName,occurredAt,description,reason,originalType}){
  const at=occurredAt?new Date(occurredAt):new Date();
  const isReversal=kind==="REVERSAL";
  const title=isReversal?"Αντιλογισμός συναλλαγής":"Καταχώριση ποσοστών";
  const subject=`ΕΙΔΟΠΟΙΗΣΗ · ${title} · ${storeName}`;
  const rows=[["Ενέργεια",title],["Κατάστημα",storeName],["Ημερομηνία / ώρα",at.toLocaleString("el-GR")],["Ποσό",eur(amount)],["Χρήστης",actorName||"—"]];
  if(isReversal&&originalType)rows.push(["Αρχικός τύπος",originalType]);
  if(description)rows.push(["Περιγραφή",description]);
  if(reason)rows.push(["Αιτιολογία αντιλογισμού",reason]);
  const text=[subject,"",...rows.map(([label,value])=>`${label}: ${value}`),"","Αυτόματο μήνυμα από το MyWorkStation."].join("\n");
  const htmlRows=rows.map(([label,value])=>`<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const html=`<div style="font-family:Arial,sans-serif;max-width:680px"><h2>${escapeHtml(subject)}</h2><table style="width:100%;border-collapse:collapse">${htmlRows}</table><p style="color:#64748b">Αυτόματο μήνυμα από το MyWorkStation.</p></div>`;
  return sendEmail({to,subject,text,html});
}

import {assertCustomerDemoOutboundAllowed} from "../customer-demo-runtime.js";
import { normalizeReportRecipients, reportRecipientListSchema } from "./report-recipients.js";
import nodemailer from "nodemailer";

const DEFAULT_PORT=465;

// Additive transport boundary only. Verification, consent and committed start
// remain the driver's responsibility; construction never creates an SMTP client.
export function createAutomaticReportSmtpTransport(options){
  const invalid=()=>{throw Object.assign(new Error("Invalid automatic report transport input."),{code:"INVALID_REPORT_TRANSPORT"})};
  const data=(value,keys,required=keys)=>{
    if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
    const result=Object.create(null);
    for(const key of Reflect.ownKeys(value)){
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(typeof key!=="string"||!keys.includes(key)||!d.enumerable||!Object.hasOwn(d,"value"))invalid();
      result[key]=d.value;
    }
    if(required.some(key=>!Object.hasOwn(result,key)))invalid();
    return result;
  };
  const text=(value,max)=>typeof value==="string"&&value.length>0&&value===value.trim()&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
  const email=value=>text(value,254)&&value===value.toLowerCase()&&!/[,;]/.test(value)&&reportRecipientListSchema.safeParse(value).success;
  const args=data(options,["companyId","storeId","env","createTransport"],["companyId","storeId"]);
  if(!text(args.companyId,200)||!text(args.storeId,200))invalid();
  const scope=Object.freeze({companyId:args.companyId,storeId:args.storeId});
  assertCustomerDemoOutboundAllowed(scope);
  const factory=args.createTransport===undefined?nodemailer.createTransport:args.createTransport;
  if(typeof factory!=="function")invalid();
  const environment=args.env===undefined?process.env:args.env,environmentCopy=Object.create(null);
  if(!environment||typeof environment!=="object"||Array.isArray(environment))invalid();
  for(const key of ["SMTP_HOST","SMTP_PORT","SMTP_SECURE","SMTP_USER","SMTP_PASSWORD","MAIL_FROM"]){
    const d=Object.getOwnPropertyDescriptor(environment,key);
    if(!d)continue;
    if(!d.enumerable||!Object.hasOwn(d,"value")||typeof d.value!=="string")invalid();
    environmentCopy[key]=d.value;
  }
  const config=Object.freeze(getMailConfig(environmentCopy));
  // MAIL_TEST_RECIPIENT belongs to the legacy test-email API, not this sender.
  if(!config.host||!config.user||!config.password||!email(config.from.toLowerCase())||/[\r\n]/.test(config.from)||config.port>65535)
    throw Object.assign(new Error("Automatic report SMTP is not configured."),{status:503,code:"REPORT_SMTP_NOT_CONFIGURED"});
  const own=(value,key)=>{
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d)return {present:false};
    if(!d.enumerable||!Object.hasOwn(d,"value"))invalid();
    return {present:true,value:d.value};
  };
  const list=value=>{
    if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>1000||Reflect.ownKeys(value).length!==value.length+1)invalid();
    const result=[];
    for(let i=0;i<value.length;i++){const entry=own(value,String(i));if(!entry.present||!text(entry.value,254))invalid();result.push(entry.value)}
    return Object.freeze(result);
  };
  const receipt=result=>{
    if(!result||typeof result!=="object"||Array.isArray(result)||![Object.prototype,null].includes(Object.getPrototypeOf(result)))invalid();
    // Nodemailer rejection details are not part of the minimal receipt, but
    // contradictory or opaque rejection evidence must never disappear when
    // projecting an otherwise successful-looking result.
    const rejectedErrors=own(result,"rejectedErrors");
    if(rejectedErrors.present&&list(rejectedErrors.value).length)invalid();
    const output={};
    for(const key of ["accepted","rejected","pending","messageId","response","envelope"]){
      const item=own(result,key);if(!item.present)continue;
      if(["accepted","rejected","pending"].includes(key))output[key]=list(item.value);
      else if(key==="envelope"){
        const e=data(item.value,["from","to"],["to"]);
        if(Object.hasOwn(e,"from")&&!text(e.from,254))invalid();
        output.envelope=Object.freeze({...e,to:list(e.to)});
      }else{if(!text(item.value,key==="response"?2000:500))invalid();output[key]=item.value}
    }
    // Missing evidence remains missing. In particular never substitute intended
    // recipients or an empty rejection list for the provider's actual receipt.
    return Object.freeze(output);
  };
  return Object.freeze({async sendMail(raw){
    assertCustomerDemoOutboundAllowed(scope);
    const message=data(raw,["to","subject","text"]);
    if(!email(message.to)||!text(message.subject,1000)||typeof message.text!=="string"||!message.text.length||Buffer.byteLength(message.text,"utf8")>2*1024*1024)invalid();
    const transport=factory({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
    if(!transport||typeof transport.sendMail!=="function")invalid();
    const result=await transport.sendMail({from:`MyWorkStation <${config.from}>`,to:message.to,envelope:{from:config.from,to:[message.to]},subject:message.subject,text:message.text});
    return receipt(result);
  }});
}

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

export async function sendEmail({to,subject,text,html,attachments=[],companyId,storeId}){
  assertCustomerDemoOutboundAllowed({companyId,storeId});
  const config=requireMailConfig();
  const recipients=normalizeReportRecipients(to);
  if(!recipients.length){
    const error=new Error("Δεν έχει οριστεί παραλήπτης email.");
    error.status=422;
    throw error;
  }
  const transport=createTransport(config);
  try{
    const result=await transport.sendMail({from:`MyWorkStation <${config.from}>`,to:recipients,subject,text,html,attachments});
    return {messageId:result.messageId,recipients};
  }catch(cause){
    const code=String(cause?.code||"").toUpperCase();
    const responseCode=Number(cause?.responseCode||0);
    let reason="Ο διακομιστής email δεν δέχτηκε την αποστολή.";
    if(["EAUTH","ENOAUTH"].includes(code)||[530,535].includes(responseCode))reason="Απέτυχε η πιστοποίηση SMTP. Ελέγξτε το όνομα χρήστη και τον κωδικό εφαρμογής email.";
    else if(["ECONNECTION","ECONNREFUSED","ETIMEDOUT","ESOCKET","EDNS"].includes(code))reason="Δεν ήταν δυνατή η σύνδεση με τον διακομιστή SMTP. Ελέγξτε host, θύρα και ασφαλή σύνδεση.";
    else if(responseCode>=500&&responseCode<600)reason="Ο διακομιστής email απέρριψε τον αποστολέα ή τον παραλήπτη.";
    const error=new Error(`Η αναφορά δημιουργήθηκε, αλλά δεν στάλθηκε με email. ${reason}`);
    error.status=502;
    error.code="MAIL_DELIVERY_FAILED";
    error.cause=cause;
    throw error;
  }
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

export async function sendCashShiftClosedEmail({to,storeName,session,companyId,storeId}){
  const variance=Number(session.variance||0);
  const cardVariance=Number(session.cardVariance||0);
  const openingVariance=Number(session.openingVariance||0);
  const duplicateReview=Array.isArray(session.duplicateReview)?session.duplicateReview:[];
  const alert=Math.abs(variance)>0.009||Math.abs(cardVariance)>0.009||Math.abs(openingVariance)>0.009||duplicateReview.length>0;
  const closedAt=session.closedAt?new Date(session.closedAt):new Date();
  const subject=`${alert?"ΠΡΟΣΟΧΗ · ":""}Κλείσιμο ταμείου · ${storeName} · ${closedAt.toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}`;
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
    ?duplicateReview.map(item=>`${new Date(item.firstAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})} → ${new Date(item.secondAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})} · ${eur(item.total)} · ${(item.products||[]).join(", ")}`).join("\n")
    :"Δεν βρέθηκαν διαδοχικές ίδιες συναλλαγές.";
  const text=[subject,"",...rows.map(([label,value])=>`${label}: ${value}`),"",`Έλεγχος διπλών συναλλαγών:\n${duplicateText}`,session.closingNote?`\nΣημείωση: ${session.closingNote}`:""].join("\n");
  const htmlRows=rows.map(([label,value])=>`<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const html=`<div style="font-family:Arial,sans-serif;max-width:680px"><h2>${escapeHtml(subject)}</h2><table style="width:100%;border-collapse:collapse">${htmlRows}</table><h3>Έλεγχος διπλών συναλλαγών</h3><pre style="white-space:pre-wrap;background:#f5f7fa;padding:12px">${escapeHtml(duplicateText)}</pre>${session.closingNote?`<p><strong>Σημείωση:</strong> ${escapeHtml(session.closingNote)}</p>`:""}<p style="color:#64748b">Αυτόματο μήνυμα από το MyWorkStation.</p></div>`;
  return sendEmail({to,subject,text,html,companyId,storeId});
}

export async function sendCashControlDailyReportEmail({to,storeName,date,rows,comment,auditorName,companyId,storeId}){
  const shortage=rows.reduce((sum,row)=>sum+(Number(row.variance)<0?Math.abs(Number(row.variance)):0),0);
  const surplus=rows.reduce((sum,row)=>sum+(Number(row.variance)>0?Number(row.variance):0),0);
  const subject=`Αναφορά ελέγχου ταμείων · ${storeName} · ${date}`;
  const lines=rows.map(row=>`${row.shiftLabel} · ${row.terminalPos||"MAIN"} · ${row.openedByName||"—"} · Διαφορά ${eur(row.variance)} · POS–EFTPOS ${eur(row.cardVariance)}`);
  const text=[subject,"",...lines,"",`Συνολικό έλλειμμα: ${eur(shortage)}`,`Συνολικό πλεόνασμα: ${eur(surplus)}`,comment?`Σχόλιο ελέγχου: ${comment}`:"",`Ελέγχθηκε από: ${auditorName}`].filter(Boolean).join("\n");
  const htmlRows=rows.map(row=>`<tr><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(row.shiftLabel)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(row.terminalPos||"MAIN")}</td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(row.openedByName||"—")}</td><td style="padding:8px;border-bottom:1px solid #ddd;font-weight:700">${escapeHtml(eur(row.variance))}</td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(eur(row.cardVariance))}</td></tr>`).join("");
  const html=`<div style="font-family:Arial,sans-serif;max-width:760px"><h2>${escapeHtml(subject)}</h2><table style="width:100%;border-collapse:collapse"><tr><th>Βάρδια</th><th>POS</th><th>Χειριστής</th><th>Διαφορά</th><th>POS–EFTPOS</th></tr>${htmlRows}</table><p><strong>Συνολικό έλλειμμα:</strong> ${escapeHtml(eur(shortage))}<br><strong>Συνολικό πλεόνασμα:</strong> ${escapeHtml(eur(surplus))}</p>${comment?`<p><strong>Σχόλιο ελέγχου:</strong> ${escapeHtml(comment)}</p>`:""}<p><strong>Ελέγχθηκε από:</strong> ${escapeHtml(auditorName)}</p><p style="color:#64748b">Η αναφορά στάλθηκε χειροκίνητα από τον Super Admin.</p></div>`;
  return sendEmail({to,subject,text,html,companyId,storeId});
}

export async function sendLedgerAlertEmail({to,kind,storeName,amount,actorName,occurredAt,description,reason,originalType,companyId,storeId}){
  const at=occurredAt?new Date(occurredAt):new Date();
  const isReversal=kind==="REVERSAL";
  const title=isReversal?"Αντιλογισμός συναλλαγής":"Καταχώριση ποσοστών";
  const subject=`ΕΙΔΟΠΟΙΗΣΗ · ${title} · ${storeName}`;
  const rows=[["Ενέργεια",title],["Κατάστημα",storeName],["Ημερομηνία / ώρα",at.toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})],["Ποσό",eur(amount)],["Χρήστης",actorName||"—"]];
  if(isReversal&&originalType)rows.push(["Αρχικός τύπος",originalType]);
  if(description)rows.push(["Περιγραφή",description]);
  if(reason)rows.push(["Αιτιολογία αντιλογισμού",reason]);
  const text=[subject,"",...rows.map(([label,value])=>`${label}: ${value}`),"","Αυτόματο μήνυμα από το MyWorkStation."].join("\n");
  const htmlRows=rows.map(([label,value])=>`<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const html=`<div style="font-family:Arial,sans-serif;max-width:680px"><h2>${escapeHtml(subject)}</h2><table style="width:100%;border-collapse:collapse">${htmlRows}</table><p style="color:#64748b">Αυτόματο μήνυμα από το MyWorkStation.</p></div>`;
  return sendEmail({to,subject,text,html,companyId,storeId});
}

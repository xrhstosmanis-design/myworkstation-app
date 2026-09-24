#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const filename=process.argv[2];
if(!filename){
  console.error("Χρήση: node tools/pilot-readiness/check-pilot-readiness.mjs <pilot-site.json>");
  process.exit(2);
}

let profile;
try{profile=JSON.parse(fs.readFileSync(path.resolve(filename),"utf8"));}
catch(error){
  console.error(`NOT READY: δεν διαβάστηκε έγκυρο JSON (${error.message}).`);
  process.exit(2);
}

const missing=[];
const forbidden=[];
const requireText=(value,label)=>{if(!String(value??"").trim())missing.push(label);};
const requireTrue=(value,label)=>{if(value!==true)missing.push(label);};
const inspectSecrets=(value,trail=[])=>{
  if(!value||typeof value!=="object")return;
  for(const [key,child] of Object.entries(value)){
    const next=[...trail,key];
    if(/pin|password|secret|token|activation/i.test(key))forbidden.push(next.join("."));
    if(child&&typeof child==="object")inspectSecrets(child,next);
  }
};
inspectSecrets(profile);

requireText(profile.store?.name,"Κατάστημα");
requireText(profile.store?.address,"Διεύθυνση");
requireText(profile.store?.visitDate,"Ημερομηνία επίσκεψης");
requireText(profile.store?.visitTime,"Ώρα επίσκεψης");
requireText(profile.store?.receiverName,"Υπεύθυνος παραλαβής");
requireText(profile.store?.rollbackOwner,"Υπεύθυνος rollback");
requireText(profile.release?.productionRevision,"Ακριβές production revision");
requireTrue(profile.release?.ciGreen,"Πράσινο CI");
requireTrue(profile.release?.backupVerified,"Επιβεβαιωμένο backup");
requireTrue(profile.release?.maintenanceWindowApproved,"Εγκεκριμένο maintenance window");

if(!Array.isArray(profile.terminals)||profile.terminals.length!==2)missing.push("Ακριβώς δύο POS terminals (POS_1 και POS_2)");
if(Array.isArray(profile.terminals))profile.terminals.forEach((terminal,index)=>{
  const prefix=`Terminal ${index+1}`;
  requireText(terminal?.terminalId,`${prefix}: Terminal ID`);
  requireText(terminal?.device,`${prefix}: πραγματική συσκευή`);
  requireText(terminal?.role,`${prefix}: ρόλος POS`);
  requireText(terminal?.scanner,`${prefix}: scanner`);
  requireText(terminal?.printer,`${prefix}: printer`);
  requireText(terminal?.rbs,`${prefix}: RBS/NON_FISCAL κατάσταση`);
  requireText(terminal?.eftpos,`${prefix}: EFTPOS κατάσταση`);
});
if(Array.isArray(profile.terminals)){
  const roles=profile.terminals.map(terminal=>terminal?.role);
  const ids=profile.terminals.map(terminal=>String(terminal?.terminalId??"").trim().toUpperCase()).filter(Boolean);
  if(roles.length!==2||!roles.includes("POS_1")||!roles.includes("POS_2"))missing.push("Διακριτοί ρόλοι POS_1 και POS_2");
  if(ids.length!==new Set(ids).size)missing.push("Μοναδικό Terminal ID ανά POS");
}

requireTrue(profile.operations?.operatorsConfirmed,"Χειριστές/PIN/κάρτες/ρόλοι");
requireTrue(profile.operations?.catalogPricesVatConfirmed,"Κατάλογος/τιμές/ΦΠΑ");
requireTrue(profile.operations?.openingStockConfirmed,"Αρχικό stock");
requireTrue(profile.operations?.testBasketApproved,"Εγκεκριμένο test basket");
requireTrue(profile.operations?.supportContactConfirmed,"Στοιχεία υποστήριξης");
requireTrue(profile.safety?.nonFiscalScopeConfirmed,"Ρητό NON_FISCAL/fiscal scope");
requireTrue(profile.safety?.openGatesRecorded,"Καταγραφή ανοικτών Gates");
requireTrue(profile.safety?.credentialsExcluded,"Επιβεβαίωση ότι δεν αποθηκεύονται μυστικά");

if(forbidden.length)missing.push(`Απαγορευμένα πεδία μυστικών: ${forbidden.join(", ")}`);
const result={status:missing.length?"NOT_READY":"READY",profile:path.resolve(filename),missing};
console.log(JSON.stringify(result,null,2));
process.exitCode=missing.length?1:0;

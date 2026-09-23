import crypto from "crypto";

export function normalizeWorkCard(value){
  return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
}

export function createWorkCardCode({companyId,storeId,employeeId,secret}){
  if(!secret)throw Object.assign(new Error("Δεν έχει ρυθμιστεί ασφαλής έκδοση καρτών."),{status:503});
  const digest=crypto.createHmac("sha256",secret).update(`${companyId}:${storeId}:${employeeId}`).digest("hex").toUpperCase();
  return `MWSWC${digest.slice(0,24)}`;
}

export function workCardHash(value){
  return crypto.createHash("sha256").update(normalizeWorkCard(value)).digest("hex");
}

export function workCardLast4(value){
  return normalizeWorkCard(value).slice(-4)||null;
}

import crypto from "crypto";

const GREEK_SCANNER_KEYS={Μ:"M",Σ:"W",Α:"A",Β:"B",Ψ:"C",Δ:"D",Ε:"E",Φ:"F"};

export function normalizeWorkCard(value){
  return [...String(value||"").trim().toUpperCase()]
    .map(char=>GREEK_SCANNER_KEYS[char]||char)
    .join("")
    .replace(/[^A-Z0-9]/g,"");
}

export function createWorkCardCode({companyId,storeId,employeeId,secret}){
  if(!secret)throw Object.assign(new Error("Δεν έχει ρυθμιστεί ασφαλής έκδοση καρτών."),{status:503});
  const digest=crypto.createHmac("sha256",secret).update(`${companyId}:${storeId}:${employeeId}`).digest("hex").toUpperCase();
  return `MW2${digest.slice(0,16)}`;
}

export function createLegacyWorkCardCode({companyId,storeId,employeeId,secret}){
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

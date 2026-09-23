import crypto from "crypto";

const GREEK_SCANNER_KEYS={
  μ:"M",Μ:"M",ς:"W","΅":"W",σ:"S",Σ:"S",
  α:"A",Α:"A",β:"B",Β:"B",ψ:"C",Ψ:"C",δ:"D",Δ:"D",ε:"E",Ε:"E",φ:"F",Φ:"F"
};

export function normalizeWorkCard(value){
  const raw=String(value||"").trim();
  const normalized=[...raw]
    .map(char=>GREEK_SCANNER_KEYS[char]||char)
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g,"");
  // Με Caps Lock το ελληνικό W και S καταλήγουν και τα δύο σε Σ.
  // Τα δύο εκδοθέντα prefixes είναι γνωστά, οπότε αποκαθίστανται χωρίς
  // να γίνεται γενική ή ασαφής μετατροπή του υπόλοιπου κωδικού.
  if(/^ΜΣ2/u.test(raw.toUpperCase()))return `MW2${normalized.slice(3)}`;
  if(/^ΜΣΣΣΨ/u.test(raw.toUpperCase()))return `MWSWC${normalized.slice(5)}`;
  return normalized;
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

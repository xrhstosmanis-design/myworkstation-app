const ROLES=new Set(["STORE","DELIVERY"]);
const CHANNEL_ROLES={
  IN_STORE:"STORE",
  DELIVERY:"DELIVERY",
  ONLINE_DELIVERY:"DELIVERY",
  ONLINE_PICKUP:"STORE",
  PHONE_ORDER:"DELIVERY"
};

export function normalizeDeviceCode(value){
  return String(value||"").trim().toUpperCase().slice(0,80);
}

export function requiredEftposRole(channel){
  const normalized=String(channel||"").trim().toUpperCase();
  const role=CHANNEL_ROLES[normalized];
  if(!role){
    const error=new Error(`Δεν υπάρχει κανόνας EFTPOS για το κανάλι ${normalized||"(κενό)"}.`);
    error.code="PAYMENT_CHANNEL_NOT_ROUTABLE";error.status=409;throw error;
  }
  return role;
}

export function resolvePaymentDeviceRoute({terminalPos,channel,fiscalDevices=[],eftposDevices=[]}={}){
  const terminal=normalizeDeviceCode(terminalPos),role=requiredEftposRole(channel);
  if(!terminal){const error=new Error("Δεν έχει επαληθευτεί το terminal της συναλλαγής.");error.code="PAYMENT_TERMINAL_REQUIRED";error.status=409;throw error}
  const fiscals=fiscalDevices.filter(row=>row.active!==false&&normalizeDeviceCode(row.terminalPos)===terminal);
  if(fiscals.length!==1){const error=new Error(fiscals.length?`Βρέθηκαν πολλαπλές ενεργές ταμειακές για το ${terminal}.`:`Δεν έχει αντιστοιχιστεί ενεργή ταμειακή στο ${terminal}.`);error.code=fiscals.length?"PAYMENT_FISCAL_AMBIGUOUS":"PAYMENT_FISCAL_NOT_CONFIGURED";error.status=409;throw error}
  const fiscalCode=normalizeDeviceCode(fiscals[0].deviceCode);
  const matches=eftposDevices.filter(row=>row.active!==false&&normalizeDeviceCode(row.fiscalDeviceCode)===fiscalCode&&String(row.role||"").toUpperCase()===role);
  if(matches.length!==1){const error=new Error(matches.length?`Βρέθηκαν πολλαπλά ενεργά EFTPOS ${role} στην ${fiscalCode}.`:`Δεν έχει αντιστοιχιστεί ενεργό EFTPOS ${role} στην ${fiscalCode}.`);error.code=matches.length?"PAYMENT_EFTPOS_AMBIGUOUS":"PAYMENT_EFTPOS_NOT_CONFIGURED";error.status=409;throw error}
  const eftposCode=normalizeDeviceCode(matches[0].deviceCode);
  if(!ROLES.has(role)||!fiscalCode||!eftposCode){const error=new Error("Το mapping πληρωμών είναι ελλιπές.");error.code="PAYMENT_DEVICE_MAPPING_INVALID";error.status=409;throw error}
  return {terminalPos:terminal,channel:String(channel).toUpperCase(),role,fiscalDeviceCode:fiscalCode,eftposDeviceCode:eftposCode,fallback:false};
}


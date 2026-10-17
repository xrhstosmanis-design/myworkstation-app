const ROLES=new Set(["STORE","DELIVERY"]);
const CHANNEL_ROLES={
  IN_STORE:"STORE",
  DELIVERY:"DELIVERY",
  SECONDARY_IMMEDIATE:"DELIVERY",
  COUNTER_DELAYED:"STORE",
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

export function resolvePaymentDeviceRoute({terminalPos,channel,fiscalDevices=[],eftposDevices=[],operationChannel=null}={}){
  const terminal=normalizeDeviceCode(terminalPos),role=requiredEftposRole(channel);
  if(!terminal){const error=new Error("Δεν έχει επαληθευτεί το terminal της συναλλαγής.");error.code="PAYMENT_TERMINAL_REQUIRED";error.status=409;throw error}
  const fiscals=fiscalDevices.filter(row=>row.active!==false&&normalizeDeviceCode(row.terminalPos)===terminal);
  if(fiscals.length!==1){const error=new Error(fiscals.length?`Βρέθηκαν πολλαπλές ενεργές ταμειακές για το ${terminal}.`:`Δεν έχει αντιστοιχιστεί ενεργή ταμειακή στο ${terminal}.`);error.code=fiscals.length?"PAYMENT_FISCAL_AMBIGUOUS":"PAYMENT_FISCAL_NOT_CONFIGURED";error.status=409;throw error}
  const fiscalCode=normalizeDeviceCode(fiscals[0].deviceCode);
  const matches=eftposDevices.filter(row=>row.active!==false&&normalizeDeviceCode(row.fiscalDeviceCode)===fiscalCode&&String(row.role||"").toUpperCase()===role);
  if(matches.length!==1){const error=new Error(matches.length?`Βρέθηκαν πολλαπλά ενεργά EFTPOS ${role} στην ${fiscalCode}.`:`Δεν έχει αντιστοιχιστεί ενεργό EFTPOS ${role} στην ${fiscalCode}.`);error.code=matches.length?"PAYMENT_EFTPOS_AMBIGUOUS":"PAYMENT_EFTPOS_NOT_CONFIGURED";error.status=409;throw error}
  if(operationChannel){
    const expected=eftposOperationChannel(matches[0]);
    if(operationChannel!==expected){const error=new Error("Οι ρυθμίσεις EFTPOS άλλαξαν. Άνοιξε ξανά την επιλογή κάρτας.");error.status=409;error.code="PAYMENT_EFTPOS_MODE_CHANGED";throw error}
  }
  const eftposCode=normalizeDeviceCode(matches[0].deviceCode);
  if(!ROLES.has(role)||!fiscalCode||!eftposCode){const error=new Error("Το mapping πληρωμών είναι ελλιπές.");error.code="PAYMENT_DEVICE_MAPPING_INVALID";error.status=409;throw error}
  return {terminalPos:terminal,channel:String(channel).toUpperCase(),role,fiscalDeviceCode:fiscalCode,eftposDeviceCode:eftposCode,fallback:false};
}


export function eftposOperationChannel(device){
  const secondary=String(device.role).toUpperCase()==="DELIVERY";
  const mode=device.transactionMode||(secondary?"DEFERRED":"IMMEDIATE");
  if(!["IMMEDIATE","DEFERRED"].includes(mode)){const error=new Error("Μη έγκυρος τρόπος συναλλαγής EFTPOS.");error.status=409;throw error}
  return secondary?(mode==="DEFERRED"?"DELIVERY_DELAYED":"SECONDARY_IMMEDIATE"):(mode==="DEFERRED"?"COUNTER_DELAYED":"COUNTER");
}
export function paymentTerminalChoices({terminalPos,fiscalDevices=[],eftposDevices=[]}){
  const fiscal=fiscalDevices.filter(row=>row.active!==false&&normalizeDeviceCode(row.terminalPos)===normalizeDeviceCode(terminalPos));
  if(fiscal.length!==1){const error=new Error("Δεν υπάρχει μοναδική ενεργή ταμειακή για το POS.");error.status=409;throw error}
  const choices=eftposDevices.filter(row=>row.active!==false&&normalizeDeviceCode(row.fiscalDeviceCode)===normalizeDeviceCode(fiscal[0].deviceCode)).map(row=>{
    const operationChannel=eftposOperationChannel(row);
    resolvePaymentDeviceRoute({terminalPos,channel:row.role==="DELIVERY"?"DELIVERY":"IN_STORE",fiscalDevices,eftposDevices});
    return {deviceCode:row.deviceCode,displayName:row.displayName,operationChannel,transactionMode:operationChannel.endsWith("DELAYED")?"DEFERRED":"IMMEDIATE"};
  });
  if(!choices.length){const error=new Error("Δεν έχει ρυθμιστεί ενεργό EFTPOS για την ταμειακή.");error.status=409;throw error}
  return {terminalPos:normalizeDeviceCode(terminalPos),fiscalDisplayName:fiscal[0].displayName||fiscal[0].deviceCode,choices};
}

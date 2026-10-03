const normalize=value=>String(value||"").trim().toUpperCase();

export function deviceRoutingFormValues(routing,terminalPos){
  const selectedTerminal=normalize(terminalPos);
  const empty={terminalPos:selectedTerminal,fiscalDeviceCode:"",fiscalDisplayName:"",storeEftposCode:"",storeEftposName:"",deliveryEftposCode:"",deliveryEftposName:"",complete:false};
  if(!selectedTerminal)return empty;

  const fiscal=(routing?.fiscalDevices||[]).find(row=>row.active!==false&&normalize(row.terminalPos)===selectedTerminal);
  if(!fiscal)return empty;

  const fiscalCode=normalize(fiscal.deviceCode);
  const eftpos=(routing?.eftposDevices||[]).filter(row=>row.active!==false&&normalize(row.fiscalDeviceCode)===fiscalCode);
  const store=eftpos.find(row=>normalize(row.role)==="STORE");
  const delivery=eftpos.find(row=>normalize(row.role)==="DELIVERY");

  return {
    terminalPos:selectedTerminal,
    fiscalDeviceCode:fiscalCode,
    fiscalDisplayName:String(fiscal.displayName||""),
    storeEftposCode:normalize(store?.deviceCode),
    storeEftposName:String(store?.displayName||""),
    deliveryEftposCode:normalize(delivery?.deviceCode),
    deliveryEftposName:String(delivery?.displayName||""),
    complete:Boolean(fiscalCode&&store?.deviceCode)
  };
}

export function buildDeviceRoutingUpdate(current,values){
  const terminalPos=normalize(values.terminalPos),fiscalDeviceCode=normalize(values.fiscalDeviceCode);
  if(!terminalPos||!fiscalDeviceCode||!String(values.fiscalDisplayName||"").trim()||!normalize(values.storeEftposCode)||!String(values.storeEftposName||"").trim())throw new Error("Συμπλήρωσε POS, ταμειακή και EFTPOS καταστήματος.");
  const deliveryCode=normalize(values.deliveryEftposCode),deliveryName=String(values.deliveryEftposName||"").trim();
  if(Boolean(deliveryCode)!==Boolean(deliveryName))throw new Error("Για δεύτερο EFTPOS Delivery συμπλήρωσε κωδικό και όνομα, ή άφησε και τα δύο κενά.");
  const previousFiscal=(current.fiscalDevices||[]).find(row=>normalize(row.terminalPos)===terminalPos);
  const fiscalDevices=[...(current.fiscalDevices||[]).filter(row=>normalize(row.terminalPos)!==terminalPos),{deviceCode:fiscalDeviceCode,displayName:String(values.fiscalDisplayName).trim(),terminalPos,active:true}];
  const retained=new Set(fiscalDevices.map(row=>normalize(row.deviceCode)));
  const eftposDevices=(current.eftposDevices||[]).filter(row=>retained.has(normalize(row.fiscalDeviceCode))&&normalize(row.fiscalDeviceCode)!==fiscalDeviceCode&&normalize(row.fiscalDeviceCode)!==normalize(previousFiscal?.deviceCode));
  eftposDevices.push({deviceCode:normalize(values.storeEftposCode),displayName:String(values.storeEftposName).trim(),fiscalDeviceCode,role:"STORE",active:true});
  if(deliveryCode)eftposDevices.push({deviceCode:deliveryCode,displayName:deliveryName,fiscalDeviceCode,role:"DELIVERY",active:true});
  return {fiscalDevices,eftposDevices};
}

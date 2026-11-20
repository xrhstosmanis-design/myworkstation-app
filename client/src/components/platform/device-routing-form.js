const activeFlag=value=>{if(value===undefined||value===true||value==="true")return true;if(value===false||value==="false")return false;throw new Error("Μη έγκυρη κατάσταση ενεργοποίησης συσκευής.");};
const normalize=value=>String(value||"").trim().toUpperCase();

export function deviceRoutingFormValues(routing,terminalPos){
  const selectedTerminal=normalize(terminalPos);
  const empty={terminalPos:selectedTerminal,fiscalDeviceCode:"",fiscalDisplayName:"",storeEftposCode:"",storeEftposName:"",deliveryEftposCode:"",deliveryEftposName:"",storeTransactionMode:"IMMEDIATE",deliveryTransactionMode:"IMMEDIATE",fiscalActive:true,storeEftposActive:true,deliveryEftposActive:true,complete:false};
  if(!selectedTerminal)return empty;

  const fiscal=(routing?.fiscalDevices||[]).find(row=>normalize(row.terminalPos)===selectedTerminal);
  if(!fiscal)return empty;

  const fiscalCode=normalize(fiscal.deviceCode);
  const eftpos=(routing?.eftposDevices||[]).filter(row=>normalize(row.fiscalDeviceCode)===fiscalCode);
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
    storeTransactionMode:store?.transactionMode||"IMMEDIATE",
    deliveryTransactionMode:delivery?(delivery.transactionMode||"DEFERRED"):"IMMEDIATE",
    fiscalActive:fiscal.active!==false,
    storeEftposActive:store?.active!==false,
    deliveryEftposActive:delivery?.active!==false,
    complete:Boolean(fiscalCode&&store?.deviceCode)
  };
}

export function buildDeviceRoutingUpdate(current,values){
  const terminalPos=normalize(values.terminalPos),fiscalDeviceCode=normalize(values.fiscalDeviceCode);
  if(!terminalPos||!fiscalDeviceCode||!String(values.fiscalDisplayName||"").trim()||!normalize(values.storeEftposCode)||!String(values.storeEftposName||"").trim())throw new Error("Συμπλήρωσε POS, ταμειακή και EFTPOS καταστήματος.");
  const deliveryCode=normalize(values.deliveryEftposCode),deliveryName=String(values.deliveryEftposName||"").trim();
  if(Boolean(deliveryCode)!==Boolean(deliveryName))throw new Error("Για δεύτερο EFTPOS συμπλήρωσε κωδικό και όνομα, ή άφησε και τα δύο κενά.");
  const previousFiscal=(current.fiscalDevices||[]).find(row=>normalize(row.terminalPos)===terminalPos);
  const fiscalDevices=[...(current.fiscalDevices||[]).filter(row=>normalize(row.terminalPos)!==terminalPos),{deviceCode:fiscalDeviceCode,displayName:String(values.fiscalDisplayName).trim(),terminalPos,active:activeFlag(values.fiscalActive)}];
  const retained=new Set(fiscalDevices.map(row=>normalize(row.deviceCode)));
  const eftposDevices=(current.eftposDevices||[]).filter(row=>retained.has(normalize(row.fiscalDeviceCode))&&normalize(row.fiscalDeviceCode)!==fiscalDeviceCode&&normalize(row.fiscalDeviceCode)!==normalize(previousFiscal?.deviceCode));
  eftposDevices.push({deviceCode:normalize(values.storeEftposCode),displayName:String(values.storeEftposName).trim(),fiscalDeviceCode,role:"STORE",transactionMode:values.storeTransactionMode||"IMMEDIATE",active:activeFlag(values.storeEftposActive)});
  if(deliveryCode)eftposDevices.push({deviceCode:deliveryCode,displayName:deliveryName,fiscalDeviceCode,role:"DELIVERY",transactionMode:values.deliveryTransactionMode||"DEFERRED",active:activeFlag(values.deliveryEftposActive)});
  return {fiscalDevices,eftposDevices};
}

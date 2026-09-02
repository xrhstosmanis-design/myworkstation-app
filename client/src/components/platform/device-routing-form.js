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
    complete:Boolean(fiscalCode&&store?.deviceCode&&delivery?.deviceCode)
  };
}

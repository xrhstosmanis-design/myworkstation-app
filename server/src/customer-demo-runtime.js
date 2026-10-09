// This namespace is reserved by server-owned preparation. There is deliberately
// no runtime activation or allowed-operation switch in this stage. A missing,
// expired, revoked or accidentally ACTIVE lifecycle cannot open this fence.
export const CUSTOMER_DEMO_PREFIX="customer-demo-";

export function isCustomerDemoIdentifier(value){
  return typeof value==="string"&&value.trim().toLowerCase().startsWith(CUSTOMER_DEMO_PREFIX);
}

export function isCustomerDemoTenant(tenant){
  return isCustomerDemoIdentifier(tenant?.companyId)||isCustomerDemoIdentifier(tenant?.storeId);
}

export function assertCustomerDemoRuntimeClosed(tenant){
  if(isCustomerDemoTenant(tenant))throw Object.assign(new Error("Το demo βρίσκεται σε προετοιμασία. Η λειτουργική πρόσβαση δεν είναι ακόμη διαθέσιμη."),{status:403,code:"CUSTOMER_DEMO_RUNTIME_LOCKED"});
}

export function assertCustomerDemoOutboundAllowed(tenant){
  if(isCustomerDemoTenant(tenant))throw Object.assign(new Error("Οι εξωτερικές υπηρεσίες και οι συσκευές δεν διατίθενται στο demo."),{status:403,code:"CUSTOMER_DEMO_OUTBOUND_BLOCKED"});
}

export function containsCustomerDemoIdentifier(root){
  const pending=[root],seen=new WeakSet();
  while(pending.length){
    const value=pending.pop();
    if(isCustomerDemoIdentifier(value))return true;
    if(!value||typeof value!=="object"||seen.has(value))continue;
    seen.add(value);
    for(const key of Object.keys(value)){
      if(isCustomerDemoIdentifier(key))return true;
      pending.push(value[key]);
    }
  }
  return false;
}

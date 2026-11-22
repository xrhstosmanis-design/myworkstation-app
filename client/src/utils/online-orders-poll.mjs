// A disabled online storefront must not generate a full polling error every seven seconds.
// Active storefronts retain the regular fast order polling interval.
export const CLOSED_STORE_RETRY_MS=60_000;

export function nextOnlineOrdersPollAt(error,now=Date.now()){
  if(error?.status!==503 || !String(error?.message||"").includes("Το Online κατάστημα είναι προσωρινά κλειστό."))return null;
  return now+CLOSED_STORE_RETRY_MS;
}

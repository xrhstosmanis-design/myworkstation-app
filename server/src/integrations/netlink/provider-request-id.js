// Provider guidance (28 Aug 2026): seconds-sized numeric identifiers, rather
// than millisecond/nanosecond timestamps. Keep IDs within positive signed32-bit
// range and allocate durably, so concurrent cards never share a second-based ID.
export const NETLINK_PROVIDER_SEQUENCE_SQL='CREATE SEQUENCE IF NOT EXISTS "NetlinkPaidProviderRequestSeq" AS INTEGER MINVALUE 1 MAXVALUE 2147483647 START WITH 1790000000 NO CYCLE';
export function assertNetlinkProviderRequestId(value){
 const text=String(value||'');
 if(!/^[1-9][0-9]{0,9}$/.test(text)||Number(text)>2147483647)throw Object.assign(new Error('Η επιλογή της κάρτας χρησιμοποιεί παλιό κωδικό αιτήματος. Μην πληρώσεις ξανά ήδη πληρωμένη κάρτα.'),{status:409,code:'NETLINK_PROVIDER_REQUEST_ID_INVALID'});
 return text;
}
export async function nextNetlinkProviderRequestId(db){
 const rows=await db.$queryRaw`SELECT nextval('"NetlinkPaidProviderRequestSeq"')::text AS "requestId"`;
 return assertNetlinkProviderRequestId(rows[0]?.requestId);
}

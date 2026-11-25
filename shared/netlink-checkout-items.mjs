export function netlinkItemMarker(row){
 const value=String(row?.overrideReason||row?.priceReason||'').match(/^NETLINK_(CARD|FEE):([a-f0-9-]{36})$/i);
 return value?{role:value[1].toUpperCase(),requestId:value[2]}:null;
}
export function netlinkIntentIdsFromItems(items){return [...new Set((items||[]).map(netlinkItemMarker).filter(Boolean).map(x=>x.requestId))]}
export function netlinkAuditDetails(items){const ids=netlinkIntentIdsFromItems(items);return ids.length?{netlinkIntents:ids}:{}}

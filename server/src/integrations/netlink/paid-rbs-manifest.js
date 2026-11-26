import {createHash} from 'node:crypto';
import {netlinkAuditDetails} from '../../../../shared/netlink-checkout-items.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
export const rbsNetlinkManifestHash=items=>createHash('sha256').update(JSON.stringify(canonical(items))).digest('hex');
export function rbsNetlinkAuditDetails(items){
 const details=netlinkAuditDetails(items);
 return details.netlinkIntents?{...details,netlinkManifestHash:rbsNetlinkManifestHash(items)}:details;
}

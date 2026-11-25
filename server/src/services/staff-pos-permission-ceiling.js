import {staffDelegatableReadKeys} from "../../../shared/backoffice-staff.mjs";
import {POS_MENU_PERMISSIONS,POS_PERMISSIONS} from "../../../shared/pos-operator-permissions.mjs";

// Keep policy and its grant in the same reviewed backup field. These private
// entries are stripped before evaluating or exposing executable capabilities.
const posMarker="mws:pos-permission-ceiling:v1";
const backofficeMarker="mws:backoffice-read-ceiling:v1";
export const posPermissionKeys=[...POS_PERMISSIONS,...POS_MENU_PERMISSIONS].map(([key])=>key);
const validCeiling=(value,allowed)=>Array.isArray(value)&&value.every(key=>allowed.includes(key))&&new Set(value).size===value.length;
export const validPosPermissionCeiling=value=>validCeiling(value,posPermissionKeys);
export const validBackofficeReadDelegationCeiling=value=>validCeiling(value,staffDelegatableReadKeys);

function decodePolicy(stored,marker,valid,legacy){
  const prefix=marker+":",capabilities=[],keys=[];
  let markers=0;
  for(const entry of stored){
    if(entry===marker)markers++;
    else if(typeof entry==="string"&&entry.startsWith(prefix))keys.push(entry.slice(prefix.length));
    else capabilities.push(entry);
  }
  const ceiling=!markers&&!keys.length?legacy:markers===1&&valid(keys)?keys:[];
  return {capabilities,ceiling};
}

export function decodeStoredStaffCapabilities(stored){
  if(!Array.isArray(stored))return {capabilities:stored,posPermissionCeiling:[],backofficeReadDelegationCeiling:[]};
  const pos=decodePolicy(stored,posMarker,validPosPermissionCeiling,null);
  const backoffice=decodePolicy(pos.capabilities,backofficeMarker,validBackofficeReadDelegationCeiling,[]);
  return {capabilities:backoffice.capabilities,posPermissionCeiling:pos.ceiling,backofficeReadDelegationCeiling:backoffice.ceiling};
}

export function encodeStoredStaffCapabilities(capabilities,posPermissionCeiling,backofficeReadDelegationCeiling=[]){
  if(posPermissionCeiling!==null&&!validPosPermissionCeiling(posPermissionCeiling))throw new TypeError("Invalid POS permission ceiling");
  if(!validBackofficeReadDelegationCeiling(backofficeReadDelegationCeiling))throw new TypeError("Invalid BackOffice read ceiling");
  return [
    ...capabilities,
    ...(posPermissionCeiling===null?[]:[posMarker,...posPermissionKeys.filter(key=>posPermissionCeiling.includes(key)).map(key=>posMarker+":"+key)]),
    ...(backofficeReadDelegationCeiling.length?[backofficeMarker,...staffDelegatableReadKeys.filter(key=>backofficeReadDelegationCeiling.includes(key)).map(key=>backofficeMarker+":"+key)]:[])
  ];
}

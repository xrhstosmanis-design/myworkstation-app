import {POS_MENU_PERMISSIONS,POS_PERMISSIONS} from "../../../shared/pos-operator-permissions.mjs";

// Keep policy and its grant in the same reviewed backup field. These private
// entries are stripped before evaluating or exposing executable capabilities.
const marker="mws:pos-permission-ceiling:v1";
const prefix=marker+":";
export const posPermissionKeys=[...POS_PERMISSIONS,...POS_MENU_PERMISSIONS].map(([key])=>key);
export const validPosPermissionCeiling=value=>Array.isArray(value)&&
  value.every(key=>posPermissionKeys.includes(key))&&new Set(value).size===value.length;

export function decodeStoredStaffCapabilities(stored){
  if(!Array.isArray(stored))return {capabilities:stored,posPermissionCeiling:[]};
  const capabilities=[],keys=[];
  let markers=0;
  for(const capability of stored){
    if(capability===marker)markers++;
    else if(typeof capability==="string"&&capability.startsWith(prefix))keys.push(capability.slice(prefix.length));
    else capabilities.push(capability);
  }
  if(!markers&&!keys.length)return {capabilities,posPermissionCeiling:null};
  return {capabilities,posPermissionCeiling:markers===1&&validPosPermissionCeiling(keys)?keys:[]};
}

export function encodeStoredStaffCapabilities(capabilities,posPermissionCeiling){
  if(posPermissionCeiling===null)return capabilities;
  if(!validPosPermissionCeiling(posPermissionCeiling))throw new TypeError("Invalid POS permission ceiling");
  return [...capabilities,marker,...posPermissionKeys.filter(key=>posPermissionCeiling.includes(key)).map(key=>prefix+key)];
}

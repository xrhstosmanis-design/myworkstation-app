// The delegated workspace never inherits company-wide manager/owner privileges.
export const staffProfiles=Object.freeze({
  MANAGER:{label:'Υπεύθυνος',capabilities:['inventory.read','inventory.count','cash.read']},
  STOCKTAKER:{label:'Απογραφέας',capabilities:['inventory.read','inventory.count']},
  AUDITOR:{label:'Ελεγκτής',capabilities:['cash.read']}
});
export const staffCapabilities=Object.freeze(['inventory.read','inventory.count','cash.read']);
export function staffRequestCapability(method,path){
  if(method==='GET'&&path==='/api/backoffice-staff/me')return 'SESSION';
  if(method==='POST'&&['/api/auth/logout','/api/auth/renew','/api/auth/change-password'].includes(path))return 'SESSION';
  if(method==='GET'&&/^\/api\/lifecycle\/stores\/[^/]+$/.test(path))return 'LIFECYCLE';
  if(method==='GET'&&/^\/api\/backoffice-staff\/cash\/stores\/[^/]+$/.test(path))return 'cash.read';
  if(method==='GET'&&/^\/api\/backoffice-staff\/inventory\/stores\/[^/]+\/stocktakes(?:\/[^/]+)?$/.test(path))return 'inventory.read';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count$/.test(path))return 'inventory.count';
  return null;
}

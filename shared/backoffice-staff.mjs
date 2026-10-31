// Profiles are starting suggestions, never authorization ceilings or an
// implicit grant. Only the explicit persisted store capabilities authorize.
export const staffProfiles=Object.freeze({
  MANAGER:{label:'Υπεύθυνος',capabilities:['inventory.read','inventory.count','cash.read']},
  STOCKTAKER:{label:'Απογραφέας',capabilities:['inventory.read','inventory.count']},
  AUDITOR:{label:'Ελεγκτής',capabilities:['cash.read']}
});
export const staffCapabilities=Object.freeze(['inventory.read','inventory.count','cash.read']);
export const staffPermissionSections=Object.freeze([
  {key:'inventory',label:'Απογραφή',actions:[
    {key:'inventory.read',label:'Προβολή',description:'Βλέπει τις ανοιχτές απογραφές του καταστήματος.'},
    {key:'inventory.count',label:'Καταμέτρηση',description:'Καταχωρίζει ποσότητες σε ανοιχτή απογραφή.',requires:['inventory.read']}
  ]},
  {key:'cash',label:'Έλεγχος ταμείων',actions:[
    {key:'cash.read',label:'Προβολή αναφοράς',description:'Βλέπει την αναφορά ελέγχου του καταστήματος.'}
  ]}
]);
export function validStaffCapabilities(capabilities){
  return Array.isArray(capabilities)&&new Set(capabilities).size===capabilities.length&&
    capabilities.every(c=>staffCapabilities.includes(c))&&
    (!capabilities.includes('inventory.count')||capabilities.includes('inventory.read'));
}
export function staffRequestCapability(method,path){
  if(method==='GET'&&path==='/api/backoffice-staff/me')return 'SESSION';
  if(method==='POST'&&['/api/auth/logout','/api/auth/renew','/api/auth/change-password'].includes(path))return 'SESSION';
  if(method==='GET'&&/^\/api\/lifecycle\/stores\/[^/]+$/.test(path))return 'LIFECYCLE';
  if(method==='GET'&&/^\/api\/backoffice-staff\/cash\/stores\/[^/]+$/.test(path))return 'cash.read';
  if(method==='GET'&&/^\/api\/backoffice-staff\/inventory\/stores\/[^/]+\/stocktakes(?:\/[^/]+)?$/.test(path))return 'inventory.read';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count$/.test(path))return 'inventory.count';
  return null;
}

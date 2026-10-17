import {readRbsInstallationSettings} from './rbs-installation-settings.js';

function stop(message){throw Object.assign(new Error(message),{status:409});}
export function installationBinding(settings){
  return Object.fromEntries(['terminalPos','fiscalDeviceCode','storeEftposCode','deliveryEftposCode','cashCode','cardCode','deliveryCode','workFolder'].map(key=>[key,settings[key]||null]));
}
export async function activeRbsTerminals(db,{companyId,storeId}){
  const tables=await db.$queryRaw`SELECT to_regclass('public."StoreFiscalDevice"')::text AS fiscal,to_regclass('public."StoreInstallationTerminal"')::text AS terminals`;
  if(!tables[0]?.fiscal||!tables[0]?.terminals)return [];
  return db.$queryRaw`SELECT f."terminalPos",f."deviceCode" AS "fiscalDeviceCode" FROM "StoreFiscalDevice" f JOIN "StoreInstallationTerminal" t ON t."companyId"=f."companyId" AND t."storeId"=f."storeId" AND t."terminalPos"=f."terminalPos" AND t."active"=TRUE WHERE f."companyId"=${companyId} AND f."storeId"=${storeId} AND f."active"=TRUE ORDER BY f."terminalPos"`;
}
// The binding comes from the signed device token, never heartbeat metadata or a poll body.
export async function resolveRbsDeviceTerminal(db,device,binding){
  const terminals=await activeRbsTerminals(db,device);
  if(binding){
    if(!terminals.some(t=>t.terminalPos===binding.terminalPos&&t.fiscalDeviceCode===binding.fiscalDeviceCode))stop('Η αντιστοίχιση της ταμειακής άλλαξε. Χρειάζεται νέα επιβεβαίωση και ζεύξη.');
    const settings=await readRbsInstallationSettings(db,{...device,terminalPos:binding.terminalPos});
    if(!settings||JSON.stringify(installationBinding(settings))!==JSON.stringify(installationBinding(binding)))stop('Οι ρυθμίσεις CAPDriver άλλαξαν. Κατέβασε νέο πακέτο και έλεγξε τη σύνδεση.');
    return {...binding,legacy:false};
  }
  // Historical single-register installations continue on their one explicit route.
  // An old unbound writer must never choose between two cash registers.
  if(terminals.length!==1)stop('Ο παλιός Writer δεν έχει μοναδική αντιστοίχιση ταμειακής. Χρειάζεται ζεύξη για το συγκεκριμένο POS.');
  return {...terminals[0],legacy:true};
}
export async function bindRbsPairing(db,pair,terminalPos){
  const settings=await readRbsInstallationSettings(db,{companyId:pair.companyId,storeId:pair.storeId,terminalPos});
  if(!settings)stop('Δεν υπάρχουν επιβεβαιωμένες ρυθμίσεις CAPDriver για αυτό το POS.');
  return installationBinding(settings);
}
export async function claimTerminalRbsRequest(tx,device,terminal){
  const rows=await tx.$queryRaw`SELECT "id" FROM "RbsCapDriverV1Request" WHERE "companyId"=${device.companyId} AND "storeId"=${device.storeId} AND "terminalPos"=${terminal.terminalPos} AND "status"='PREPARED' ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
  if(!rows[0])return null;
  const claimed=await tx.$queryRaw`UPDATE "RbsCapDriverV1Request" SET "status"='CLAIMED',"claimedByDeviceId"=${device.id},"claimedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${rows[0].id} AND "companyId"=${device.companyId} AND "storeId"=${device.storeId} AND "terminalPos"=${terminal.terminalPos} AND "status"='PREPARED' RETURNING "id","terminalPos","paymentMethod","total","commandText","commandHash","claimedAt"`;
  return claimed[0]||null;
}

import {readNetlinkRbsContext} from './paid-rbs-evidence.js';
import {createFtextInstallationService} from '../../services/ftext-installation.js';
import {companyModuleState} from '../../middleware/module-access.js';
import {netlinkPaidError} from './paid-issuance-contract.js';

// Resolve the same authenticated terminal used by the native POS checkout.
export async function netlinkCheckoutTerminal(db,scope,req){
 const testTerminal=(process.env.CI==='true'||process.env.NODE_ENV==='test'||process.env.MWS_E2E_TERMINAL_OVERRIDE==='1')?String(req.query?.mwsTerminal||req.headers?.['x-mws-terminal-pos']||req.body?.terminalPos||'').trim():'';
 if(testTerminal)return testTerminal.toUpperCase().slice(0,120);
 if(req.user?.tokenType==='STORE_OPERATOR'){
  const live=String(req.user.terminalPos||'').trim();if(live)return live.toUpperCase().slice(0,120);
  const rows=await db.$queryRaw`SELECT COALESCE(NULLIF(TRIM(p."terminalPos"),''),'MAIN') AS "terminalPos" FROM "StoreOperatorProfile" p WHERE p."companyId"=${scope.companyId} AND p."storeId"=${scope.storeId} AND p."employeeId"=${req.user.employeeId} LIMIT 1`;
  return String(rows[0]?.terminalPos||rows[0]?.terminalpos||'MAIN').trim().toUpperCase().slice(0,120)||'MAIN';
 }
 return String(req.headers?.['x-mws-terminal-pos']||'MAIN').trim().toUpperCase().slice(0,120)||'MAIN';
}

export async function prepareNetlinkPaidCheckout(db,scope,checkoutId,req){
 const terminalPos=await netlinkCheckoutTerminal(db,scope,req);
 const service=createFtextInstallationService({db,moduleState:(id,tx)=>companyModuleState(id,{db:tx}),secret:()=>process.env.JWT_SECRET});
 // Choose the native route before any paid intent; ftext never falls back.
 try{
  const devices=(await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'CloudDevice'))::text AS name`)[0]?.name;
  const ftext=devices&&(await db.$queryRaw`SELECT 1 FROM "CloudDevice" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "deviceKey"=${'ftext:'+terminalPos} AND "platform"='WINDOWS_FTEXT_V1' LIMIT 1`).length;
  if(ftext){await db.$transaction(tx=>service.cashContext(tx,{...scope,terminalPos}));return {kind:'FTEXT_RECEIPT',terminalPos};}
  return await db.$transaction(async tx=>{const context=await readNetlinkRbsContext(tx,{...scope,terminalPos},{requireOnline:true});return {kind:'RBS_NATIVE_COMMIT',terminalPos,lifecycleGeneration:context.lifecycleGeneration};});
 }catch{
  throw netlinkPaidError('NETLINK_RECEIPT_CAPABILITY_REQUIRED','Η έκδοση κάρτας απαιτεί έτοιμη σύνδεση ταμειακής για αυτό το POS. Δεν έχει γίνει χρέωση ή έκδοση κάρτας.');
 }
}

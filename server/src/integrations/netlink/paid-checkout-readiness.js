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
 // A request UUID or an operator click alone is not a fiscal receipt. Require
 // a native integration that can return verifiable receipt evidence, up front.
 try{
  await db.$transaction(tx=>service.cashContext(tx,{...scope,terminalPos}));
 }catch{
  throw netlinkPaidError('NETLINK_RECEIPT_CAPABILITY_REQUIRED','Η έκδοση κάρτας απαιτεί έτοιμη σύνδεση ταμειακής που επιβεβαιώνει την απόδειξη. Δεν έχει γίνει χρέωση ή έκδοση κάρτας.');
 }
}

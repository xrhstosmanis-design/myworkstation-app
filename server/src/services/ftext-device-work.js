import {ftextCashTableExists} from './ftext-cash-schema.js';
import {claimFtextCashRequest} from './ftext-cash-requests.js';
import {claimFtextVoid} from './ftext-void.js';
import {pollFtextLateReceipt} from './ftext-late-device-receipt.js';
import {pollFtextErrorEvidence} from './ftext-error-evidence.js';
import {pollFtextHandoffOffer} from './ftext-handoff.js';

// Runs inside the existing authenticated device transaction and lock. It does
// not renew dispatches, relax readiness or introduce any new fiscal operation.
export async function pollFtextDeviceWork(tx,device,settings,{recovering=false,handoffVersion}={}){
 const empty={request:null,lateReceipt:null,errorEvidence:null};
 if(recovering||settings.cashEnabled!==true||!await ftextCashTableExists(tx))return empty;
 const request=await claimFtextVoid(tx,device,settings)||(handoffVersion===1?await pollFtextHandoffOffer(tx,device,settings):null)||await claimFtextCashRequest(tx,device,settings,{handoffVersion});
 if(request)return {...empty,request};
 return {...empty,lateReceipt:await pollFtextLateReceipt(tx,device,settings),errorEvidence:await pollFtextErrorEvidence(tx,device,settings)};
}

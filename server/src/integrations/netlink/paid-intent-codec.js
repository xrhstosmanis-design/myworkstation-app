import {decryptStoreIntegrationValue} from '../store-integration-crypto.js';
import {moneyCents,netlinkPaidError} from './paid-issuance-contract.js';
const fail=(code,message)=>{throw netlinkPaidError(code,message)};
const binding=(scope,id)=>({companyId:scope.companyId,storeId:scope.storeId,requestId:id});
export function decodePaidIntent(row,scope){
 if(!row?.issuanceIntentEnc)return null;
 const value=decryptStoreIntegrationValue(row.issuanceIntentEnc);
 if(value.version!==1||Object.entries(binding(scope,row.requestId)).some(([k,v])=>value[k]!==v)||value.checkoutId!==row.checkoutId||!value.checkoutId||value.productId!==row.productId||moneyCents(value.amount)!==moneyCents(row.amount)||moneyCents(row.serviceFeeAmount)!==50||moneyCents(row.customerTotal)!==moneyCents(row.amount)+50)fail('NETLINK_INTENT_SCOPE','Η αποθηκευμένη κάρτα χρειάζεται έλεγχο.');
 return {...value,...row,saleProductId:value.saleProductId,serviceFeeProductId:value.serviceFeeProductId,title:value.title,providerRequestId:value.providerRequestId,expiresAt:value.expiresAt};
}

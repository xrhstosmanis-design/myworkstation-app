export const pendingPreparationLines=cart=>cart.filter(row=>row.preparation&&!row.productionSent&&!row.exchangeReturn);
export function prepareDispatch(storage,storeId,body,uuid){
 const key=`mws:production-pending:${storeId}`,encoded=JSON.stringify(body),saved=storage.getItem(key);
 if(saved){const pending=JSON.parse(saved);if(pending.body!==encoded)throw Error('Υπάρχει αποστολή με αβέβαιο αποτέλεσμα. Επανέφερε τα ίδια είδη και επιλογές για έλεγχο, χωρίς νέα αποστολή.');return{key,request:{...body,requestId:pending.requestId}}}
 const requestId=uuid();storage.setItem(key,JSON.stringify({body:encoded,requestId}));
 return{key,request:{...body,requestId}};
}

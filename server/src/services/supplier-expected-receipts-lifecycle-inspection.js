import {collectExpectedReceiptCatalog,validateExpectedReceiptCompatibility} from './supplier-expected-receipts-compatibility.js';
export async function inspectExpectedReceiptInstallationCatalogue(tx,schema){
 const catalog=await collectExpectedReceiptCatalog(tx,{schema});
 const result=validateExpectedReceiptCompatibility({catalog});
 if(result.schemaStatus!=='MATCH')throw Object.assign(new Error('No14 installed catalogue differs from the reviewed definition.'),{status:409,code:'EXPECTED_RECEIPT_CATALOGUE_CHANGED',issues:result.issues});
 return {catalog,evidence:{format:'MWS_EXPECTED_RECEIPTS_CATALOGUE_V1',definitionHash:result.definitionHash,catalog,executionEnabled:false}};
}

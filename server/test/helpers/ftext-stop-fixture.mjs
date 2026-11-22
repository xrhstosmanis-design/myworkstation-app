import {ftextSettingsHash} from '../../src/services/ftext-installation.js';
import {newFtextHandoff} from '../../src/services/ftext-handoff.js';
export function stopFixture({method='CASH',format='OPERATOR_CONFIRMATION',phase='PREPARED',stopVersion=1}={}){
 const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'8c72e9c8-b4aa-46de-81fb-f422f9319177',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:format==='OPERATOR_CONFIRMATION'?1:6,resultFormat:format,confirmed:true}};
 const scope=Object.fromEntries(['companyId','storeId','terminalPos','fiscalDeviceCode'].map(k=>[k,settings[k]])),settingsHash=ftextSettingsHash(settings);
 const device={id:'device-a',tokenVersion:2,status:'ACTIVE',lastSeenAt:new Date(),metadata:{ftextReadinessRequired:true,ftextLastStatus:{ok:true,code:0,serialNumber:settings.serialNumber,fiscalExecution:false,checkedAt:new Date().toISOString(),receivedAt:new Date().toISOString()}}};
 const row={id:'370a0232-aeb7-4320-9919-d96c3f9f52d5',companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos,fiscalDeviceCode:settings.fiscalDeviceCode,serialNumber:settings.serialNumber,status:'PREPARED',settingsHash,lifecycleGeneration:'0',claimedByDeviceId:null,claimedTokenVersion:null,dispatchedAt:null,result:null,resultHash:null,saleId:null,total:'1.25',checkoutJson:{actorId:'cashier',paymentMethod:method,ftextCardMode:method==='CARD'?format:null,ftextCardDecision:null},plan:{schemaVersion:'MWS_FTEXT_SALE_PLAN_V1',configurationId:settings.configurationId,settingsHash,planHash:'a'.repeat(64),scope,total:'1.25',payment:{method,code:method==='CASH'?1:2,amount:'1.25'},lines:[{description:'SYNTHETIC',quantity:'1.000',unitPrice:'1.25',lineTotal:'1.25',discount:'0.00',department:'4',vatRate:'13.00',vatCode:'2'}]}};
 if(['OFFERED','ACCEPTED'].includes(phase)){
  row.checkoutJson.ftextHandoff=newFtextHandoff(row,device,settings,{stopVersion});row.status='DISPATCHED';row.claimedByDeviceId=device.id;row.claimedTokenVersion=device.tokenVersion;row.dispatchedAt=new Date().toISOString();
  if(phase==='ACCEPTED'){row.checkoutJson.ftextHandoff.state='ACCEPTED';row.checkoutJson.ftextHandoff.acceptedAt=new Date().toISOString();}
 }
 let writes=0;const tx={$queryRaw:async(parts,...args)=>{
  const sql=parts.join('?');
  if(sql.startsWith('UPDATE')){const json=args.find(v=>typeof v==='string'&&v.startsWith('{'));if(json)row.checkoutJson=JSON.parse(json);writes++;return [structuredClone(row)];}
  if(sql.includes('WHERE "id"='))return args[0]===row.id&&args[1]===scope.companyId&&args[2]===scope.storeId&&args[3]===scope.terminalPos?[structuredClone(row)]:[];
  throw Error('Unexpected test SQL: '+sql);
 }};
 return {settings,scope,device,row,tx,get writes(){return writes},context:async()=>({settings,device}),handoffInput:()=>({requestId:row.id,settingsHash:row.settingsHash,nonce:row.checkoutJson.ftextHandoff.nonce,commandHash:row.checkoutJson.ftextHandoff.commandHash,readyForExecution:true})};
}

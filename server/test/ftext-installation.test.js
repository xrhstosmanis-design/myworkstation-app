import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {ftextSettingsInput,ftextSettingsHash,rejectReservedFtextPairing,validateFtextReport,createFtextInstallationService} from '../src/services/ftext-installation.js';
import {buildFtextInstallationPackage} from '../src/services/ftext-installation-package.js';
const form={terminalPos:'POS-01',serialNumber:'TEST12345',workFolder:'C:\\FText',confirmed:true};
const config={companyId:'test-company',storeId:'test-store',terminalPos:form.terminalPos,fiscalDeviceCode:'TEST-FISCAL',serialNumber:form.serialNumber,workFolder:form.workFolder,protocol:'SOLIDUS(II)T',configurationId:crypto.randomUUID(),lifecycleGeneration:'0'};
test('ftext accepts explicit Windows settings and rejects path/control/protocol injection',()=>{
 assert.deepEqual(ftextSettingsInput.parse(form),form);
 for(const patch of [{confirmed:false},{workFolder:'C:\\'},{workFolder:'C:\\FText\\..\\other'},{workFolder:'\\\\server\\share'},{workFolder:'relative'},{workFolder:'C:\\x|STATUS'},{workFolder:'C:\\x\nS'},{workFolder:'C:\\😀'},{workFolder:'C:\\�'},{workFolder:'C:\\folder..name'},{serialNumber:'a'.repeat(81)},{serialNumber:'a|S'},{terminalPos:'wrong pos'},{unexpected:'value'}])assert.equal(ftextSettingsInput.safeParse({...form,...patch}).success,false,JSON.stringify(patch));
});
test('signed settings hash is canonical, scoped and excludes unsupported arbitrary keys',()=>{
 assert.equal(ftextSettingsHash(config),ftextSettingsHash(Object.fromEntries(Object.entries(config).reverse())));
 for(const patch of [{storeId:'other-store'},{terminalPos:'POS-02'},{serialNumber:'OTHER123'},{workFolder:'C:\\Other'},{configurationId:crypto.randomUUID()},{lifecycleGeneration:'1'}])assert.notEqual(ftextSettingsHash(config),ftextSettingsHash({...config,...patch}));
 assert.throws(()=>ftextSettingsHash({...config,token:'not-supported'}));
});
test('generic pairing cannot take over ftext codes, namespace, platform or existing device',()=>{
 for(const body of [{code:'FT-12345678'},{code:' f t -12345678'},{deviceKey:'FTEXT:POS-01'},{platform:'WINDOWS_FTEXT_V1'}])assert.throws(()=>rejectReservedFtextPairing(body));
 assert.throws(()=>rejectReservedFtextPairing({code:'1234-5678'},{platform:'WINDOWS_FTEXT_V1'}));
 assert.doesNotThrow(()=>rejectReservedFtextPairing({code:'1234-5678',deviceKey:'existing-rbs',platform:'WINDOWS_RBS_CAPDRIVER_V1'}));
});
test('status uploads require coherent fresh nonfiscal evidence and the configured serial',()=>{
 const now=new Date(),body={requestId:'a'.repeat(32),checkedAt:now.toISOString(),ok:true,code:0,serialNumber:config.serialNumber,deviceTime:'device clock',fiscalExecution:false};
 assert.deepEqual(validateFtextReport(body,config,now),body);
 for(const patch of [{serialNumber:'FOREIGN'},{ok:false},{code:101},{fiscalExecution:true},{checkedAt:new Date(now.getTime()-600000).toISOString()},{checkedAt:new Date(now.getTime()+120000).toISOString()},{requestId:'../../file'},{cardNumber:'private'},{ok:true,deviceTime:undefined}])assert.throws(()=>validateFtextReport({...body,...patch},config,now),JSON.stringify(patch));
 assert.equal(validateFtextReport({...body,ok:false,code:101,serialNumber:undefined,deviceTime:undefined,description:'No response'},config,now).ok,false);
});
test('ftext package round-trips names as data, pins selected scope and contains no credential',async()=>{
 const store={id:config.storeId,companyId:config.companyId,name:"Greek ' $(bad) Κατάστημα"};
 const p=await buildFtextInstallationPackage({store,settings:config,apiBase:'https://unit.test',revision:'source-test'});
 const blocks=[...p.script.matchAll(/FromBase64String\('([^']+)'\)/g)].map(m=>JSON.parse(Buffer.from(m[1],'base64').toString('utf8')));
 assert.equal(blocks[0].storeName,store.name);assert.equal(blocks[0].settingsHash,ftextSettingsHash(config));assert.equal(blocks[0].terminalPos,'POS-01');assert.equal(blocks[0].apiBase,'https://unit.test');assert.equal(p.containsCredentials,false);assert.equal(p.startsConnectorAutomatically,false);assert.equal(p.fiscalCheckoutEnabled,false);assert.ok(!p.script.includes(store.name));
 assert.deepEqual(Object.keys(blocks[1]).sort(),['Ftext.psm1','Cloud-Tools.psm1','Pair.ps1','Cloud-Test.ps1','Cloud-Connector.ps1','Setup.ps1','Cash.psm1'].sort());
 const status=Buffer.from(blocks[1]['Ftext.psm1'],'base64').toString('utf8');assert.match(status,/STATUS/);assert.doesNotMatch(status,/PAY\||PRG_SET|VOID_DOCUMENT/);
 for(const apiBase of ['http://unit.test','https://user:pass@unit.test','https://unit.test/path','https://unit.test/?query=1'])await assert.rejects(buildFtextInstallationPackage({store,settings:config,apiBase}));
 await assert.rejects(buildFtextInstallationPackage({store:{...store,id:'foreign'},settings:config,apiBase:'https://unit.test'}));
});
test('wrong-purpose or absent credentials are refused before any database action',async()=>{
 const service=createFtextInstallationService({db:{$transaction:()=>assert.fail('Unauthenticated request touched DB')},secret:()=> 'a'.repeat(32),moduleState:()=>assert.fail('no module read')});
 for(const token of ['', 'not.a.token',jwt.sign({tokenType:'CLOUD_DEVICE',deviceId:'foreign'},'a'.repeat(32)),jwt.sign({tokenType:'FTEXT_DEVICE',deviceId:'foreign'},'a'.repeat(32)+':FTEXT_DEVICE',{issuer:'wrong-issuer',audience:'ftext-device-v1'})])await assert.rejects(service.ping(token),e=>e.status===401);
});

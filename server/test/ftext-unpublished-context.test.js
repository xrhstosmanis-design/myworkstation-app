import test from 'node:test';
import assert from 'node:assert/strict';
import {createFtextInstallationService} from '../src/services/ftext-installation.js';
import {stopFixture} from './helpers/ftext-stop-fixture.mjs';
test('unpublished context may read an offline/failed-STATUS installation but preserves every current identity/license/lifecycle gate',async()=>{
 const f=stopFixture(),original={...f.device,platform:'WINDOWS_FTEXT_V1',lastSeenAt:null,metadata:{...f.device.metadata,ftextSettings:f.settings,ftextLastStatus:{ok:false,code:48,serialNumber:f.settings.serialNumber}}};
 let device=structuredClone(original),enabled=true,active=true,route=f.settings.fiscalDeviceCode,lifecycle={companyId:f.scope.companyId,generation:'0',maintenance:false,retired:false};
 const tx={store:{findFirst:async({where})=>active&&where.id===f.scope.storeId&&where.companyId===f.scope.companyId?{id:where.id,companyId:where.companyId}:null},$queryRawUnsafe:async(sql,...args)=>{
  if(sql.includes('FROM "CloudDevice"'))return args[0]===f.scope.companyId&&args[1]===f.scope.storeId&&args[2]==='ftext:'+f.scope.terminalPos?[device]:[];
  if(sql.includes('current_schema()'))return [{schema:'fixture',fence:'fixture.StoreLifecycleFence'}];
  if(sql.includes('FROM "fixture"."StoreLifecycleFence"'))return [lifecycle];
  if(sql.includes('set_config'))return [{}];throw Error('Unexpected context SQL: '+sql);
 },$queryRaw:async(parts,...args)=>{assert.match(parts.join('?'),/StoreInstallationTerminal/);return args[0]===f.scope.companyId&&args[1]===f.scope.storeId&&args[2]===f.scope.terminalPos?[{deviceCode:route}]:[];},$executeRaw:()=>assert.fail('Unpublished context wrote business data')};
 const service=createFtextInstallationService({db:tx,moduleState:async()=>({licenseAllowed:enabled,activeModules:['CONNECTOR_FTEXT']}),secret:()=> 'not-used-in-context-test'});
 const current=await service.unpublishedContext(tx,f.scope);assert.equal(current.device.lastSeenAt,null);assert.equal(current.device.metadata.ftextLastStatus.ok,false);assert.deepEqual(current.settings,f.settings);
 await assert.rejects(service.cashContext(tx,f.scope));await assert.rejects(service.cashContext(tx,f.scope,{requireOnline:false}));await assert.rejects(service.cashContext(tx,f.scope,{requireOnline:false,requireStatus:false}),'Normal fiscal context cannot opt out of physical status through the new context');
 for(const mutate of [()=>{enabled=false},()=>{active=false},()=>{device.status='REVOKED'},()=>{device.platform='FOREIGN'},()=>{device.metadata.ftextSettings.cashEnabled=false},()=>{device.metadata.ftextSettings.storeId='foreign'},()=>{route='FOREIGN'},()=>{lifecycle.generation='1'},()=>{lifecycle.maintenance=true},()=>{lifecycle.retired=true}]){
  device=structuredClone(original);enabled=true;active=true;route=f.settings.fiscalDeviceCode;lifecycle={companyId:f.scope.companyId,generation:'0',maintenance:false,retired:false};mutate();await assert.rejects(service.unpublishedContext(tx,f.scope));
 }
});

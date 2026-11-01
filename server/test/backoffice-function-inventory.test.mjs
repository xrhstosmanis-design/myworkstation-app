import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSource} from '../../tools/backoffice-permissions/inventory.mjs';
import {backofficeFunctionCatalogue,backofficePermissionKey} from '../../shared/backoffice-functions.mjs';
import {staffCapabilities,staffProfiles,validStaffCapabilities,staffRequestCapability} from '../../shared/backoffice-staff.mjs';

test('function review catalogue distinguishes company authority and cannot automatically grant pending actions',()=>{
 const ids=backofficeFunctionCatalogue.map(f=>f.key),all=backofficeFunctionCatalogue.flatMap(f=>f.actions.map(a=>backofficePermissionKey(f.key,a)));
 assert.equal(new Set(ids).size,ids.length);assert.equal(new Set(all).size,all.length);
 assert.ok(backofficeFunctionCatalogue.every(f=>['STORE','COMPANY'].includes(f.scope)&&f.actions.length&&Object.isFrozen(f.actions)));
 for(const existing of staffCapabilities)assert.ok(all.includes(existing),`Existing action ${existing} must not disappear`);
 for(const f of backofficeFunctionCatalogue.filter(f=>f.scope==='COMPANY'))for(const action of f.actions)assert.equal(validStaffCapabilities([`${f.key}.${action}`]),false,'a store grant cannot become company authority from catalogue discovery');
 assert.deepEqual(staffProfiles.STOCKTAKER.capabilities,['inventory.read','inventory.count']);
 assert.equal(staffRequestCapability('POST','/api/management/parameters'),null);
 assert.equal(staffRequestCapability('POST','/api/platform/companies'),null);
});

test('AST discovery records actual controls and literal/dynamic reads and writes without interpreting discovered code',()=>{
 const s=scanSource('import Panel from "./Panel.jsx";const n=()=>import("./Lazy.jsx");async function f(url,options){await api(`/api/stores/${id}/data`,{method:"POST"});await request(url,options);return <form onSubmit={save}><button onClick={go} aria-label="Export">Export</button><button>{label}</button></form>} const router={};router.post("/stores/:storeId/data",handler);','fixture.jsx');
 assert.deepEqual(s.imports,['./Panel.jsx','./Lazy.jsx']);assert.equal(s.controls.length,3);assert.equal(s.controls.find(c=>c.tag==='form').handlers[0],'onSubmit');assert.equal(s.controls.find(c=>c.label==='Export').dynamic,false);assert.equal(s.controls.at(-1).dynamic,true);
 assert.equal(s.requests[0].path,'/api/stores/${…}/data');assert.equal(s.requests[0].method,'POST');assert.equal(s.requests[1].path,null);assert.equal(s.requests[1].method,'UNKNOWN');assert.equal(s.requests[1].dynamic,true);
 assert.deepEqual(s.routes.map(r=>[r.method,r.path]),[['POST','/stores/:storeId/data']]);
});

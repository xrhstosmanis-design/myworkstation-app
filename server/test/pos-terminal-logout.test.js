import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../client/src/components/store/StoreOperatorApp.jsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('const logout=async()=>'),source.indexOf(' const changed='));
function fixture(api){
 const removed=[],errors=[],states=[];
 const deps={api,session:{store:{id:"fixture-store"}},sessionStorage:{removeItem:key=>removed.push(key)},setError:value=>errors.push(value),...Object.fromEntries(['setSession','setDirectory','setShiftState','setRuntimeAccess','applyPosPermissionStyle','setOperatorMenu','setShiftView'].map(name=>[name,value=>states.push([name,value])]))};
 return {logout:new Function(...Object.keys(deps),body+'return logout;')(...Object.values(deps)),removed,errors,states};
}
test('actual logout retains operator credentials and session on transient failure, then permits a successful retry',async()=>{
 let attempts=0;const f=fixture(async(path,options)=>{assert.equal(path,'/api/operators/logout');assert.deepEqual(JSON.parse(options.body),{storeId:'fixture-store'});if(++attempts===1)throw Error('offline')});
 await f.logout();assert.deepEqual(f.removed,[]);assert.deepEqual(f.states,[]);assert.match(f.errors.at(-1),/Η αποσύνδεση δεν επιβεβαιώθηκε/);
 await f.logout();assert.deepEqual(f.removed,['storeOperatorToken','storeOperatorSession']);assert.equal(attempts,2);assert.ok(f.states.some(([name,value])=>name==='setSession'&&value===null));
});
test('already revoked server session can leave locally, while unknown authorization failures keep retry state',async()=>{
 for(const [code,cleared]of [['STORE_OPERATOR_SESSION_REVOKED',true],['AUTH_TOKEN_EXPIRED',true],['UNKNOWN',false]]){
 const f=fixture(async()=>{throw Object.assign(Error('auth'),{status:401,code})});await f.logout();assert.equal(f.removed.length>0,cleared,code);
 }
});

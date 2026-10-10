import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readBackofficeContext} from '../../client/src/utils/backofficeSessionBoundary.mjs';

const source=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8');
const start=source.indexOf('  const load=async()=>{');
const end=source.indexOf('\n  useEffect(()=>{if(user)load()',start);
assert.ok(start>=0&&end>start);
const actualLoad=source.slice(start,end);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function fixture(){
  const storage=new Map([['token','fixture-old']]);
  const localStorage={getItem:key=>storage.get(key)||null};
  const overviewLoadSequence={current:0},writes=[],requests=[];
  const request=path=>{const pending=deferred();requests.push({path,...pending});return pending.promise};
  const clearSession=()=>{overviewLoadSequence.current++;storage.delete('token');writes.push(['clear']);};
  const setter=name=>value=>writes.push([name,value]);
  const load=new Function('localStorage','readBackofficeContext','overviewLoadSequence','request','clearSession','setLoading','setError','setData','setOwners','setBackupMonitor',`${actualLoad};return load;`)(localStorage,readBackofficeContext,overviewLoadSequence,request,clearSession,...['loading','error','data','owners','backup'].map(setter));
  const success=(offset,label)=>{requests[offset].resolve({label});requests[offset+1].resolve({owners:[label]});requests[offset+2].resolve({label});};
  return {storage,overviewLoadSequence,writes,requests,load,success};
}
test('actual Platform load cannot delete new login on an old unauthorized rejection',async()=>{
  const f=fixture(),pending=f.load();f.storage.set('token','fixture-new-login');const before=f.writes.length;
  f.requests[0].reject(new Error('Η συνεδρία δεν είναι πλέον ενεργή.'));await pending;
  assert.equal(f.storage.get('token'),'fixture-new-login');assert.deepEqual(f.writes.slice(before),[]);
});
test('actual Platform load discards old successful data after support context replacement',async()=>{
  const f=fixture(),pending=f.load();f.storage.set('supportContext',JSON.stringify({storeId:'different-fixture'}));const before=f.writes.length;
  f.success(0,'old-store');await pending;assert.deepEqual(f.writes.slice(before),[]);
});
test('actual newer refresh wins over older successful refresh',async()=>{
  const f=fixture(),old=f.load(),fresh=f.load();f.success(3,'fresh');await fresh;const before=f.writes.length;
  f.success(0,'old');await old;assert.deepEqual(f.writes.slice(before),[]);assert.deepEqual(f.writes.filter(x=>x[0]==='data'),[['data',{label:'fresh'}]]);
});
test('current unauthorized response retains logout while ordinary error retains credentials',async()=>{
  for(const [message,clears] of [['Η συνεδρία δεν είναι πλέον ενεργή.',true],['Προσωρινό σφάλμα υπηρεσίας.',false]]){
    const f=fixture(),pending=f.load();f.requests[0].reject(new Error(message));await pending;
    assert.equal(f.storage.has('token'),!clears);assert.equal(f.writes.some(x=>x[0]==='clear'),clears);
  }
});
test('disposed Platform load cannot change the next view',async()=>{
  const f=fixture(),pending=f.load();f.overviewLoadSequence.current++;const before=f.writes.length;
  f.requests[0].reject(new Error('Απαιτείται σύνδεση.'));await pending;assert.deepEqual(f.writes.slice(before),[]);assert.equal(f.storage.get('token'),'fixture-old');
});

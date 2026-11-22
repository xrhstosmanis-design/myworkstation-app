import test from 'node:test';
import assert from 'node:assert/strict';
import {logoutBackofficeStaff} from '../../client/src/utils/backoffice-staff-logout.mjs';
const fixture=()=>{
 const values=new Map([['token','old-session'],['user',JSON.stringify({id:'staff'})],['pos-layout','keep-layout'],['pos-pending','keep-pending']]);
 return {values,storage:{getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k)}};
};
for(const networkError of [false,true])test(`personal logout preserves POS settings/pending state with ${networkError?'uncertain':'confirmed'} remote revoke`,async()=>{
 const f=fixture(),calls=[];let closed=0;
 const cleared=await logoutBackofficeStaff({storage:f.storage,request:async(...args)=>{calls.push(args);if(networkError)throw Error('offline')},onLogout:()=>closed++});
 assert.equal(cleared,true);assert.equal(closed,1);assert.deepEqual(calls,[['/api/auth/logout',{method:'POST',body:'{}'}]]);
 assert.deepEqual([...f.values],[['pos-layout','keep-layout'],['pos-pending','keep-pending']]);
});
for(const failed of [false,true])test(`a different accepted session survives a late logout ${failed?'failure':'success'}`,async()=>{
 const f=fixture();let finish,closed=0;
 const pending=logoutBackofficeStaff({storage:f.storage,request:()=>new Promise((resolve,reject)=>{finish=failed?reject:resolve}),onLogout:()=>closed++});
 f.values.set('token','new-session');f.values.set('user',JSON.stringify({id:'owner'}));finish(failed?Error('old request'):undefined);
 assert.equal(await pending,false);assert.equal(closed,0);assert.equal(f.values.get('token'),'new-session');assert.equal(f.values.get('pos-pending'),'keep-pending');
});

import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('client/src/main.jsx','utf8');
const a=source.indexOf('const submit=async e=>'),b=source.indexOf('\n return <div',a);
const handler=source.slice(a,b);
for(const kind of ['owner-session','mfa-required','setup-required']){
 const values=new Map([['supportContext','synthetic-support']]);
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const sessionStorage={removeItem:()=>{}};let accepted=false,error='';
 const data=kind==='owner-session'?{token:'synthetic-session',user:{id:'fixture',role:'OWNER'}}:kind==='mfa-required'?{mfaRequired:true,challengeToken:'fixture-only',user:{id:'fixture',role:'SUPER_ADMIN'}}:{setupRequired:true,setupToken:'fixture-only',user:{id:'fixture',role:'SUPER_ADMIN'}};
 const api=async()=>data,readBackofficeContext=()=>({key:'stable-fixture'}),onLogin=()=>{accepted=true},setError=x=>{error=x};
 await new Function('api','readBackofficeContext','localStorage','sessionStorage','onLogin','setError','email','password',handler+';return submit({preventDefault(){}});')(api,readBackofficeContext,localStorage,sessionStorage,onLogin,setError,'fixture@example.invalid','synthetic-unused');
 assert.equal(error,'');assert.equal(accepted,true);
 const hasRealSession=values.get('token')==='synthetic-session';
 if(kind==='owner-session')assert.ok(hasRealSession);else assert.equal(values.get('token'),'undefined');
 console.log(JSON.stringify({kind,entersAuthenticatedView:accepted,hasSessionToken:hasRealSession,result:kind==='owner-session'?'CONTROL_OK':'REPRODUCED_FAILURE: incomplete MFA accepted as session'}));
}

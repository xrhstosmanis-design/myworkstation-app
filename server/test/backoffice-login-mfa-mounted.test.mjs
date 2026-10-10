import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

test("mounted ordinary Login preserves context until a final session, keeping MFA in secure entry",async t=>{
  const filename=fileURLToPath(new URL("../../client/src/main.jsx",import.meta.url));
  const source=fs.readFileSync(filename,"utf8").replace('createRoot(document.getElementById("root")).render(<App/>);','export {Login};');
  const result=await build({stdin:{contents:source,resolveDir:path.dirname(filename),loader:"jsx"},bundle:true,write:false,platform:"node",format:"cjs",external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},plugins:[{name:"isolated-child-panels",setup(b){b.onLoad({filter:/\.jsx$/},()=>({contents:'export default function Panel(){return null}',loader:"jsx"}))}}]});
  const mod={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const user={id:"fixture-owner",role:"OWNER",company:{id:"company-A"}};
  const final={token:"fixture-final-session",user};
  const challenges=[
    {name:"MFA challenge",data:{mfaRequired:true,challengeToken:"fixture-private-challenge",user:{id:"fixture-admin",role:"SUPER_ADMIN"}}},
    {name:"2FA setup",data:{setupRequired:true,setupToken:"fixture-private-setup",secret:"fixture-private-secret",otpAuthUri:"fixture-private-qr",user:{id:"fixture-admin",role:"SUPER_ADMIN"}}},
    {name:"MFA flag with a token cannot become a final session",data:{...final,mfaRequired:true}},
    {name:"setup flag with a token cannot become a final session",data:{...final,setupRequired:true}}
  ];
  const malformed=[null,{}, {user}, {token:"",user}, {token:"   ",user}, {token:"undefined",user}, {token:"null",user}, {token:42,user}, {token:final.token}, {token:final.token,user:{}}, {token:final.token,user:{id:" "}}];
  const cases=[...challenges.map(row=>({...row,challenge:true})),...malformed.map((data,i)=>({name:`incomplete response ${i+1}`,data})),{name:"denied login",data:{error:"Fixture denial"},status:401},{name:"superseded final session",data:final,replace:true},{name:"ordinary Owner final session",data:final,accept:true}];
  for(const row of cases)await t.test(row.name,async()=>{
    const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
    const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","sessionStorage","fetch","IS_REACT_ACT_ENVIRONMENT"];
    const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
    for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
    const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root"));
    localStorage.setItem("token","fixture-existing-session");localStorage.setItem("user",JSON.stringify(user));localStorage.setItem("supportContext",JSON.stringify({companyId:"company-A",storeId:"store-A"}));sessionStorage.setItem("platformToken","fixture-existing-platform");
    const storage=()=>[...Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]),["platformToken",sessionStorage.getItem("platformToken")]];
    const before=storage(),accepted=[],calls=[];
    globalThis.fetch=async(url,options)=>{
      calls.push([url,options.method]);
      if(row.replace)localStorage.setItem("token","fixture-newer-other-tab-session");
      const status=row.status||200;
      return {ok:status===200,status,json:async()=>row.data};
    };
    try{
      await act(async()=>root.render(React.createElement(mod.exports.Login,{onLogin:value=>accepted.push(value)})));
      await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
      assert.deepEqual(calls,[["/api/auth/login","POST"]]);
      if(row.accept){
        assert.deepEqual(accepted,[user]);assert.equal(localStorage.getItem("token"),final.token);
        assert.equal(localStorage.getItem("supportContext"),null);assert.equal(sessionStorage.getItem("platformToken"),null);
        assert.equal(document.querySelector('[role="alert"]'),null);assert.equal(document.querySelector("a"),null);
      }else{
        assert.deepEqual(accepted,[]);
        if(row.replace){assert.equal(localStorage.getItem("token"),"fixture-newer-other-tab-session");assert.equal(localStorage.getItem("supportContext"),before.find(x=>x[0]==="supportContext")[1]);assert.match(document.body.textContent,/Η σύνδεση άλλαξε όσο περίμενες/)}
        else assert.deepEqual(storage(),before);
        assert.ok(document.querySelector('[role="alert"]'));
        const link=document.querySelector("a");
        if(row.challenge){
          assert.equal(link?.href,"https://myworkstation-app.onrender.com/platform-admin");assert.equal(document.querySelector('input[type="password"]').value,"");
          assert.match(document.body.textContent,/Απαιτείται επιβεβαίωση 2FA/);
          for(const privateValue of ["fixture-private-challenge","fixture-private-setup","fixture-private-secret","fixture-private-qr"])assert.ok(!document.documentElement.outerHTML.includes(privateValue));
        }else assert.equal(link,null);
      }
    }finally{
      await act(async()=>root.unmount());dom.window.close();for(const k of keys){const desc=previous.get(k);if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k]}
    }
  });
});

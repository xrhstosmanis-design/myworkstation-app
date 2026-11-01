import fs from 'node:fs';import {transformSync} from 'esbuild';import {JSDOM} from 'jsdom';
export async function mount(transport){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/chat',pretendToBeVisual:true}),keys=['window','document','navigator','location','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 let token='fixture-session';const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const noop=()=>null,icons=new Proxy({},{get:()=>noop});
 const dependencies={'react':React,'lucide-react':icons,'./store-chat.css':{},'./DocumentScanButton.jsx':noop,'./ChatVideoAttachment.jsx':noop,'./ChatVoicePreview.jsx':noop,'./NativeChatDownload.jsx':noop,'./chat-mobile-session.mjs':{chatToken:()=>token},'./chat-mobile-install.mjs':{mobileChatUrl:id=>'/chat?store='+id,registerChatWorker:async()=>null},'./store-chat-push-diagnostic.mjs':{pushSubscriptionFailure:()=>''}};
 const photo={exports:{}};new Function('require','module','exports',transformSync(fs.readFileSync(new URL('../../../client/src/components/store/ChatPhotoViewer.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'}).code)(name=>{if(name!=='react')throw Error(name);return React},photo,photo.exports);dependencies['./ChatPhotoViewer.jsx']=photo.exports;
 const child={exports:{}};
 new Function('require','module','exports',transformSync(fs.readFileSync(new URL('../../../client/src/components/store/ChatHistoryTools.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'}).code)(name=>{if(name!=='react')throw Error(name);return React},child,child.exports);
 dependencies['./ChatHistoryTools.jsx']=child.exports;
 const source=fs.readFileSync(new URL('../../../client/src/components/store/StoreChatPanel.jsx',import.meta.url),'utf8'),module={exports:{}};
 new Function('require','module','exports',transformSync(source,{loader:'jsx',format:'cjs'}).code)(name=>{if(!(name in dependencies))throw Error(name);return dependencies[name]},module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];
 const api=async(path,options={})=>{calls.push({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});return transport(path,options,calls)};
 const render=async id=>act(async()=>{root.render(React.createElement(module.exports.default,{api,store:{id,companyId:'company',name:id},onClose:noop}));await new Promise(r=>setTimeout(r,0))});
 const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,0))});
 return {dom,act,calls,render,flush,setToken:value=>{token=value},async close(){await act(async()=>root.unmount());dom.window.close();for(const k of keys){const v=previous.get(k);if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}};
}

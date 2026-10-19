// Request/job epochs are captured at query creation, never upgraded at retry time.
// This module is inert until an authenticated caller explicitly supplies a context.
import {AsyncLocalStorage} from 'node:async_hooks';
import {normalizeLifecycleGeneration} from './store-lifecycle-generation.js';
const storage=new AsyncLocalStorage();
const descriptors=new WeakMap();
const writeOperation=/^(create|update|upsert|delete)/;
const empty=Object.freeze({});
export function normalizeLifecycleContext(input){
 if(input===undefined||input===null)return empty;
 if(typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Array.isArray(input)||Object.keys(input).length>100)throw new TypeError('Invalid lifecycle context');
 const result=Object.create(null);
 for(const [storeId,value] of Object.entries(input)){
  if(!storeId||storeId.includes('\0')||storeId.length>200||normalizeLifecycleGeneration(value)===null)throw new TypeError('Invalid lifecycle context');
  result[storeId]=value;
 }
 return Object.freeze(result);
}
export const lifecycleContext=()=>storage.getStore()||empty;
export const withLifecycleContext=(input,work)=>storage.run(normalizeLifecycleContext(input),work);
const meaningful=context=>Object.values(context).some(value=>value!=='0');
// SET LOCAL is a utility statement: unlike SELECT set_config it does not
// acquire a snapshot before a caller's SET TRANSACTION READ ONLY/ISOLATION.
// E-string escaping is explicit for both backslashes and single quotes.
const setContext=(client,context)=>client.$executeRawUnsafe(`SET LOCAL "mws.lifecycle_generations" = E'${JSON.stringify(context).replaceAll('\\','\\\\').replaceAll("'","\\'")}'`);

// Uses public Prisma promises and batch/callback transactions only. No private
// transaction IDs, extensions or session-level settings cross connection pools.
export function withLifecyclePrisma(client){
 const delegates=new Map();
 function wrap(raw,context,write){
  let execution;
  const execute=()=>execution??=(meaningful(context)&&write?client.$transaction([setContext(client,context),raw]).then(rows=>rows[1]):Promise.resolve(raw));
  const wrapped=new Proxy(Object.create(null),{get(_target,key){
   if(key==='then')return (resolve,reject)=>execute().then(resolve,reject);
   if(key==='catch')return reject=>execute().catch(reject);
   if(key==='finally')return done=>execute().finally(done);
   if(key===Symbol.toStringTag)return 'PrismaPromise';
   const value=raw[key];
   return typeof value==='function'? (...args)=>wrap(value.apply(raw,args),context,write):value;
  }});
  descriptors.set(wrapped,{raw,context});return wrapped;
 }
 return new Proxy(client,{get(target,key){
  if(key==='$transaction')return (work,options)=>{
   const context=lifecycleContext();
   if(typeof work==='function')return meaningful(context)?target.$transaction(async tx=>{await setContext(tx,context);return work(tx)},options):target.$transaction(work,options);
   if(!Array.isArray(work))return target.$transaction(work,options);
   // Each item keeps the epoch from its creation, including untagged legacy
   // promises. The epoch at batch invocation cannot relabel an older query.
   const items=work.map(item=>descriptors.get(item)||{raw:item,context:empty});
   if(!items.some(item=>meaningful(item.context)))return target.$transaction(items.map(item=>item.raw),options);
   const queries=[],positions=[];let previous;
   for(const item of items){const encoded=JSON.stringify(item.context);if(encoded!==previous){queries.push(setContext(target,item.context));previous=encoded}positions.push(queries.length);queries.push(item.raw)}
   return target.$transaction(queries,options).then(rows=>positions.map(index=>rows[index]));
  };
  const value=Reflect.get(target,key,target);
  if(typeof key==='string'&&/^\$(queryRaw|executeRaw)/.test(key)&&typeof value==='function')return (...args)=>wrap(value.apply(target,args),lifecycleContext(),true);
  if(typeof key==='string'&&!key.startsWith('$')&&value&&typeof value==='object'&&typeof value.findMany==='function'&&typeof value.create==='function'){
   if(!delegates.has(key))delegates.set(key,new Proxy(value,{get(model,operation){const method=Reflect.get(model,operation,model);return typeof method==='function'?(...args)=>wrap(method.apply(model,args),lifecycleContext(),writeOperation.test(String(operation))):method}}));
   return delegates.get(key);
  }
  return typeof value==='function'?value.bind(target):value;
 }});
}

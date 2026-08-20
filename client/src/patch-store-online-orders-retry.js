import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"components/store/StoreOnlineOrdersV2.jsx");
let source=fs.readFileSync(file,"utf8");

const oldInfo=' const preparationInfo=async productId=>{try{return await api(`/api/store-pos/stores/${encodeURIComponent(store.id)}/modifiers?productId=${encodeURIComponent(productId)}`,{cache:"no-store"})}catch{return null}};';
const newInfo=' const preparationInfo=async productId=>await api(`/api/store-pos/stores/${encodeURIComponent(store.id)}/modifiers?productId=${encodeURIComponent(productId)}`,{cache:"no-store"});';
if(source.includes(oldInfo))source=source.replace(oldInfo,newInfo);
else if(!source.includes(newInfo))throw new Error("Online preparation info anchor not found");

const oldCached='   const cached=sessionStorage.getItem(batchKey(order.id));if(cached)return cached==="NONE"?{batchId:null,prepIds:new Set()}:{batchId:cached,prepIds:new Set((order.items||[]).map(i=>i.productId))};';
const newCached='   const cached=sessionStorage.getItem(batchKey(order.id));if(cached){if(cached==="NONE")return{batchId:null,prepIds:new Set()};try{const parsed=JSON.parse(cached);if(parsed?.batchId)return{batchId:parsed.batchId,prepIds:new Set(parsed.prepIds||[])}}catch{}sessionStorage.removeItem(batchKey(order.id))}';
if(source.includes(oldCached))source=source.replace(oldCached,newCached);
else if(!source.includes('prepIds:new Set(parsed.prepIds||[])'))throw new Error("Online preparation cache anchor not found");

const oldSave='   const batchId=result.batchId||result.id;sessionStorage.setItem(batchKey(order.id),batchId);return{batchId,prepIds:new Set(prep.map(x=>x.productId))};';
const newSave='   const batchId=result.batchId||result.id,prepIds=prep.map(x=>x.productId);sessionStorage.setItem(batchKey(order.id),JSON.stringify({batchId,prepIds}));return{batchId,prepIds:new Set(prepIds)};';
if(source.includes(oldSave))source=source.replace(oldSave,newSave);
else if(!source.includes('JSON.stringify({batchId,prepIds})'))throw new Error("Online preparation cache save anchor not found");

fs.writeFileSync(file,source);
console.log("Store Online Orders retry safety ready.");

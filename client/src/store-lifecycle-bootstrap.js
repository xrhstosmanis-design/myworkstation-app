import {rememberLifecycleOrigin} from "./utils/store-lifecycle-origin.js";
import {createLifecycleFetch} from './utils/store-lifecycle-fetch.js';
const transport=createLifecycleFetch({fetch:window.fetch.bind(window),origin:window.location.origin,onPinned:rememberLifecycleOrigin,onStale:()=>{
 if(document.getElementById('mws-lifecycle-reload'))return;
 const banner=document.createElement('div');banner.id='mws-lifecycle-reload';banner.setAttribute('role','alert');banner.style.cssText='position:fixed;inset:0 0 auto;z-index:2147483647;background:#fff0cf;color:#202020;padding:16px;font:18px sans-serif';
 const text=document.createElement('span');text.textContent='Η κατάσταση του καταστήματος άλλαξε. Οι παλιές εκκρεμείς κινήσεις διατηρούνται για έλεγχο. ';
 const button=document.createElement('button');button.textContent='Επαναφόρτωση καταστήματος';button.onclick=()=>window.location.reload();banner.append(text,button);(document.body||document.documentElement).append(banner);
}});
window.fetch=transport.request;

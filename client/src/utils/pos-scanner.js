import {useEffect,useRef} from 'react';
import {productMatchesCodes} from './pos-catalog-resolver.js';

// Automatic scans resolve stored numeric barcode aliases; explicit Enter can resolve a unique SKU.
const barcodeCodes=value=>String(value??'').split('~').flatMap(part=>{
  const code=part.replace(/\s/g,'');
  if(!/^\d{6,18}$/.test(code))return [];
  return [...new Set([code,code.replace(/^0+(?=\d)/,'')])];
});
const barcodeMatches=(stored,value)=>barcodeCodes(stored).some(code=>barcodeCodes(value).includes(code));

export function exactScanBarcode(products,value,{complete=false,manual=false}={}){
  if(!manual&&!/^\d{6,18}$/.test(value))return null;
  const wanted=new Set(barcodeCodes(value));
  let unfinished=false;const rows=[];
  for(const product of products){
    const codes=[...(product.barcodes||[]),...(product.barcodeOptions||[]).map(row=>row.barcode),product.masterCode,product.sourceCode!==product.sku?product.sourceCode:null].flatMap(barcodeCodes);
    if(codes.some(code=>code.length>value.length&&code.startsWith(value)))unfinished=true;
    if(codes.some(code=>wanted.has(code)))rows.push(product);
  }
  if(manual&&!rows.length){const matches=products.filter(product=>productMatchesCodes(product,[value]));return matches.length===1?matches[0]:null}
  return (complete||!unfinished)&&rows.length===1?rows[0]:null;
}

export function barcodeCartProduct(product,value){
  const options=product.barcodeOptions||[],option=options.find(row=>row.barcode===value)||options.find(row=>barcodeMatches(row.barcode,value));
  return option?{...product,productId:product.id,cartKey:`${product.id}::${option.barcode}`,scannedBarcode:option.barcode,salePrice:option.salePrice==null?product.salePrice:Number(option.salePrice)}:product;
}

const visible=element=>{for(let node=element;node&&node.nodeType===1;node=node.parentElement){if(node.hidden||node.hasAttribute('inert'))return false;const style=node.ownerDocument.defaultView.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return false}return true};
export function scannerCanFocus(input){
  if(!input?.isConnected||input.disabled||!visible(input))return false;
  return ![...input.ownerDocument.querySelectorAll('[aria-modal="true"],.pos-standard-modal,.category-product-overlay,.po-modal-overlay,.shift-overlay,.pos-price-modal,.pos-card-terminal-picker,.operator-camera-overlay,.operator-shift-popover')].some(visible);
}

// Restore idle scanner focus from UI events; active editing and dialogs keep focus.
export function usePosScannerFocus({inputRef,storeId,ready,blocked,request}){
  const pending=useRef(true);
  useEffect(()=>{pending.current=true},[storeId,request]);
  useEffect(()=>{
    if(!ready||blocked)return;
    const input=inputRef.current;if(!input)return;
    const doc=input.ownerDocument,view=doc.defaultView,root=input.closest('.mws-standard-pos');
    let timer,idleInteraction=false;
    const focus=()=>{
      const interaction=idleInteraction;idleInteraction=false;
      const current=inputRef.current;if(current!==input||doc.visibilityState==='hidden'||!scannerCanFocus(current))return;
      const active=doc.activeElement;
      if(active===current){pending.current=false;return}
      if(!pending.current){
        const editor=active?.closest?.('input,textarea,select,[contenteditable],[role="textbox"],[role="combobox"]');
        if(editor&&(editor.matches('input,textarea,select,[role="textbox"],[role="combobox"]')||editor.getAttribute('contenteditable')!=='false'))return;
        if(active&&active!==doc.body&&active!==doc.documentElement&&!root?.contains(active))return;
        if(!interaction&&active?.closest?.('button,a[href],[tabindex]'))return;
      }
      current.focus({preventScroll:true});
      if(doc.activeElement===current)pending.current=false;
    };
    const schedule=()=>{view.clearTimeout(timer);timer=view.setTimeout(focus,0)};
    const interactionFinished=()=>{idleInteraction=true;schedule()};
    focus();
    const observer=new view.MutationObserver(schedule);
    observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class','inert','aria-modal']});
    doc.addEventListener('focusin',schedule);
    doc.addEventListener('focusout',schedule);
    doc.addEventListener('visibilitychange',schedule);
    root?.addEventListener('pointerup',interactionFinished);
    root?.addEventListener('click',interactionFinished);
    view.addEventListener('focus',schedule);
    return()=>{
      view.clearTimeout(timer);observer.disconnect();
      doc.removeEventListener('focusin',schedule);doc.removeEventListener('focusout',schedule);
      doc.removeEventListener('visibilitychange',schedule);
      root?.removeEventListener('pointerup',interactionFinished);root?.removeEventListener('click',interactionFinished);
      view.removeEventListener('focus',schedule);
    };
  },[inputRef,storeId,ready,blocked,request]);
}

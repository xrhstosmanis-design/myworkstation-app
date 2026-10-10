import {useEffect,useRef} from 'react';

export function exactScanBarcode(products,value){
  if(!/^\d{6,18}$/.test(value))return null;
  let unfinished=false;const rows=[];
  for(const product of products){const codes=[...(product.barcodes||[]),...(product.barcodeOptions||[]).map(row=>row.barcode)].map(String);if(codes.some(code=>code.length>value.length&&code.startsWith(value)))unfinished=true;if(codes.includes(value))rows.push(product)}
  return !unfinished&&rows.length===1?rows[0]:null;
}

export function barcodeCartProduct(product,value){
  const option=(product.barcodeOptions||[]).find(row=>row.barcode===value);
  return option?{...product,productId:product.id,cartKey:`${product.id}::${option.barcode}`,scannedBarcode:option.barcode,salePrice:option.salePrice==null?product.salePrice:Number(option.salePrice)}:product;
}

const visible=element=>{for(let node=element;node&&node.nodeType===1;node=node.parentElement){if(node.hidden||node.hasAttribute('inert'))return false;const style=node.ownerDocument.defaultView.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return false}return true};
export function scannerCanFocus(input){
  if(!input?.isConnected||input.disabled||!visible(input))return false;
  return ![...input.ownerDocument.querySelectorAll('[aria-modal="true"],.pos-standard-modal,.category-product-overlay,.po-modal-overlay')].some(visible);
}

// Focus is requested by cart actions, never by every render or periodic polling.
export function usePosScannerFocus({inputRef,storeId,ready,blocked,request}){
  const pending=useRef(true);
  useEffect(()=>{pending.current=true},[storeId,request]);
  useEffect(()=>{
    if(!pending.current||!ready||blocked)return;
    const focus=()=>{const input=inputRef.current;if(!pending.current||!scannerCanFocus(input))return;input.focus({preventScroll:true});if(input.ownerDocument.activeElement===input)pending.current=false};
    focus();if(!pending.current)return;
    const observer=new MutationObserver(focus);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','aria-modal']});
    return()=>observer.disconnect();
  },[inputRef,storeId,ready,blocked,request]);
}

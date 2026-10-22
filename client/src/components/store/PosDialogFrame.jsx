import React,{useEffect,useRef} from 'react';
import './pos-dialog-frame.css';

const dialogSelector='[role="dialog"],[aria-modal="true"],.pos-standard-modal,.category-product-overlay,.po-modal-overlay,.shift-overlay,.operator-camera-overlay,.pos-price-modal,.pos-card-terminal-picker,.operator-shift-popover,[role="alertdialog"]';
const focusSelector='button,input,select,textarea,a[href],[tabindex]';
function visible(el){for(let node=el;node&&node.nodeType===1;node=node.parentElement){const style=node.ownerDocument.defaultView.getComputedStyle(node);if(node.hidden||node.hasAttribute('inert')||style.display==='none'||style.visibility==='hidden')return false}return true}
function topmost(root){
 const dialogs=[...root.ownerDocument.querySelectorAll(dialogSelector)].filter(visible);
 const stack=el=>{let z=0;for(let node=el;node&&node.nodeType===1;node=node.parentElement)z=Math.max(z,Number.parseInt(node.ownerDocument.defaultView.getComputedStyle(node).zIndex,10)||0);return z};
 return !dialogs.some(el=>el!==root&&!el.contains(root)&&(root.contains(el)||stack(el)>stack(root)||(stack(el)===stack(root)&&Boolean(root.compareDocumentPosition(el)&4))));
}
function focusable(root){return [...root.querySelectorAll(focusSelector)].filter(el=>!el.disabled&&el.type!=='hidden'&&el.tabIndex>=0&&visible(el))}

// Presentation-only keyboard boundary. Existing close callbacks keep all busy
// and financial guards; minimization retains the mounted form and its values.
export default function PosDialogFrame({children,onClose,closeDisabled=false,label,...props}){
 const ref=useRef(null),current=useRef({onClose,closeDisabled});current.current={onClose,closeDisabled};
 useEffect(()=>{
  const root=ref.current;if(!root)return;const doc=root.ownerDocument,previous=doc.activeElement;let lastInside=null,wasVisible=visible(root),scheduled=false;
  const focusInside=()=>{if(!visible(root)||!topmost(root))return;const target=lastInside?.isConnected&&visible(lastInside)&&!lastInside.disabled?lastInside:focusable(root)[0]||root;target.focus()};
  if(!root.contains(doc.activeElement))focusInside();
  const focusin=event=>{if(root.contains(event.target))lastInside=event.target;else if(visible(root)&&topmost(root))focusInside()};
  const keydown=event=>{
   if(!visible(root)||!topmost(root)||event.defaultPrevented)return;
   if(event.key==='Escape'){if(!current.current.closeDisabled&&current.current.onClose){event.preventDefault();event.stopPropagation();current.current.onClose()}return}
   if(event.key!=='Tab')return;const list=focusable(root),first=list[0],last=list.at(-1),active=doc.activeElement;
   if(!first){event.preventDefault();root.focus()}else if(event.shiftKey&&(!root.contains(active)||active===first)){event.preventDefault();last.focus()}else if(!event.shiftKey&&(!root.contains(active)||active===last)){event.preventDefault();first.focus()}
  };
  const observer=new doc.defaultView.MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!root.isConnected)return;const now=visible(root);if(now&&!wasVisible)focusInside();wasVisible=now})});
  observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['style','class','hidden','inert']});doc.addEventListener('focusin',focusin);doc.addEventListener('keydown',keydown);
  return()=>{observer.disconnect();doc.removeEventListener('focusin',focusin);doc.removeEventListener('keydown',keydown);const previousDialog=previous?.closest?.(dialogSelector);if(previous?.isConnected&&visible(previous)&&(previousDialog?topmost(previousDialog):![...doc.querySelectorAll(dialogSelector)].some(visible)))previous.focus()};
 },[]);
 return <div {...props} ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>;
}

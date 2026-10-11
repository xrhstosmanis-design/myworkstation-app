import React,{useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Menu,X} from 'lucide-react';
import './pos-header-actions-menu.css';

// Keep these children mounted even when closed: radio and recording own live media.
export default function PosHeaderActionsMenu({open,onOpenChange,scale=1,children}){
 const id=useId(),trigger=useRef(null),panel=useRef(null),[position,setPosition]=useState({top:12,left:12});
 const close=(restore=true)=>{onOpenChange(false);if(restore)trigger.current?.focus()};
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const anchor=trigger.current?.getBoundingClientRect(),box=panel.current?.getBoundingClientRect();if(!anchor||!box)return;setPosition({top:Math.max(12,Math.min(anchor.bottom+8,window.innerHeight-box.height-12)),left:Math.max(12,Math.min(anchor.left,window.innerWidth-box.width-12))})};
  place();panel.current?.querySelector('.pos-header-menu-controls button:not(:disabled)')?.focus();
  window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place);
 },[open,scale]);
 const keys=event=>{
  if(!open||!panel.current?.contains(event.target))return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
  if(event.key!=='Tab')return;
  const controls=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node=>!node.closest('[hidden]'));
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 };
 return <>
  <button ref={trigger} type="button" className="pos-header-menu-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={()=>open?close():onOpenChange(true)}><Menu size={18}/><span>Λειτουργίες POS</span></button>
  {createPortal(<div className="pos-header-menu-layer" hidden={!open} style={{'--pos-text-scale':scale}} onMouseDown={event=>event.target===event.currentTarget&&close()}>
   <section ref={panel} id={id} className="pos-header-menu-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} style={position} onKeyDown={keys}>
    <header><h2 id={`${id}-title`}>Λειτουργίες POS</h2><button type="button" aria-label="Κλείσιμο λειτουργιών POS" onClick={()=>close()}><X/></button></header>
    <div className="pos-header-menu-controls" onClick={event=>{const button=event.target.closest('button');if(button&&event.currentTarget.contains(button)&&!button.closest('.mws-screen-recorder')&&!button.classList.contains('pos-keypad-toggle'))close(false)}}>{children}</div>
   </section>
  </div>,document.body)}
 </>;
}

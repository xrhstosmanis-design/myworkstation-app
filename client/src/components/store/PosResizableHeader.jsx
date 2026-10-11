import React,{useLayoutEffect,useRef,useState} from 'react';
import './pos-resizable-header.css';

const LIMIT=120,MIN_CART=96;
const clamp=(value,max=LIMIT)=>Math.max(0,Math.min(max,Number.isFinite(value)?value:0));
export default function PosResizableHeader({scope,children}){
 const storageKey=scope?`myworkstation:pos-header-space:${scope}`:null;
 const [space,setSpace]=useState(()=>{try{return clamp(Number(localStorage.getItem(storageKey)))}catch{return 0}});
 const [maximum,setMaximum]=useState(0),[dragging,setDragging]=useState(false);
 const header=useRef(null),value=useRef(space),max=useRef(0),drag=useRef(null);
 const change=next=>{value.current=clamp(next,max.current);setSpace(value.current)};
 const save=()=>{try{if(storageKey)localStorage.setItem(storageKey,String(value.current))}catch{/* Resize remains usable when browser storage is unavailable. */}};
 useLayoutEffect(()=>{
  const element=header.current,cart=element.closest('.mws-standard-pos')?.querySelector('.standard-lines');
  const measure=()=>{const room=cart?cart.getBoundingClientRect().height-MIN_CART:0;max.current=clamp(value.current+room);setMaximum(max.current);change(value.current)};
  measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
  observer?.observe(element);if(cart)observer?.observe(cart);
  window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure)};
 },[]);
 const finish=(event,cancel=false)=>{
  const start=drag.current;if(!start||start.id!==event.pointerId)return;
  drag.current=null;if(cancel)change(start.space);else save();setDragging(false);
  if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 return <div ref={header} className={`store-pos-top pos-resizable-header${dragging?' is-resizing':''}`}>
  <div className="pos-header-content" style={{paddingBottom:space}}>{children}</div>
  <button type="button" className="pos-header-resize-handle" role="separator" aria-label="Ύψος πάνω μπάρας POS" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={Math.round(maximum)} aria-valuenow={Math.round(space)} aria-valuetext={space<1?'Συμπαγής μπάρα':`Επιπλέον χώρος ${Math.round(space)} pixel`} title="Σύρε πάνω ή κάτω για αλλαγή ύψους. Διπλό κλικ για μικρότερο ύψος. Πληκτρολόγιο: ↑ ↓, Home."
   onPointerDown={event=>{if(event.button!==0||drag.current)return;event.preventDefault();drag.current={id:event.pointerId,y:event.clientY,space:value.current};event.currentTarget.setPointerCapture?.(event.pointerId);setDragging(true)}}
   onPointerMove={event=>{const start=drag.current;if(start?.id===event.pointerId)change(start.space+event.clientY-start.y)}}
   onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event)}
   onDoubleClick={()=>{change(0);save()}}
   onKeyDown={event=>{const next=event.key==='ArrowUp'?value.current-8:event.key==='ArrowDown'?value.current+8:event.key==='Home'||event.key==='Enter'?0:event.key==='End'?max.current:null;if(next===null)return;event.preventDefault();change(next);save()}}>
   <i aria-hidden="true"/><span>↕ Ύψος μπάρας</span>
  </button>
 </div>;
}

import React,{useId,useState} from 'react';
import './pos-collapsible-header.css';

// Keep launchers/media mounted while returning their layout space to the cart.
export default function PosCollapsibleHeader({summary,children,flat=false}){
 const [expanded,setExpanded]=useState(false);
 const id=useId();
 if(flat)return <section className="store-pos-top pos-flat-header">{children}</section>;
 return <section className="pos-collapsible-header">
  <div className="pos-header-summary">
   <div className="pos-header-summary-context">{summary}</div>
   <button type="button" className="pos-header-expand-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>{expanded?'▴ Απόκρυψη μπάρας':'▾ Εμφάνιση μπάρας'}</button>
  </div>
  <div id={id} className="pos-header-expanded-content" hidden={!expanded}>{children}</div>
 </section>;
}

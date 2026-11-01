import React from 'react';
import {Building2} from 'lucide-react';
export default function BackofficeStores({rows,onOpen,disabled=false}){
 return <section className="panel"><div className="panel-head"><div><h2>Καταστήματα</h2><p>Άνοιξε το κατάστημα στο οποίο θέλεις να εργαστείς.</p></div></div><div className="store-grid">{rows.map(s=><article className="store-card" key={s.id}><Building2/><h3>{s.name}</h3>{'city' in s&&<p>{s.city||'Χωρίς πόλη'}</p>}{Array.isArray(s.shifts)&&<small>{s.shifts.length} τύποι βαρδιών</small>}<button className="store-open" disabled={disabled} onClick={()=>onOpen(s)}>Άνοιγμα καταστήματος</button></article>)}</div></section>;
}

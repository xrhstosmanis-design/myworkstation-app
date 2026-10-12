import React,{useEffect,useRef,useState} from 'react';
import './store-baking.css';
export default function StoreBakingModal({api,store,onClose,onChanged}){
 const [data,setData]=useState(null),[productId,setProductId]=useState(''),[quantity,setQuantity]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const active=useRef(true),pending=useRef(null);
 const load=async()=>{const result=await api(`/api/store-pos/stores/${store.id}/baking`);if(active.current)setData(result)};
 useEffect(()=>{active.current=true;load().catch(e=>{if(active.current)setError(e.message)});return()=>{active.current=false}},[store.id]);
 const product=data?.products.find(p=>p.productId===productId);
 const save=async event=>{event.preventDefault();if(busy||!product)return;setBusy(true);setError('');setMessage('');
 const body={productId,...(product.sameProduct?{}:{sourceProductId:product.sourceProductId}),quantity:Number(quantity),note};
 const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,body:{...body,idempotencyKey:crypto.randomUUID()}};
 try{const result=await api(`/api/store-pos/stores/${store.id}/baking`,{method:'POST',body:JSON.stringify(pending.current.body)});if(!active.current)return;pending.current=null;setQuantity('');setNote('');setMessage(`Καταχωρίστηκαν ${result.quantity} ψημένα τεμάχια.`);await load();onChanged?.()}catch(e){if(active.current)setError(e.message)}finally{if(active.current)setBusy(false)}};
 return <div className="category-product-overlay"><section className="store-baking" role="dialog" aria-modal="true" aria-labelledby="baking-title"><header><div><small>{store.name}</small><h2 id="baking-title">Ψήσιμο σφολιατοειδών</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="Κλείσιμο">×</button></header>
 <div className="store-baking-body"><p>Προσθέστε τα τεμάχια που ψήθηκαν τώρα. Τα άψητα αφαιρούνται από την αποθήκη και τα ψημένα γίνονται διαθέσιμα στο POS και online.</p>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {!data?<p>Φόρτωση…</p>:!data.products.length?<p>Δεν έχουν οριστεί ακόμη είδη ψησίματος. Επιλέξτε «Σημερινά ψημένα του ίδιου είδους» στη διαχείριση Online Store.</p>:<form onSubmit={save}><label>Ψημένο είδος<select value={productId} onChange={e=>{setProductId(e.target.value);pending.current=null}} disabled={busy} required><option value="">Επιλέξτε είδος</option>{data.products.map(p=><option key={p.productId} value={p.productId}>{p.name} · ψημένα {Number(p.currentStock)}</option>)}</select></label>
 {product&&<p>Άψητα: {product.sourceName} · {Number(product.sourceStock)} τεμάχια{product.sameProduct&&<> · ψημένα {Number(product.currentStock)} · σύνολο {Number(product.sourceStock)+Number(product.currentStock)}</>}</p>}
 <label>Νέα ψημένα τεμάχια<input type="number" min="1" max="100000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={busy} required/></label><label>Σημείωση<input value={note} maxLength={500} onChange={e=>setNote(e.target.value)} disabled={busy}/></label><button disabled={busy||!product}>{busy?'Καταχώριση…':'Καταχώριση ψησίματος'}</button></form>}
 <h3>Πρόσφατα ψησίματα</h3><ul>{data?.history.map(e=><li key={e.id}><b>{e.name} · {e.quantity} τεμάχια</b><span>{e.actorName} · {new Date(e.createdAt).toLocaleString('el-GR',{timeZone:"Europe/Athens",hour12:false})}</span><span>Άψητα {Number(e.sourceBefore)} → {Number(e.sourceAfter)} · ψημένα {Number(e.finishedBefore)} → {Number(e.finishedAfter)}</span>{e.sameProduct&&<span>Σύνολο {Number(e.totalBefore)} → {Number(e.totalAfter)} · ίδιος κωδικός</span>}{e.note&&<span>{e.note}</span>}</li>)}</ul></div></section></div>;
}

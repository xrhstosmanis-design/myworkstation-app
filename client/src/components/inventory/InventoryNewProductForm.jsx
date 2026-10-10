import React,{useEffect,useRef,useState} from 'react';

export default function InventoryNewProductForm({request,stocktakeId,barcode,onCancel,onCreated}){
 const [options,setOptions]=useState({categories:[],vats:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const saving=useRef(false),saved=useRef(null);
 useEffect(()=>{let current=true;request(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/new-product-options`).then(data=>{if(current)setOptions(data)}).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[stocktakeId]);
 const save=async(event)=>{
  event.preventDefault();if(saving.current)return;
  const f=new FormData(event.currentTarget);saving.current=true;setBusy(true);setError('');
  try{
   const result=saved.current||await request(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/products`,{method:'POST',body:JSON.stringify({barcode:String(f.get('barcode')).trim(),name:String(f.get('name')).trim(),categoryId:f.get('categoryId'),vatDepartmentId:f.get('vatDepartmentId'),salePrice:Number(f.get('salePrice')),costPrice:Number(f.get('costPrice')),unit:f.get('unit')})});
   saved.current=result;
   await onCreated(result);
  }catch(e){setError(saved.current?'Το είδος αποθηκεύτηκε. Η ανανέωση απέτυχε· πάτησε Επιστροφή στην απογραφή για νέο έλεγχο.':e.message)}finally{saving.current=false;setBusy(false)}
 };
 return <div className="inv-new-product" role="dialog" aria-modal="true" aria-label="Νέο είδος στην απογραφή"><section><header><h2>Νέο είδος</h2><button type="button" disabled={busy} onClick={onCancel} aria-label="Ακύρωση νέου είδους">×</button></header><p>Το είδος θα προστεθεί μόνο στο κατάστημα αυτής της απογραφής. Η ποσότητα καταχωρίζεται στη συνέχεια στην απογραφή.</p><form onSubmit={save}>
 <label>Barcode<input name="barcode" defaultValue={barcode} minLength={3} maxLength={80} autoFocus required readOnly={Boolean(saved.current)}/></label>
 <label>Περιγραφή<input name="name" minLength={2} maxLength={250} required/></label>
 <label>Κατηγορία<select name="categoryId" required disabled={loading} key={`category-${options.categories.length}`}>{options.categories.length?options.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>):<option value="">Δεν υπάρχουν ενεργές κατηγορίες</option>}</select></label>
 <label>Τμήμα ΦΠΑ<select name="vatDepartmentId" required disabled={loading} key={`vat-${options.vats.length}`}>{options.vats.length?options.vats.map(v=><option key={v.id} value={v.id}>{v.description} · {v.vatRate}%</option>):<option value="">Δεν υπάρχουν ενεργά τμήματα ΦΠΑ</option>}</select></label>
 <label>Μονάδα μέτρησης<select name="unit" defaultValue="PIECE"><option value="PIECE">ΤΕΜ</option><option value="KG">KG</option><option value="LITER">LIT</option><option value="PACKAGE">ΣΥΣΚΕΥΑΣΙΑ</option></select></label>
 <label>Τιμή αγοράς<input name="costPrice" type="number" min="0" step="0.01" defaultValue="0" required/></label>
 <label>Τιμή λιανικής<input name="salePrice" type="number" min="0" step="0.01" required/></label>
 {error&&<div className="inv-error" role="alert">{error}</div>}
 <div className="inv-new-product-actions"><button type="button" disabled={busy} onClick={onCancel}>Ακύρωση</button><button type="submit" disabled={busy||loading||!options.categories.length||!options.vats.length}>{busy?'Αποθήκευση…':saved.current?'Επιστροφή στην απογραφή':'Αποθήκευση & επιστροφή στην απογραφή'}</button></div>
 </form></section></div>;
}

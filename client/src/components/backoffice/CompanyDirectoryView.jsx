import React,{useEffect,useRef,useState} from 'react';
import BackofficeStores from './BackofficeStores.jsx';
const routes={'stores.read':'/api/owner-products/stores','suppliers.read':'/api/commerce/suppliers','customers.read':'/api/commerce/customers'};
const fields={'stores.read':['id','name','city','active'],'suppliers.read':['id','name','taxId','email','phone','city','active'],'customers.read':['id','name','phone','email','discountPercent','creditLimit','balance','active']};
function validRow(row,capability){
 if(!row||typeof row.id!=='string'||!row.id||typeof row.name!=='string'||typeof row.active!=='boolean'||Object.keys(row).some(key=>!fields[capability].includes(key)))return false;
 return fields[capability].every(key=>{if(['id','name','active'].includes(key))return true;const value=row[key];if(value==null)return true;if(['discountPercent','creditLimit','balance'].includes(key))return (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));return typeof value==='string'});
}
const money=value=>value==null?'—':Number(value).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export function CompanyContactSummary({row,customer=false}){return <article className="store-card"><h3>{row.name}</h3><p>{row.phone||'—'} · {row.email||'—'}</p>{customer?<><p>Έκπτωση: {row.discountPercent==null?'—':`${row.discountPercent}%`}</p><p>Όριο πίστωσης: {money(row.creditLimit)}</p><p>Υπόλοιπο: {money(row.balance)}</p></>:<><p>ΑΦΜ: {row.taxId||'—'}</p><p>Πόλη: {row.city||'—'}</p></>}<p>{row.active?'Ενεργός':'Ανενεργός'}</p></article>}
export default function CompanyDirectoryView({api,companyId,capability,authorityKey}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0);const sequence=useRef(0);
 const own=JSON.stringify([companyId,capability,authorityKey]);const scope=useRef(own);scope.current=own;
 useEffect(()=>{const n=++sequence.current,controller=new AbortController();setState(null);setError('');const path=routes[capability];if(!path||!companyId)return;
 api(path,{signal:controller.signal,headers:{'x-backoffice-company-id':companyId}}).then(result=>{
  if(n!==sequence.current||scope.current!==own)return;
  if(!result||result.scope!=='COMPANY'||result.companyId!==companyId||Object.keys(result).sort().join(',')!=='companyId,items,scope'||!Array.isArray(result.items)||result.items.some(row=>!validRow(row,capability))||new Set(result.items.map(row=>row.id)).size!==result.items.length)throw Error('Δεν επιβεβαιώθηκε η εταιρική προβολή.');
  setState({own,api,items:result.items});
 }).catch(e=>{if(n===sequence.current&&scope.current===own){setState(null);setError(e.message||'Δεν επιβεβαιώθηκε η εταιρική προβολή.')}});
 return()=>{sequence.current++;controller.abort()};
 },[api,companyId,capability,authorityKey,reload]);
 const rows=state?.own===own&&state.api===api?state.items:null;
 return <section aria-label="Εταιρική προβολή"><button type="button" onClick={()=>{setState(null);setError('');setReload(x=>x+1)}}>Ανανέωση εταιρικής προβολής</button>{error&&<p role="alert">{error}</p>}{!rows&&!error&&<p role="status">Φόρτωση…</p>}{rows&&(capability==='stores.read'?<BackofficeStores rows={rows} readOnly/>:<div className="store-grid">{rows.map(row=><CompanyContactSummary key={row.id} row={row} customer={capability==='customers.read'}/>)}</div>)}{rows?.length===0&&<p>Δεν υπάρχουν καταχωρίσεις.</p>}</section>;
}

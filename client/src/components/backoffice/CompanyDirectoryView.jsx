import React,{useEffect,useRef,useState} from 'react';
import BackofficeStores from './BackofficeStores.jsx';
import CompanyAuditReportsReadView from './CompanyAuditReportsReadView.jsx';
import CompanyReportsReadView from './CompanyReportsReadView.jsx';
import CompanyRoleRegistryReadView from './CompanyRoleRegistryReadView.jsx';
import CompanyBusinessReadView from './CompanyBusinessReadView.jsx';
import CompanyCatalogReadView from './CompanyCatalogReadView.jsx';
import ManagementCompanyReadList from './ManagementCompanyReadList.jsx';
const routes={'stores.read':'/api/owner-products/stores','suppliers.read':'/api/commerce/suppliers','customers.read':'/api/commerce/customers','expense-categories.read':'/api/management/expense-categories','customer-categories.read':'/api/management/customer-categories','professions.read':'/api/management/professions','shipping-methods.read':'/api/management/business-units/shipping-methods','banks.read':'/api/management/business-units/banks'};
const fields={'stores.read':['id','name','city','active'],'suppliers.read':['id','name','taxId','email','phone','city','active'],'customers.read':['id','name','phone','email','discountPercent','creditLimit','balance','active'],'expense-categories.read':['id','description','active','createdAt','updatedAt','usageCount'],'customer-categories.read':['id','description','selectable','allowCredit','saleAtCostOrWholesale','deferred','active','createdAt','updatedAt','usageCount'],'professions.read':['id','code','description','active','createdAt','updatedAt','customerCount'],'shipping-methods.read':['id','code','description','active','createdAt','updatedAt'],'banks.read':['id','internalCode','name','accountingAccount','auxiliaryName','active','createdAt','updatedAt']};
function validRow(row,capability){
 if(capability==='banks.read'&&(row?.active!==true||typeof row.internalCode!=='string'))return false;
 if(!['stores.read','suppliers.read','customers.read'].includes(capability)&&(!row||fields[capability].some(key=>!Object.hasOwn(row,key))))return false;
 if(!row||typeof row.id!=='string'||!row.id||typeof row[capability==='stores.read'||capability==='suppliers.read'||capability==='customers.read'||capability==='banks.read'?'name':'description']!=='string'||typeof row.active!=='boolean'||Object.keys(row).some(key=>!fields[capability].includes(key)))return false;
 return fields[capability].every(key=>{if(['id','name','description','active'].includes(key))return true;const value=row[key];if(value==null)return !(capability==='shipping-methods.read'&&key==='code')&&!['createdAt','updatedAt','usageCount','customerCount','selectable','allowCredit','saleAtCostOrWholesale','deferred'].includes(key);if(['selectable','allowCredit','saleAtCostOrWholesale','deferred'].includes(key))return typeof value==='boolean';if(['usageCount','customerCount'].includes(key))return Number.isSafeInteger(value)&&value>=0;if(['createdAt','updatedAt'].includes(key))return typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;if(['discountPercent','creditLimit','balance'].includes(key))return (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));return typeof value==='string'});
}
const money=value=>value==null?'—':Number(value).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export function CompanyContactSummary({row,customer=false,onOpenSupplier}){return <article className="store-card"><h3>{row.name}</h3><p>{row.phone||'—'} · {row.email||'—'}</p>{customer?<><p>Έκπτωση: {row.discountPercent==null?'—':`${row.discountPercent}%`}</p><p>Όριο πίστωσης: {money(row.creditLimit)}</p><p>Υπόλοιπο: {money(row.balance)}</p></>:<><p>ΑΦΜ: {row.taxId||'—'}</p><p>Πόλη: {row.city||'—'}</p></>}<p>{row.active?'Ενεργός':'Ανενεργός'}</p>{onOpenSupplier&&<button type="button" onClick={()=>onOpenSupplier(row.id)}>Προβολή οικονομικής καρτέλας</button>}</article>}
function CompanySimpleDirectoryView({api,companyId,capability,authorityKey,onOpenSupplier}){
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
 return <section aria-label="Εταιρική προβολή"><button type="button" onClick={()=>{setState(null);setError('');setReload(x=>x+1)}}>Ανανέωση εταιρικής προβολής</button>{error&&<p role="alert">{error}</p>}{!rows&&!error&&<p role="status">Φόρτωση…</p>}{rows&&(capability==='stores.read'?<BackofficeStores rows={rows} readOnly/>:capability.endsWith('-categories.read')||capability==='professions.read'||capability==='shipping-methods.read'||capability==='banks.read'?<ManagementCompanyReadList capability={capability} items={rows}/>:<div className="store-grid">{rows.map(row=><CompanyContactSummary key={row.id} row={row} customer={capability==='customers.read'} onOpenSupplier={capability==='suppliers.read'?onOpenSupplier:undefined}/>)}</div>)}{rows?.length===0&&<p>Δεν υπάρχουν καταχωρίσεις.</p>}</section>;
}

export default function CompanyDirectoryView(props){
 const [supplier,setSupplier]=useState(null);const own=JSON.stringify([props.companyId,props.capability,props.authorityKey]);
 const detailsAllowed=Array.isArray(props.companyCapabilities)&&props.companyCapabilities.includes('supplier-details.read');
 const selected=detailsAllowed&&supplier?.own===own&&supplier.api===props.api?supplier.id:'';
 if(['reports-deactivations.read','reports-logins.read','reports-sale-deletions.read','reports-pos-sale-actions.read','reports-destructions.read','reports-movements.read'].includes(props.capability))return <CompanyAuditReportsReadView {...props}/>;
 if(['reports-price-changes.read','reports-departments.read','reports-documents.read','reports-delivery.read'].includes(props.capability))return <CompanyReportsReadView {...props}/>;
 if(props.capability==='workforce-role-registry.read')return <CompanyRoleRegistryReadView {...props}/>;
 if(['company-products.read','purchases.read','recipes.read','supplier-details.read'].includes(props.capability))return <CompanyBusinessReadView {...props}/>;
 if(['categories.read','vat-departments.read','product-companies.read'].includes(props.capability))return <CompanyCatalogReadView {...props}/>;
 return <><CompanySimpleDirectoryView {...props} onOpenSupplier={props.capability==='suppliers.read'&&detailsAllowed?id=>setSupplier({own,api:props.api,id}):undefined}/>{props.capability==='suppliers.read'&&selected&&<section aria-label="Οικονομική καρτέλα προμηθευτή"><button type="button" onClick={()=>setSupplier(null)}>Κλείσιμο οικονομικής καρτέλας</button><CompanyBusinessReadView key={selected} {...props} capability="supplier-details.read" initialSupplierId={selected}/></section>}</>;
}

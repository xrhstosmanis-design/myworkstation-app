import CompanyCategoryManagement from "./CompanyCategoryManagement.jsx";
import {companyCategoryManageCapability} from "../../../../shared/backoffice-staff-company.mjs";
import React,{useEffect,useRef,useState} from 'react';
const paths={'categories.read':'/api/management/categories','vat-departments.read':'/api/management/vat-departments','product-companies.read':'/api/management/product-companies'};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const text=value=>typeof value==='string';
const nullableText=value=>value===null||text(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const number=value=>typeof value==='number'&&Number.isFinite(value);
const percent=value=>number(value)&&value>=0&&value<=100;
const unique=rows=>Array.isArray(rows)&&new Set(rows.map(row=>row?.id)).size===rows.length;
const identity=row=>row&&text(row.id)&&row.id.length>0&&typeof row.active==='boolean';
const categoryKeys=['id','legacyCode','name','active','subcategoryCount','productCount','percent'];
const subcategoryKeys=['id','categoryId','legacyCode','name','property','points','pluGroup','classification','eshopCode','active','productCount'];
const vatKeys=['id','legacyVatCode','cashRegisterDepartment','description','vatRate','commerce','exemptionCode','exemptionDescription','active','productCount'];
const productCompanyKeys=['id','name','active','systemKey','productCount','percent'];
const proportional=(row,total)=>Math.abs(row.percent-(total?row.productCount*100/total:0))<0.00001;
export function validPayload(data,companyId,capability,categoryId){
 if(data?.scope!=='COMPANY'||data.companyId!==companyId)return false;
 if(capability==='categories.read'){
  if(!exact(data,['scope','companyId','categories','subcategories','totalProducts','selectedCategoryId'])||!count(data.totalProducts)||!unique(data.categories)||!unique(data.subcategories))return false;
  if(data.categories.some(row=>!exact(row,categoryKeys)||!identity(row)||!text(row.name)||!nullableText(row.legacyCode)||!count(row.subcategoryCount)||!count(row.productCount)||!percent(row.percent)||!proportional(row,data.totalProducts)))return false;
  if(data.categories.reduce((sum,row)=>sum+row.productCount,0)!==data.totalProducts)return false;
  if(data.selectedCategoryId===null){if(data.categories.length||data.subcategories.length||categoryId)return false;}else if(!text(data.selectedCategoryId)||!data.categories.some(row=>row.id===data.selectedCategoryId)||categoryId&&categoryId!==data.selectedCategoryId)return false;
  return data.subcategories.every(row=>exact(row,subcategoryKeys)&&identity(row)&&row.categoryId===data.selectedCategoryId&&text(row.name)&&nullableText(row.legacyCode)&&['STOCK_ITEM','NON_STOCK'].includes(row.property)&&number(row.points)&&row.points>=0&&Number.isSafeInteger(row.pluGroup)&&row.pluGroup>=0&&['MERCHANDISE','SERVICE','PRODUCT','FIXED_ASSET'].includes(row.classification)&&nullableText(row.eshopCode)&&count(row.productCount));
 }
 if(capability==='product-companies.read')return exact(data,['scope','companyId','items','totalProducts'])&&count(data.totalProducts)&&unique(data.items)&&data.items.every(row=>exact(row,productCompanyKeys)&&identity(row)&&text(row.name)&&nullableText(row.systemKey)&&count(row.productCount)&&percent(row.percent)&&proportional(row,data.totalProducts))&&data.items.reduce((sum,row)=>sum+row.productCount,0)<=data.totalProducts;
 if(capability==='vat-departments.read')return exact(data,['scope','companyId','items','exemptions'])&&unique(data.items)&&data.items.every(row=>exact(row,vatKeys)&&identity(row)&&nullableText(row.legacyVatCode)&&(row.cashRegisterDepartment===null||Number.isSafeInteger(row.cashRegisterDepartment)&&row.cashRegisterDepartment>=0&&row.cashRegisterDepartment<=9999)&&text(row.description)&&percent(row.vatRate)&&typeof row.commerce==='boolean'&&nullableText(row.exemptionCode)&&nullableText(row.exemptionDescription)&&count(row.productCount))&&Array.isArray(data.exemptions)&&new Set(data.exemptions.map(row=>row?.code)).size===data.exemptions.length&&data.exemptions.every(row=>exact(row,['code','description'])&&text(row.code)&&row.code.length>0&&text(row.description));
 return false;
}
const yes=value=>value?'Ναι':'Όχι';
const pct=value=>value.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
function Table({label,columns,items}){return <div style={{overflowX:'auto'}}><table aria-label={label}><thead><tr>{columns.map(([key,title])=><th key={key} scope="col">{title}</th>)}</tr></thead><tbody>{items.map(row=><tr key={row.id}>{columns.map(([key,,format])=><td key={key}>{format?format(row[key],row):row[key]??'—'}</td>)}</tr>)}</tbody></table></div>}
const categoryColumns=[['legacyCode','Κωδικός'],['name','Περιγραφή'],['subcategoryCount','Υποκατηγορίες'],['productCount','Είδη'],['percent','% ειδών',pct],['active','Ενεργή',yes]];
const propertyLabels={STOCK_ITEM:'Είδη αποθήκης',NON_STOCK:'Μη αποθηκευτικό'};
const classificationLabels={MERCHANDISE:'Εμπόρευμα',SERVICE:'Υπηρεσία',PRODUCT:'Προϊόν',FIXED_ASSET:'Πάγιο'};
const subcategoryColumns=[['name','Περιγραφή'],['property','Ιδιότητα',value=>propertyLabels[value]],['productCount','Είδη'],['points','Πόντοι'],['pluGroup','Ομάδα PLU'],['classification','Χαρακτηρισμός',value=>classificationLabels[value]],['legacyCode','Κωδικός'],['eshopCode','Κωδικός e-shop'],['active','Ενεργή',yes]];
const vatColumns=[['legacyVatCode','ΚΩΔ ΦΠΑ'],['cashRegisterDepartment','Τμήμα Ταμειακής'],['description','Περιγραφή'],['vatRate','% ΦΠΑ',value=>value.toFixed(1)],['productCount','Είδη'],['commerce','Εμπορία',yes],['id','ID'],['exemptionCode','Κωδικός εξαίρεσης'],['exemptionDescription','Περιγραφή εξαίρεσης'],['active','Ενεργό',yes]];
const companyColumns=[['name','Περιγραφή'],['productCount','Είδη'],['percent','% ειδών',pct],['active','Ενεργή',yes]];
export default function CompanyCatalogReadView({api,companyId,capability,authorityKey,companyCapabilities=[]}){
 const [category,setCategory]=useState(null),[state,setState]=useState(null),[error,setError]=useState(null),[reload,setReload]=useState(0),sequence=useRef(0);
 const authority=JSON.stringify([companyId,capability,authorityKey]);const selectedCategory=category?.authority===authority&&category.api===api?category.id:'';
 const own=JSON.stringify([authority,selectedCategory]);const scope=useRef(own);scope.current=own;
 useEffect(()=>{const id=++sequence.current,controller=new AbortController();setState(null);setError(null);if(!companyId||!paths[capability])return;
 const path=paths[capability]+(capability==='categories.read'&&selectedCategory?'?categoryId='+encodeURIComponent(selectedCategory):'');
 api(path,{signal:controller.signal,headers:{'x-backoffice-company-id':companyId}}).then(data=>{if(id!==sequence.current||scope.current!==own)return;if(!validPayload(data,companyId,capability,selectedCategory))throw Error('Δεν επιβεβαιώθηκαν τα εταιρικά στοιχεία και η επιλεγμένη κατηγορία.');setState({own,api,data})}).catch(e=>{if(id===sequence.current&&scope.current===own){setState(null);setError({own,api,message:e.message||'Δεν επιβεβαιώθηκε η εταιρική προβολή.'})}});
 return()=>{sequence.current++;controller.abort()};
 },[api,companyId,capability,authorityKey,selectedCategory,reload]);
 const data=state?.own===own&&state.api===api?state.data:null,visibleError=error?.own===own&&error.api===api?error.message:'';
 return <section aria-label="Εταιρικός κατάλογος"><button type="button" onClick={()=>{sequence.current++;setState(null);setError(null);setReload(x=>x+1)}}>Ανανέωση εταιρικής προβολής</button>{visibleError&&<p role="alert">{visibleError}</p>}{!data&&!visibleError&&<p role="status">Φόρτωση…</p>}{data&&capability==='categories.read'&&<><label>Κατηγορία ειδών<select aria-label="Κατηγορία ειδών" value={data.selectedCategoryId||''} onChange={e=>{sequence.current++;setState(null);setError(null);setCategory({authority,api,id:e.target.value})}}>{!data.categories.length&&<option value="">Δεν υπάρχουν κατηγορίες</option>}{data.categories.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{companyCapabilities.includes(companyCategoryManageCapability)&&<CompanyCategoryManagement key={own} api={api} companyId={companyId} data={data} onSaved={()=>setReload(x=>x+1)}/>}<Table label="Κατηγορίες ειδών" columns={categoryColumns} items={data.categories}/><p>{data.totalProducts} είδη</p><Table label="Υποκατηγορίες ειδών" columns={subcategoryColumns} items={data.subcategories}/>{!data.subcategories.length&&<p>Δεν υπάρχουν υποκατηγορίες στην επιλεγμένη κατηγορία.</p>}</>}{data&&capability==='vat-departments.read'&&<><Table label="Τμήματα ΦΠΑ" columns={vatColumns} items={data.items}/><p>{data.items.length} τμήματα · {data.items.reduce((sum,row)=>sum+row.productCount,0)} είδη</p><details><summary>Εξαιρέσεις ΦΠΑ</summary><ul>{data.exemptions.map(row=><li key={row.code}>{row.code} · {row.description}</li>)}</ul></details></>}{data&&capability==='product-companies.read'&&<><Table label="Εταιρείες προϊόντων" columns={companyColumns} items={data.items}/><p>{data.totalProducts} είδη · {data.totalProducts?'100,00%':'0,00%'}</p></>}{data&&capability!=='categories.read'&&!data.items.length&&<p>Δεν υπάρχουν καταχωρίσεις.</p>}</section>;
}

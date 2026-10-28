import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Search,Settings2,X} from "lucide-react";
import "./store-pos-button-editor.css";
import {matchesGreekSearch} from "../../utils/greek-search.js";

const CHILD_SEP="::MWSCHILD::";
const codesOf=product=>[product?.id,product?.sourceCode,product?.masterCode,product?.sku,...(product?.barcodes||[])].map(String).filter(Boolean);
const parseChildren=button=>{if(Array.isArray(button?.children))return button.children;const raw=String(button?.categoryName||button?.productQuery||"");const at=raw.indexOf(CHILD_SEP);if(at<0)return[];try{return JSON.parse(decodeURIComponent(raw.slice(at+CHILD_SEP.length)))||[]}catch{return[]}};
const baseCategory=button=>String(button?.categoryName||button?.label||"").split(CHILD_SEP)[0];
const packChildren=(name,children)=>`${name}${CHILD_SEP}${encodeURIComponent(JSON.stringify(children))}`;
const layoutIds=layout=>new Set([...(layout.quickKeys||[]),...(layout.categories||[])].map(button=>button?.id).filter(Boolean));
const blankButton=(kind,index,used)=>{const base=`${kind==="quick"?"quick":"category"}-${index+1}`;let id=base,suffix=2;while(used.has(id))id=`${base}-${suffix++}`;used.add(id);return {id,label:"ΚΕΝΟ",emptySlot:true,color:"#168ca0",visible:true,productCodes:[],...(kind==="quick"?{productQuery:""}:{categoryName:"",children:[]})}};

export default function StorePosButtonEditor({api,store,layout,products,enabled,onSaved}){
 const [host,setHost]=useState(null),[choosing,setChoosing]=useState(false),[target,setTarget]=useState(null),[draft,setDraft]=useState(null),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const launcher=useRef(null),dialog=useRef(null),opened=useRef(null),saving=useRef(false),epoch=useRef(0),authority=useRef(null);
 authority.current={api,storeId:store.id,enabled:enabled===true,layout};
 const rows=useMemo(()=>query.trim()?products.filter(p=>matchesGreekSearch(query,[p.name,...codesOf(p)])).slice(0,80):products.slice(0,80),[products,query]);
 useLayoutEffect(()=>{
  const matching=[...document.querySelectorAll("[data-pos-button-editor-store]")].find(node=>node.getAttribute("data-pos-button-editor-store")===store.id);
  const next=enabled?matching||null:null;setHost(current=>current===next?current:next);
 });
 useEffect(()=>{setChoosing(false);setTarget(null);setDraft(null);setBusy(false);setError("");opened.current=null},[store.id,api,enabled]);
 const renderedSession=target?.sessionId||choosing;
 const isCurrent=()=>{const original=opened.current,current=authority.current;return Boolean(original&&original.sessionId===renderedSession&&current.enabled&&current.api===original.api&&current.storeId===original.storeId)};
 const editable=()=>isCurrent()&&opened.current.layout===authority.current.layout;
 const updateDraft=update=>{if(!editable())return;setDraft(current=>editable()?update(current):current)};
 const close=()=>{if(!isCurrent()||saving.current)return;setChoosing(false);setTarget(null);setDraft(null);setError("");opened.current=null;launcher.current?.focus()};
 useEffect(()=>{if(choosing||target)dialog.current?.querySelector("button,input,select,textarea")?.focus()},[choosing,target]);
 const open=(kind,index)=>{
  const current=authority.current;if(!isCurrent()||opened.current.mode!=="chooser"||!editable()||current.api!==api||current.storeId!==store.id||index<0||index>=20)return;
  const button=(kind==="quick"?layout.quickKeys:layout.categories)?.[index]||blankButton(kind,index,layoutIds(layout));
  const sessionId=++epoch.current;opened.current={api,storeId:store.id,layout,sessionId,mode:"draft"};setChoosing(false);setTarget({kind,index,sessionId});setDraft({...button,productCodes:[...(button.productCodes||[])],children:parseChildren(button).map(child=>({...child,productCodes:[...(child.productCodes||[])]}))});setQuery("");setError("");
 };
 const choose=product=>{if(!editable())return;const code=codesOf(product)[0];if(!code)return;updateDraft(current=>({...current,emptySlot:undefined,label:product.name,productQuery:code,productCodes:[code],visible:true}));setQuery(product.name)};
 const addChild=()=>{if(!editable())return;const label=window.prompt("Όνομα νέας υποκατηγορίας");if(!label?.trim())return;updateDraft(current=>({...current,children:[...(current.children||[]),{id:`child-${Date.now()}`,label:label.trim(),categoryName:label.trim(),productCodes:[],color:current.color||"#168ca0",visible:true}]}))};
 const toggleChildProduct=(childIndex,product)=>{if(!editable())return;const codes=codesOf(product),code=codes[0];if(!code)return;updateDraft(current=>({...current,children:current.children.map((child,index)=>index!==childIndex?child:{...child,productCodes:(child.productCodes||[]).some(value=>codes.includes(value))?child.productCodes.filter(value=>!codes.includes(value)):[...(child.productCodes||[]),code]})}))};
 const save=async()=>{
  if(saving.current||!target||!draft)return;
  const original=opened.current,current=authority.current;
  if(!isCurrent()||!original||original.mode!=="draft"||original.sessionId!==target.sessionId||!current.enabled||original.api!==current.api||original.storeId!==current.storeId)return;
  if(original.layout!==current.layout){setError("Η διάταξη άλλαξε. Κλείσε τη ρύθμιση και επίλεξε ξανά το πλήκτρο.");return}
  const next={...layout,quickKeys:[...(layout.quickKeys||[])],categories:[...(layout.categories||[])]},key=target.kind==="quick"?"quickKeys":"categories";
  const used=layoutIds(layout);used.add(draft.id);
  for(let index=0;index<target.index;index++)if(!next[key][index])next[key][index]=blankButton(target.kind,index,used);
  if(target.kind==="quick")next.quickKeys[target.index]={...draft,children:undefined};
  else{const configuredName=String(draft.label||"").trim(),name=configuredName||String(baseCategory(draft)||"ΚΑΤΗΓΟΡΙΑ").trim();next.categories[target.index]={...draft,emptySlot:draft.emptySlot===true&&((configuredName&&configuredName!=="ΚΕΝΟ")||(draft.children||[]).length||(draft.productCodes||[]).length)?undefined:draft.emptySlot,categoryName:packChildren(name,draft.children||[]),children:draft.children||[],visible:true}}
  saving.current=true;setBusy(true);setError("");
  try{
   const result=await api(`/api/store-pos/stores/${store.id}/layout`,{method:"PUT",body:JSON.stringify({layout:next})});
   const latest=authority.current;if(opened.current===original&&latest.enabled&&latest.api===original.api&&latest.storeId===original.storeId&&latest.layout===original.layout){onSaved(result);setTarget(null);setDraft(null);opened.current=null;launcher.current?.focus()}
  }catch(e){const latest=authority.current;if(opened.current===original&&latest.enabled&&latest.api===original.api&&latest.storeId===original.storeId)setError(e.message)}
  finally{saving.current=false;if(authority.current.storeId===original.storeId&&authority.current.api===original.api)setBusy(false)}
 };
 const onKeyDown=event=>{
  if(!isCurrent())return;
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return}
  if(event.key!=="Tab")return;
  const controls=[...event.currentTarget.querySelectorAll("button,input,select,textarea")].filter(node=>!node.disabled&&node.tabIndex>=0),first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 };
 if(!enabled)return null;
 const currentTarget=target&&isCurrent()&&opened.current.mode==="draft";
 return <>
  {host&&createPortal(<button ref={launcher} type="button" className="pos-button-editor-launcher" aria-label="Ρύθμιση πλήκτρων POS" onClick={()=>{const current=authority.current;if(!current.enabled||current.api!==api||current.storeId!==store.id||saving.current||opened.current)return;const sessionId=++epoch.current;opened.current={...current,sessionId,mode:"chooser"};setChoosing(sessionId);setError("")}}><Settings2/><span>Ρύθμιση πλήκτρων</span></button>,host)}
  {choosing&&<div className="pos-button-editor-overlay" onMouseDown={event=>event.target===event.currentTarget&&close()}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="pos-button-slot-title" onKeyDown={onKeyDown}><header><div><small>ΡΥΘΜΙΣΗ ΠΛΗΚΤΡΩΝ POS</small><h2 id="pos-button-slot-title">Επίλεξε θέση για ρύθμιση</h2></div><button type="button" onClick={close} aria-label="Κλείσιμο επιλογής πλήκτρου"><X/></button></header><main className="pos-button-slot-choices">{["quick","category"].map(kind=><section key={kind}><h3>{kind==="quick"?"Γρήγορα προϊόντα":"Κατηγορίες"}</h3><div>{Array.from({length:20},(_,index)=>{const button=(kind==="quick"?layout.quickKeys:layout.categories)?.[index];return <button type="button" key={index} data-pos-edit-kind={kind} data-pos-edit-index={index} onClick={()=>open(kind,index)}><b>{index+1}. {button?.label||"ΚΕΝΟ"}</b><small>{button?.visible===false?"Κρυφό πλήκτρο":"Ρύθμιση θέσης"}</small></button>})}</div></section>)}</main><footer><button type="button" className="cancel" onClick={close}>Επιστροφή στο POS</button></footer></section></div>}
  {currentTarget&&draft&&<div className="pos-button-editor-overlay" onMouseDown={event=>event.target===event.currentTarget&&close()}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="pos-button-edit-title" onKeyDown={onKeyDown}><header><div><small>{target.kind==="quick"?"ΣΥΝΔΕΣΗ ΓΡΗΓΟΡΟΥ ΚΟΥΜΠΙΟΥ":"ΡΥΘΜΙΣΗ ΚΑΤΗΓΟΡΙΑΣ"}</small><h2 id="pos-button-edit-title">{target.kind==="quick"?`Κουμπί ${target.index+1}`:`Κατηγορία ${target.index+1}`}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Κλείσιμο ρύθμισης πλήκτρου"><X/></button></header><main>{error&&<div className="pos-button-editor-error" role="alert">{error}</div>}<div className="pos-button-editor-fields"><label>Όνομα κουμπιού<input value={draft.label||""} onChange={e=>{const value=e.target.value;updateDraft(current=>({...current,label:value}))}}/></label><label>Χρώμα φόντου<input type="color" value={draft.color||"#168ca0"} onChange={e=>{const value=e.target.value;updateDraft(current=>({...current,color:value}))}}/></label><div className="pos-button-preview"><small>ΔΕΙΓΜΑ</small><button type="button" tabIndex={-1} style={{background:draft.color||"#168ca0"}}>{draft.label||"ΚΕΝΟ"}</button></div></div>{target.kind==="quick"?<><label className="pos-button-search"><Search/><input value={query} onChange={e=>{if(editable())setQuery(e.target.value)}} placeholder="Barcode, κωδικός ή περιγραφή προϊόντος"/></label><div className="pos-button-product-list">{rows.map(product=><button type="button" key={product.id} onClick={()=>choose(product)} className={(draft.productCodes||[]).some(c=>codesOf(product).includes(c))?"selected":""}><b>{product.name}</b><small>{codesOf(product).slice(0,3).join(" · ")}</small><strong>{Number(product.salePrice||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"})}</strong></button>)}</div></>:<><div className="pos-button-category-tools"><button type="button" onClick={addChild}>+ Νέα υποκατηγορία</button><span>Η κάτω κατηγορία παραμένει όπως ο ΚΑΦΕΣ: κατηγορία → υποκατηγορία → προϊόντα.</span></div><div className="pos-button-children">{(draft.children||[]).map((child,index)=><article key={child.id||index}><label>Υποκατηγορία<input value={child.label||""} onChange={e=>{const value=e.target.value;updateDraft(current=>({...current,children:current.children.map((x,i)=>i===index?{...x,label:value,categoryName:value}:x)}))}}/></label><label className="pos-button-search"><Search/><input placeholder="Αναζήτηση προϊόντος" onChange={e=>{if(editable())setQuery(e.target.value)}}/></label><div>{rows.slice(0,30).map(product=>{const codes=codesOf(product),selected=(child.productCodes||[]).some(value=>codes.includes(value));return <button type="button" className={selected?"selected":""} key={product.id} onClick={()=>toggleChildProduct(index,product)}>{selected?"✓ ":""}{product.name}</button>})}</div></article>)}</div></>}</main><footer><button type="button" className="cancel" disabled={busy} onClick={close}>Ακύρωση</button><button type="button" className="save" disabled={busy} onClick={save}>{busy?"Αποθήκευση…":"✓ Αποθήκευση"}</button></footer></section></div>}
 </>;
}

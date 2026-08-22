const nativeFetch=window.fetch.bind(window);
const authHeaders=()=>{const token=localStorage.getItem("token")||sessionStorage.getItem("storeOperatorToken");return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}};
async function api(path,body){const r=await nativeFetch(path,{method:"POST",headers:authHeaders(),body:JSON.stringify(body)}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Σφάλμα ${r.status}`);return data}
function field(label,placeholder,attr){const wrap=document.createElement("label");wrap.style.cssText="display:block;margin-top:7px";wrap.innerHTML=`<small style="display:block;font-weight:800;color:#456;margin-bottom:4px">${label}</small><input ${attr} placeholder="${placeholder}" style="width:100%;padding:9px;box-sizing:border-box;border:1px solid #c9d4da;border-radius:7px">`;return wrap}
function enhance(w){if(!w||w.dataset.inlineTaxonomyBound)return;const cat=w.querySelector("[data-category]"),sub=w.querySelector("[data-subcategory]"),save=w.querySelector("[data-save]");if(!cat||!sub||!save)return;w.dataset.inlineTaxonomyBound="1";
  const catField=field("ή γράψε νέα κατηγορία","π.χ. SNACKS","data-new-category");cat.parentElement.appendChild(catField);
  const subField=field("ή γράψε νέα υποκατηγορία","π.χ. ΓΑΡΙΔΑΚΙΑ / CHIPS","data-new-subcategory");sub.parentElement.appendChild(subField);
  const catInput=catField.querySelector("[data-new-category]"),subInput=subField.querySelector("[data-new-subcategory]");
  cat.addEventListener("change",()=>{if(cat.value)catInput.value=""});sub.addEventListener("change",()=>{if(sub.value)subInput.value=""});
  catInput.addEventListener("input",()=>{if(catInput.value.trim())cat.value=""});subInput.addEventListener("input",()=>{if(subInput.value.trim())sub.value=""});
  const original=save.onclick;
  save.addEventListener("click",async event=>{
    const newCategory=catInput.value.trim(),newSubcategory=subInput.value.trim();if(!newCategory&&!newSubcategory)return;
    event.preventDefault();event.stopImmediatePropagation();save.disabled=true;const old=save.textContent;save.textContent="Αποθήκευση κατηγορίας…";
    const error=w.querySelector("[data-error]");if(error)error.style.display="none";
    try{
      if(newCategory){const created=await api("/api/management/categories",{name:newCategory,active:true,legacyCode:""});const option=document.createElement("option");option.value=created.id;option.textContent=newCategory;cat.appendChild(option);cat.value=created.id;catInput.value="";cat.dispatchEvent(new Event("change",{bubbles:true}));}
      if(newSubcategory){if(!cat.value)throw new Error("Επίλεξε ή γράψε πρώτα Κατηγορία.");save.textContent="Αποθήκευση υποκατηγορίας…";const created=await api("/api/management/subcategories",{categoryId:cat.value,name:newSubcategory,active:true,property:"STOCK_ITEM",points:0,pluGroup:0,classification:"MERCHANDISE",eshopCode:"",legacyCode:""});const option=document.createElement("option");option.value=created.id;option.textContent=newSubcategory;sub.appendChild(option);sub.value=created.id;subInput.value="";}
      save.disabled=false;save.textContent=old;if(typeof original==="function")original.call(save,new MouseEvent("click",{bubbles:false,cancelable:true}));
    }catch(e){save.disabled=false;save.textContent=old;if(error){error.style.display="block";error.textContent=e.message}else alert(e.message)}
  },true);
}
function scan(){document.querySelectorAll(".mws-ocr-resolve-overlay").forEach(enhance)}
scan();new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});

const TEXT=v=>String(v??"").replace(/\s+/g," ").trim();
const UPPER=v=>TEXT(v).toLocaleUpperCase("el-GR");
const SKIP_HEADERS=new Set(["","ΕΝΕΡΓΕΙΕΣ","ΕΝΕΡΓΕΙΑ","EDIT","ACTIONS"]);

let activePopup=null;

const closePopup=()=>{if(activePopup){activePopup.remove();activePopup=null}};

const ensureStyle=()=>{
 if(document.getElementById("mws-backoffice-column-filter-style"))return;
 const style=document.createElement("style");
 style.id="mws-backoffice-column-filter-style";
 style.textContent=`
 .mws-col-filter-head{position:relative!important}
 .mws-col-filter-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:20px!important;height:20px!important;margin-left:5px!important;padding:0!important;border:0!important;background:transparent!important;color:currentColor!important;cursor:pointer!important;vertical-align:middle!important;opacity:.82!important}
 .mws-col-filter-btn:hover{opacity:1!important;background:rgba(255,255,255,.13)!important;border-radius:3px!important}
 .mws-col-filter-btn.active{opacity:1!important;color:#ffcc42!important}
 .mws-col-filter-btn svg{width:15px!important;height:15px!important;pointer-events:none!important}
 .mws-col-filter-popup{position:fixed;z-index:2147483000;width:260px;padding:10px;background:#fff;border:1px solid #aebdca;border-radius:7px;box-shadow:0 12px 34px rgba(15,35,55,.28);font:600 13px/1.3 Arial,sans-serif;color:#183047}
 .mws-col-filter-popup label{display:block;margin-bottom:7px;font-weight:900}
 .mws-col-filter-popup input{box-sizing:border-box;width:100%;height:36px;padding:7px 9px;border:1px solid #9daebb;border-radius:4px;font:inherit;color:#182838;background:#fff}
 .mws-col-filter-popup .mws-col-filter-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}
 .mws-col-filter-popup button{min-height:32px;padding:5px 10px;border:1px solid #9fb0bd;border-radius:4px;background:#f7f9fb;color:#17324b;font-weight:900;cursor:pointer}
 .mws-col-filter-popup button.primary{background:#155a84;color:#fff;border-color:#155a84}
 [data-mws-column-filter-hidden="1"]{display:none!important}
 `;
 document.head.appendChild(style);
};

const filterIcon=()=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6.5 7.2V19l-3 1.5v-8.3L4 5z"/></svg>`;

const getNativeRows=table=>{
 const bodies=[...table.tBodies];
 if(bodies.length)return bodies.flatMap(body=>[...body.rows]);
 const rows=[...table.querySelectorAll(":scope > tr")];
 return rows.slice(1);
};

const getNativeHeaders=table=>{
 if(table.tHead?.rows?.length)return [...table.tHead.rows[table.tHead.rows.length-1].cells];
 const row=table.querySelector(":scope > thead > tr:last-child, :scope > tr:first-child");
 return row?[...row.children]:[];
};

const GRID_SPECS=[
 {head:".kiosk-tr.head",rows:":scope > .kiosk-tr:not(.head)"},
 {head:".tr.th",rows:":scope > .tr:not(.th)"},
 {head:".ia-row.head",rows:":scope > .ia-row.data"},
 {head:".mg-product-row.head",rows:":scope > .mg-product-row:not(.head)"},
 {head:".supplier-row.head",rows:":scope > .supplier-row:not(.head)"},
 {head:".om-row.head",rows:":scope > .om-row.data"},
 {head:".mg-category-head",rows:".mg-category-row"},
 {head:".mg-sub-head",rows:".mg-sub-row"},
 {head:".ivr.head",rows:":scope > .ivr:not(.head)"},
 {head:".mbu-row.head",rows:".mbu-list > .mbu-row:not(.head)"},
 {head:".mvat-row.head",rows:".mvat-list > .mvat-row:not(.head)"},
 {head:".mvat-product-row.head",rows:":scope > .mvat-product-row:not(.head)"},
 {head:".mpco-row.head",rows:".mpco-list > .mpco-row:not(.head)"},
 {head:".mpco-product-row.head",rows:":scope > .mpco-product-row:not(.head)"},
 {head:".mcc-row.head",rows:".mcc-list > .mcc-row:not(.head)"},
 {head:".mexp-row.head",rows:".mexp-list > .mexp-row:not(.head)"},
 {head:".mprof-row.head",rows:".mprof-list > .mprof-row:not(.head)"},
 {head:".mmod-group-head",rows:".mmod-list > .mmod-group-row"},
 {head:".mmod-item-head",rows:":scope > .mmod-item-row"},
 {head:".capital-row.head",rows:":scope > .capital-row:not(.head):not(.totals)"},
 {head:".shift-row.head",rows:":scope > .shift-row:not(.head)"},
 {head:".category-row.head",rows:":scope > .category-row:not(.head)"},
 {head:".drawer-row.head",rows:":scope > .drawer-row:not(.head):not(.totals)"}
];

const getGridMeta=head=>{
 const spec=GRID_SPECS.find(item=>head.matches(item.head));
 if(!spec)return null;
 const container=head.parentElement;
 if(!container)return null;
 return {container,headers:[...head.children],rows:()=>[...container.querySelectorAll(spec.rows)]};
};

const getMetaFromHeader=header=>{
 const table=header.closest("table");
 if(table)return {container:table,headers:getNativeHeaders(table),rows:()=>getNativeRows(table)};
 const head=GRID_SPECS.map(item=>header.closest(item.head)).find(Boolean);
 return head?getGridMeta(head):null;
};

const applyFilters=meta=>{
 if(!meta)return;
 const filters=meta.headers.map((h,index)=>({index,value:UPPER(h.dataset.mwsColumnFilter||"")})).filter(x=>x.value);
 for(const row of meta.rows()){
   const cells=[...row.children];
   const matches=filters.every(f=>UPPER(cells[f.index]?.textContent||"").includes(f.value));
   if(matches)row.removeAttribute("data-mws-column-filter-hidden");else row.setAttribute("data-mws-column-filter-hidden","1");
 }
};

const openPopup=(button,header,label)=>{
 closePopup();
 const meta=getMetaFromHeader(header);if(!meta)return;
 const popup=document.createElement("div");
 popup.className="mws-col-filter-popup";
 popup.innerHTML=`<label>Φίλτρο: ${label.replace(/[<>]/g,"")}</label><input type="text" placeholder="Γράψε τι θέλεις να εμφανίζεται"><div class="mws-col-filter-actions"><button type="button" data-clear>Καθαρισμός</button><button type="button" class="primary" data-close>Κλείσιμο</button></div>`;
 const input=popup.querySelector("input");
 input.value=header.dataset.mwsColumnFilter||"";
 const update=()=>{header.dataset.mwsColumnFilter=input.value;button.classList.toggle("active",Boolean(TEXT(input.value)));applyFilters(meta)};
 input.addEventListener("input",update);
 popup.querySelector("[data-clear]").onclick=()=>{input.value="";update();input.focus()};
 popup.querySelector("[data-close]").onclick=closePopup;
 document.body.appendChild(popup);
 const rect=button.getBoundingClientRect();
 const width=260,left=Math.min(Math.max(8,rect.left),window.innerWidth-width-8),top=Math.min(rect.bottom+6,window.innerHeight-150);
 popup.style.left=`${left}px`;popup.style.top=`${Math.max(8,top)}px`;
 activePopup=popup;setTimeout(()=>input.focus(),0);
};

const decorateHeaders=(headers,meta)=>{
 headers.forEach(header=>{
   if(header.dataset.mwsColumnFilterReady==="1")return;
   const label=TEXT(header.textContent);
   header.dataset.mwsColumnFilterReady="1";
   if(SKIP_HEADERS.has(UPPER(label))||header.querySelector('input[type="checkbox"]')||label.length<1)return;
   header.classList.add("mws-col-filter-head");
   const button=document.createElement("button");button.type="button";button.className="mws-col-filter-btn";button.title=`Φίλτρο στήλης: ${label}`;button.setAttribute("aria-label",`Φίλτρο ${label}`);button.innerHTML=filterIcon();
   button.onclick=e=>{e.preventDefault();e.stopPropagation();openPopup(button,header,label)};
   header.appendChild(button);
 });
 applyFilters(meta);
};

const decorate=()=>{
 if(location.pathname.startsWith("/pos/")||location.pathname.startsWith("/store/"))return;
 document.querySelectorAll("table").forEach(table=>{if(table.closest(".mws-col-filter-popup"))return;const headers=getNativeHeaders(table);if(headers.length<2)return;decorateHeaders(headers,{container:table,headers,rows:()=>getNativeRows(table)})});
 GRID_SPECS.forEach(spec=>document.querySelectorAll(spec.head).forEach(head=>{const meta=getGridMeta(head);if(meta&&meta.headers.length>1)decorateHeaders(meta.headers,meta)}));
};

export function installBackofficeColumnFilters(){
 if(window.__mwsBackofficeColumnFiltersInstalled)return;
 window.__mwsBackofficeColumnFiltersInstalled=true;ensureStyle();decorate();
 let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})});observer.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener("pointerdown",e=>{if(activePopup&&!activePopup.contains(e.target)&&!e.target.closest?.(".mws-col-filter-btn"))closePopup()},true);
 window.addEventListener("resize",closePopup);window.addEventListener("scroll",closePopup,true);
}

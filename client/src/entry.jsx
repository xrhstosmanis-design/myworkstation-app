import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import StoreOperatorApp from "./components/store/StoreOperatorWithOnlineOrders.jsx";
import PlatformAdminApp from "./components/platform/PlatformAdminApp.jsx";
import CommercialLicenseCenter from "./components/platform/CommercialLicenseCenter.jsx";
import MasterCatalogCenter from "./components/platform/MasterCatalogCenter.jsx";
import PlatformPromotionCenter from "./components/platform/PlatformPromotionCenter.jsx";
import KatTestCenter from "./components/platform/KatTestCenter.jsx";
import CommerceLauncher from "./components/commerce/CommerceLauncher.jsx";
import CommercialPosApp from "./components/commerce/CommercialPosApp.jsx";
import PosSaleActionsPanel from "./components/commerce/PosSaleActionsPanel.jsx";
import InventoryMobileApp from "./components/inventory/InventoryMobileApp.jsx";
import {installAnalyticsTabs} from "./components/commerce/installAnalyticsTabs.js";
import {installSalesAnalysisSuite} from "./components/commerce/installSalesAnalysisSuite.js";
import {installOwnerPaymentsSuite} from "./components/commerce/installOwnerPaymentsSuite.js";
import {installKioskPaymentsImport} from "./components/commerce/installKioskPaymentsImport.js";
import {installOwnerShiftControlCenter} from "./components/commerce/installOwnerShiftControlCenter.js";
import {installPurchaseOrdersSuite} from "./components/commerce/installPurchaseOrdersSuite.js";
import {installSupplierControlSuite} from "./components/commerce/installSupplierControlSuite.js";
import {installCustomerControlSuiteV2} from "./components/commerce/installCustomerControlSuiteV2.js";
import {installPriceCatalogSuite} from "./components/commerce/installPriceCatalogSuite.js";
import {installPriceCatalogVisibleNav} from "./components/commerce/installPriceCatalogVisibleNav.js";
import {installPromotionStoreScope} from "./components/commerce/installPromotionStoreScope.js";
import {installPromotionStoreGuard} from "./components/commerce/installPromotionStoreGuard.js";
import {installLeafletImport} from "./components/commerce/installLeafletImport.js";
import {installBulkPricePreview} from "./components/commerce/installBulkPricePreview.js";
import {installKioskReportsSuite} from "./components/commerce/installKioskReportsSuite.js";
import {installKioskReportsAuditV2} from "./components/commerce/installKioskReportsAuditV2.js";
import {installPosSaleAuditReport} from "./components/commerce/installPosSaleAuditReport.js";
import {installSupplierProductTransfer} from "./components/commerce/installSupplierProductTransfer.js";
import {installSupplierProductCatalog} from "./components/commerce/installSupplierProductCatalog.js";
import {installSupplierGlobalReports} from "./components/commerce/installSupplierGlobalReports.js";
import {installSupplierBasicExtras} from "./components/commerce/installSupplierBasicExtras.js";
import {installOperatorManagementSuite} from "./components/commerce/installOperatorManagementSuite.js";
import {installTouchKeyboard} from "./components/commerce/installTouchKeyboard.js";
import {installBackofficeColumnFilters} from "./backoffice-column-filters.js";
import {installPosCheckoutSafety} from "./pos-checkout-safety.js";
import {installModuleUiEnforcement} from "./module-ui-enforcement.js";
import {installOwnerPasswordChangeGate} from "./owner-password-change.js";
import "./purchase-order-invoice-supplier-bridge.js";
import "./purchase-order-invoice-create-hotfix.js";
import "./components/platform/platform-security.css";
import "./components/platform/commercial-license.css";
import "./components/platform/platform-audit.css";
import "./components/commerce/myworkstation-analytics-theme.css";
import "./components/commerce/sales-analysis-suite.css";
import "./components/commerce/owner-payments-suite.css";
import "./components/commerce/owner-shift-control-center.css";
import "./components/commerce/purchase-orders-suite.css";
import "./components/commerce/supplier-control-suite.css";
import "./components/commerce/customer-control-suite.css";
import "./components/commerce/price-catalog-suite.css";
import "./components/commerce/kiosk-reports-suite.css";
import "./components/commerce/video-audit-context.css";
import "./components/commerce/pos-sale-audit-report.css";
import "./components/commerce/supplier-product-transfer.css";
import "./components/commerce/supplier-product-catalog.css";
import "./components/commerce/supplier-global-reports.css";
import "./components/commerce/touch-keyboard.css";
import "./components/commerce/commerce-home-modern.css";
import "./styles.css";
import "./components/commerce/price-catalog-visible-nav.css";
import "./components/commerce/promotion-store-scope.css";
import "./components/commerce/promotion-store-guard.css";
import "./components/commerce/leaflet-import.css";
import "./components/commerce/bulk-price-preview.css";

const platformMatch=window.location.pathname.match(/^\/platform-admin\/?$/);
const katTestMatch=window.location.pathname.match(/^\/platform-admin\/kat-test\/?$/);
const posMatch=window.location.pathname.match(/^\/pos\/([^/]+)\/?$/);
const storeMatch=window.location.pathname.match(/^\/store\/([^/]+)\/?$/);
const inventoryMatch=window.location.pathname.match(/^\/inventory\/([^/]+)\/?$/);
const remoteAssistMatch=window.location.pathname.match(/^\/remote-assist\/([^/]+)\/?$/);
const TEST_COMPANY_ID="kat-test-company";
const TEST_STORE_ID="kat-test-store";

const readStored=key=>{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}};
const returnFromStaleTestPos=()=>{
  const back=readStored("posReturnAuth");
  localStorage.removeItem("storeOperatorSession");
  localStorage.removeItem("posReturnAuth");
  if(back?.token){localStorage.setItem("token",back.token);localStorage.setItem("user",JSON.stringify(back.user||{}))}
  else{localStorage.removeItem("token");localStorage.removeItem("user")}
  window.location.replace("/platform-admin");
};

const storeApi=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const text=await response.text();let data={};if(text){try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}}
  if(response.status===401&&storeMatch){localStorage.removeItem("token");localStorage.removeItem("storeOperatorSession");localStorage.removeItem("user");window.location.reload()}
  if(response.status===401&&posMatch){localStorage.removeItem("token");localStorage.removeItem("storeOperatorSession");localStorage.removeItem("user");window.location.reload()}
  if(posMatch&&response.status===404&&data.error==="Δεν βρέθηκε ενεργό κατάστημα."){returnFromStaleTestPos();return new Promise(()=>{})}
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data;
};

function RemoteAssistAcceptance({jobId}){const[code,setCode]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");const accept=async e=>{e.preventDefault();setError("");const response=await fetch(`/api/platform/device-operations/remote/${encodeURIComponent(jobId)}/accept`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});const data=await response.json();if(!response.ok)return setError(data.error||"Ο κωδικός δεν έγινε δεκτός.");setMessage(data.message)};return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#eef3f6",padding:24}}><form onSubmit={accept} style={{width:"min(480px,100%)",background:"white",padding:32,borderRadius:18,boxShadow:"0 20px 60px #1234",display:"grid",gap:16}}><h1>MyWorkStation REMOTE</h1><p>Γράψε τον εξαψήφιο κωδικό που σου έδωσε ο υπεύθυνος υποστήριξης. Η σύνδεση δεν ξεκινά χωρίς τη δική σου αποδοχή.</p><input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" pattern="\d{6}" placeholder="000000" required style={{fontSize:32,textAlign:"center",letterSpacing:8,padding:12}}/><button style={{padding:14,fontWeight:800}}>Αποδοχή REMOTE</button>{error&&<b style={{color:"#b91c1c"}}>{error}</b>}{message&&<b style={{color:"#047857"}}>{message}</b>}<small>Η αποδοχή καταγράφεται. Δεν στέλνονται εντολές σε RBS, EFTPOS ή φορολογικό μηχανισμό.</small></form></main>}

installPosCheckoutSafety();
installTouchKeyboard();
installBackofficeColumnFilters();
installBulkPricePreview();
installPriceCatalogVisibleNav();
installSupplierProductTransfer();
installSupplierProductCatalog();
installSupplierGlobalReports();
installSupplierBasicExtras();
installAnalyticsTabs();
installSalesAnalysisSuite();
installOwnerPaymentsSuite();
installKioskPaymentsImport();
installOwnerShiftControlCenter();
installKioskReportsAuditV2();
const installReportsSafely=()=>{if(!document.querySelector(".commerce-hub"))return;if(!document.querySelector("[data-kiosk-reports-launch]"))installKioskReportsSuite();installPosSaleAuditReport()};
const installPurchaseOrdersSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-purchase-orders-launch]"))return;const NativeObserver=window.MutationObserver;window.MutationObserver=class{observe(){}disconnect(){}};try{installPurchaseOrdersSuite()}finally{window.MutationObserver=NativeObserver}};
const installSupplierControlSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-supplier-control-launch]"))return;installSupplierControlSuite()};
const installCustomerControlSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-customer-control-launch]"))return;installCustomerControlSuiteV2()};
const installPriceCatalogSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-price-catalog-launch]"))return;installPriceCatalogSuite()};
const installPromotionStoreScopeSafely=()=>{if(!document.querySelector(".price-catalog-suite"))return;installPromotionStoreScope()};
const installPromotionStoreGuardSafely=()=>{if(!document.querySelector(".price-catalog-suite"))return;installPromotionStoreGuard()};
const installLeafletImportSafely=()=>{if(!document.querySelector(".price-catalog-suite"))return;installLeafletImport()};
const installOperatorManagementSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-operator-management-launch]"))return;installOperatorManagementSuite(storeApi)};
installReportsSafely();installPurchaseOrdersSafely();installSupplierControlSafely();installCustomerControlSafely();installPriceCatalogSafely();installPromotionStoreScopeSafely();installPromotionStoreGuardSafely();installLeafletImportSafely();installOperatorManagementSafely();
const purchaseOrdersHostObserver=new MutationObserver(()=>{installReportsSafely();installPurchaseOrdersSafely();installSupplierControlSafely();installCustomerControlSafely();installPriceCatalogSafely();installPromotionStoreScopeSafely();installPromotionStoreGuardSafely();installLeafletImportSafely();installOperatorManagementSafely()});
purchaseOrdersHostObserver.observe(document.documentElement,{childList:true,subtree:true});

if(remoteAssistMatch){document.title="MyWorkStation REMOTE";createRoot(document.getElementById("root")).render(<RemoteAssistAcceptance jobId={decodeURIComponent(remoteAssistMatch[1])}/>)}
else if(katTestMatch){document.title="MyWorkStation TEST";createRoot(document.getElementById("root")).render(<KatTestCenter/>)}
else if(inventoryMatch){document.title="MyWorkStation Inventory";createRoot(document.getElementById("root")).render(<InventoryMobileApp stocktakeId={decodeURIComponent(inventoryMatch[1])}/>)}
else if(platformMatch){document.title="MyWorkStation Platform Admin";createRoot(document.getElementById("root")).render(<><PlatformAdminApp/><CommercialLicenseCenter/><MasterCatalogCenter/><PlatformPromotionCenter/></>)}
else if(posMatch){const storeId=decodeURIComponent(posMatch[1]);const stored=readStored("storeOperatorSession");const staleTestSession=stored&&(stored.store?.id!==TEST_STORE_ID||stored.company?.id!==TEST_COMPANY_ID||stored.store?.name!=="TEST"||stored.company?.name!=="TEST"||storeId!==TEST_STORE_ID);document.title="MyWorkStation POS";if(staleTestSession)returnFromStaleTestPos();else createRoot(document.getElementById("root")).render(<><CommercialPosApp api={storeApi} storeId={storeId}/><PosSaleActionsPanel api={storeApi} storeId={storeId}/></>)}
else if(storeMatch){const storeId=decodeURIComponent(storeMatch[1]);document.title="MyWorkStation Store Mode";createRoot(document.getElementById("root")).render(<StoreOperatorApp api={storeApi} storeId={storeId}/>)}
else{installOwnerPasswordChangeGate();installModuleUiEnforcement();import("./main.jsx");const commerceRoot=document.createElement("div");commerceRoot.id="commerce-root";document.body.appendChild(commerceRoot);createRoot(commerceRoot).render(<CommerceLauncher/>)}

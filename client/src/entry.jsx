import React from "react";
import {createRoot} from "react-dom/client";
import PilotReportLauncherLive from "./components/cloud/PilotReportLauncherLive.jsx";
import StoreOperatorApp from "./components/store/StoreOperatorApp.jsx";
import PlatformAdminApp from "./components/platform/PlatformAdminApp.jsx";
import CommercialLicenseCenter from "./components/platform/CommercialLicenseCenter.jsx";
import MasterCatalogCenter from "./components/platform/MasterCatalogCenter.jsx";
import KatTestCenter from "./components/platform/KatTestCenter.jsx";
import CommerceLauncher from "./components/commerce/CommerceLauncher.jsx";
import CommercialPosApp from "./components/commerce/CommercialPosApp.jsx";
import PosSaleActionsPanel from "./components/commerce/PosSaleActionsPanel.jsx";
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
import {installLeafletImport} from "./components/commerce/installLeafletImport.js";
import {installKioskReportsSuite} from "./components/commerce/installKioskReportsSuite.js";
import {installSupplierProductTransfer} from "./components/commerce/installSupplierProductTransfer.js";
import {installSupplierProductCatalog} from "./components/commerce/installSupplierProductCatalog.js";
import {installSupplierGlobalReports} from "./components/commerce/installSupplierGlobalReports.js";
import {installSupplierBasicExtras} from "./components/commerce/installSupplierBasicExtras.js";
import {installOperatorManagementSuite} from "./components/commerce/installOperatorManagementSuite.js";
import {installTouchKeyboard} from "./components/commerce/installTouchKeyboard.js";
import {installPosCheckoutSafety} from "./pos-checkout-safety.js";
import {installModuleUiEnforcement} from "./module-ui-enforcement.js";
import {installOwnerPasswordChangeGate} from "./owner-password-change.js";
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
import "./components/commerce/supplier-product-transfer.css";
import "./components/commerce/supplier-product-catalog.css";
import "./components/commerce/supplier-global-reports.css";
import "./components/commerce/touch-keyboard.css";
import "./components/commerce/commerce-home-modern.css";
import "./styles.css";
import "./components/commerce/price-catalog-visible-nav.css";
import "./components/commerce/promotion-store-scope.css";
import "./components/commerce/leaflet-import.css";

const platformMatch=window.location.pathname.match(/^\/platform-admin\/?$/);
const katTestMatch=window.location.pathname.match(/^\/platform-admin\/kat-test\/?$/);
const posMatch=window.location.pathname.match(/^\/pos\/([^/]+)\/?$/);
const storeMatch=window.location.pathname.match(/^\/store\/([^/]+)\/?$/);
const TEST_COMPANY_ID="kat-test-company";
const TEST_STORE_ID="kat-test-store";

const readStored=key=>{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}};
const returnFromStaleTestPos=()=>{
  const back=readStored("posReturnAuth");
  localStorage.removeItem("storeOperatorSession");
  localStorage.removeItem("posReturnAuth");
  if(back?.token){localStorage.setItem("token",back.token);localStorage.setItem("user",JSON.stringify(back.user||{}))}
  else{localStorage.removeItem("token");localStorage.removeItem("user")}
  window.location.replace("/platform-admin/kat-test");
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

const KatTestQuickAccess=()=> <a href="/platform-admin/kat-test" style={{position:"fixed",right:24,top:86,zIndex:9999,display:"inline-flex",alignItems:"center",gap:8,padding:"13px 20px",borderRadius:12,background:"#0ea5e9",color:"#fff",fontWeight:900,textDecoration:"none",boxShadow:"0 10px 25px rgba(14,165,233,.28)",border:"2px solid rgba(255,255,255,.85)"}}>KAT TEST</a>;

installPosCheckoutSafety();
installTouchKeyboard();
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
const installReportsSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-kiosk-reports-launch]"))return;installKioskReportsSuite()};
const installPurchaseOrdersSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-purchase-orders-launch]"))return;const NativeObserver=window.MutationObserver;window.MutationObserver=class{observe(){}disconnect(){}};try{installPurchaseOrdersSuite()}finally{window.MutationObserver=NativeObserver}};
const installSupplierControlSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-supplier-control-launch]"))return;installSupplierControlSuite()};
const installCustomerControlSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-customer-control-launch]"))return;installCustomerControlSuiteV2()};
const installPriceCatalogSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-price-catalog-launch]"))return;installPriceCatalogSuite()};
const installPromotionStoreScopeSafely=()=>{if(!document.querySelector(".price-catalog-suite"))return;installPromotionStoreScope()};
const installLeafletImportSafely=()=>{if(!document.querySelector(".price-catalog-suite"))return;installLeafletImport()};
const installOperatorManagementSafely=()=>{if(!document.querySelector(".commerce-hub")||document.querySelector("[data-operator-management-launch]"))return;installOperatorManagementSuite(storeApi)};
installReportsSafely();installPurchaseOrdersSafely();installSupplierControlSafely();installCustomerControlSafely();installPriceCatalogSafely();installPromotionStoreScopeSafely();installLeafletImportSafely();installOperatorManagementSafely();
const purchaseOrdersHostObserver=new MutationObserver(()=>{installReportsSafely();installPurchaseOrdersSafely();installSupplierControlSafely();installCustomerControlSafely();installPriceCatalogSafely();installPromotionStoreScopeSafely();installLeafletImportSafely();installOperatorManagementSafely()});
purchaseOrdersHostObserver.observe(document.documentElement,{childList:true,subtree:true});

if(katTestMatch){document.title="MyWorkStation TEST";createRoot(document.getElementById("root")).render(<KatTestCenter/>)}
else if(platformMatch){document.title="MyWorkStation Platform Admin";createRoot(document.getElementById("root")).render(<><PlatformAdminApp/><CommercialLicenseCenter/><MasterCatalogCenter/><KatTestQuickAccess/></>)}
else if(posMatch){const storeId=decodeURIComponent(posMatch[1]);const stored=readStored("storeOperatorSession");const staleTestSession=stored&&(stored.store?.id!==TEST_STORE_ID||stored.company?.id!==TEST_COMPANY_ID||stored.store?.name!=="TEST"||stored.company?.name!=="TEST"||storeId!==TEST_STORE_ID);document.title="MyWorkStation POS";if(staleTestSession)returnFromStaleTestPos();else createRoot(document.getElementById("root")).render(<><CommercialPosApp api={storeApi} storeId={storeId}/><PosSaleActionsPanel api={storeApi} storeId={storeId}/></>)}
else if(storeMatch){const storeId=decodeURIComponent(storeMatch[1]);document.title="MyWorkStation Store Mode";createRoot(document.getElementById("root")).render(<StoreOperatorApp api={storeApi} storeId={storeId}/>)}
else{installOwnerPasswordChangeGate();installModuleUiEnforcement();import("./main.jsx");const launcherRoot=document.getElementById("pilot-report-root");if(launcherRoot)createRoot(document.getElementById("pilot-report-root")).render(<PilotReportLauncherLive/>);const commerceRoot=document.createElement("div");commerceRoot.id="commerce-root";document.body.appendChild(commerceRoot);createRoot(commerceRoot).render(<CommerceLauncher/>)}
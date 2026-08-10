import React,{useEffect,useMemo,useState} from "react";
import {BadgeEuro,Building2,Check,Clock3,Database,Landmark,Mail,MoreHorizontal,PackageSearch,Settings2,ShoppingCart,Truck,Users,X} from "lucide-react";
import "./management-parameters.css";

const primaryTabs=[
  ["business","Αρχείο επιχείρησης",Building2],
  ["banks","Τράπεζες",Landmark],
  ["edelivery","e-Delivery",Truck]
];
const secondaryTabs=[
  ["pos","PoS",BadgeEuro],
  ["backoffice","BackOffice",Database],
  ["shifts","Βάρδιες",Clock3],
  ["customers","Πελάτες",Users],
  ["email","eMail",Mail],
  ["other","Λοιπά",MoreHorizontal],
  ["purchases","Αγορές & παραγγελίες",ShoppingCart]
];
const boolLabels={
  pos:[
    ["showShiftTransactionNumber","Εμφάνιση αριθμού συναλλαγών βάρδιας"],["showShiftNumberWithOperator","α/α βάρδιας μαζί με όνομα χειριστή"],["onlineBarcodeLookup","εύρεση barcode από online βάση δεδομένων"],["showDiscountColumn","Εμφάνιση στήλης «Έκπτωση (%)»"],["showTransactionCode","Εμφάνιση κωδικού συναλλαγής (απόδειξη ΦΗΜΑΣ)"],["reverseProductSort","Αντίστροφη ταξινόμηση ειδών"],["separatorPerScan","Ξεχωριστή γραμμή ανά σκανάρισμα"],["groupReceipt","Ομαδοποίηση στην απόδειξη"],["oneClickCardOrMixedPayment","OneClick στην ΚΑΡΤΑ ή στην μικτή πληρωμή"],["paypod","σύστημα paypod"],["businessUnitsSupplierPayment","business units στην πληρωμή προμηθευτή"],["mixedPaymentConfirmation","Μήνυμα επιβεβαίωσης στη μικτή πληρωμή"],["operatorPinLogin","Χρήση PIN για είσοδο χειριστή"],["fullscreenStart","Έναρξη σε πλήρη οθόνη"],["autoRefreshNoteCounter","Αυτόματη ανανέωση μετρητή σημειώσεων"],["registerZ","Καταχώρηση Z ταμειακής"],["printNonFiscal","Εκτύπωση στον μη φορολογικό εκτυπωτή"],["unlimitedOpenCashiers","Απεριόριστα ταμεία σε αναμονή"],["printOrderItems","Εκτύπωση ειδών παραγγελίας στον εκτυπωτή παραγγελιών"],["askOrderPrint","Ερώτηση για εκτύπωση παραγγελίας"],["hotkeys2","hotkeys [2]"],["hotkeys3","hotkeys [3]"],["hotkeys4","hotkeys [4]"],["hotkeysCategories","hotkeys [Κατηγορίες]"],["lockHotkeys","κλείδωμα hotkeys"],["bottomHotkeys","Κάτω hotkeys"],["barcodeNotFoundSound","Ήχος συστήματος αν δεν βρεθεί το barcode"],["supplierBalanceAfterSale","Άμεση ενημέρωση υπολοίπου προμηθευτή μετά την πώληση είδους με προμήθεια"],["pinOnDeleteLine","PIN στη διαγραφή γραμμής"],["fiscalEftposConfirm","Ταμειακή: επιβεβαίωση συναλλαγής EFT/POS"],["prohibitRetailCustomerSale","απαγόρευση πώλησης στον «Πελάτη Λιανικής»"]
  ],
  backoffice:[
    ["operatorPinLogin","Χρήση PIN για είσοδο χειριστή"],["pinOnlyLogin","Είσοδος μόνο με PIN"],["newProductInitialQuantity","Νέο είδος: εμφάνιση πεδίου «Αρχική ποσότητα»"],["onlineRetailBarcodeCheck","OnLine έλεγχος λιανικής από Barcode"],["autoWildcards","auto wildcards (*)"],["newProductDiscountFields","Νέο είδος: εμφάνιση πεδίων εκπτώσεων"],["archiveLastPurchaseColumn","Αρχείο ειδών: στήλη «Τελευταία αγορά»"],["archiveLastInventoryColumn","Αρχείο ειδών: στήλη «Τελευταία απογραφή»"],["archiveWarehouseCostColumn","Αρχείο ειδών: στήλη με «κόστος αποθήκης»"],["archiveRetailChangeColumn","Αρχείο ειδών: στήλη «Αλλαγή Λιανικής»"],["marginUsesAveragePurchase","Αξία αποθήκης → margin θα υπολογίζεται με τη μέση αγορά"],["inventoryGroupSameBarcode","απογραφή: Ομαδοποίηση για ίδιο barcode"],["leafletOnlyWithCustomerCard","Προσφορές φυλλαδίου: μόνο με κάρτα πελάτη"],["inventorySnapshotAfterFinalization","Στιγμιότυπο αποθήκης μετά από κάθε οριστικοποίηση απογραφής"],["inventoryImmediateNewProduct","Απογραφή: άμεση καταχώρηση νέου είδους, αν δεν υπάρχει"],["archiveAvgA","Αρχείο ειδών: Μ.Ο. (Α)"],["archiveAvgB","Αρχείο ειδών: Μ.Ο. (Β)"],["archiveDaysSinceLastSale","Αρχείο ειδών: ημέρες τελευταίας πώλησης"],["storageAreasEnabled","Αποθηκευτικοί χώροι ενεργοί"],["mandatoryInventorySnapshot","υποχρεωτικό στιγμιότυπο αποθήκης"],["activeShiftsOnly","Εμφάνιση μόνο των ενεργών εγγραφών βαρδιών"],["leafletExcelPriceIncludesVat","Προσφορές φυλλαδίου από excel: τιμή είναι με ΦΠΑ"],["syncBusinessUnits","συγχρονισμός «business units»"],["syncLeafletOffers","συγχρονισμός «προσφορές φυλλαδίου»"],["syncOffersAndGifts","συγχρονισμός «προσφορές και Δώρα»"],["ean8ean13","EAN8/EAN13"],["internalCodeUseSequence","εσωτ. κωδ: χρήση σειράς"],["useInternalCode","χρήση εσωτ. κωδ"]
  ],
  shifts:[
    ["startEachShiftWithCash","Έναρξη κάθε νέας βάρδιας με ταμείο"],["lockStartAmount","Κλείδωμα ποσού έναρξης βάρδιας"],["forbidNewShiftIfOtherOpen","Απαγόρευση νέας βάρδιας, αν υπάρχει και άλλη σε εξέλιξη"],["includeOpeningEftposInCards","να συμπεριλαμβάνεται το EFTPOS έναρξης στις κάρτες"],["warnIfOtherShiftOpen","Μήνυμα, στο άνοιγμα νέας βάρδιας, αν υπάρχει και άλλη σε εξέλιξη"],["showShiftCashAtClose","Εμφάνιση ταμείου βάρδιας στο κλείσιμο"],["notifyShortage","Ειδοποίηση στο έλλειμμα"],["showShortageSurplus","Εμφάνιση ποσού ελλείμματος / πλεονάσματος"],["notifySurplus","Ειδοποίηση στο πλεόνασμα"],["showCashAnalysis","Εμφάνιση ανάλυσης χρηματικού"],["printXNonFiscal","PoS: εκτύπωση X στον μη φορολογικό εκτυπωτή"],["printShiftClose","PoS: εκτύπωση κλεισίματος βάρδιας"],["createInventorySnapshotAtClose","Δημιουργία στιγμιότυπου αποθήκης στο κλείσιμο"],["handoverOnlyCentralCashier","Παράδοση ταμείου μόνο στο κεντρικό ταμείο"],["lockOperatorWithoutBackup","Κλείδωμα χειριστή αν δεν κάνει backup στη βάρδια του"],["forbidCloseIfCashiersWaiting","Απαγόρευση κλεισίματος βάρδιας, αν υπάρχουν ταμεία σε αναμονή"]
  ],
  customers:[
    ["roundPoints","Στρογγυλοποίηση πόντων"],["showAlerts","Εμφάνιση ειδοποιήσεων (alerts)"],["autoCardNumber","αυτόματη απόδοση αριθμού κάρτας"],["redeemInMixedPayment","PoS: εξαργύρωση πόντων στην μικτή πληρωμή"],["turnoverCurrentPreviousYear","υπολογισμός «τζίρος έτους» και «προηγ. έτους»"],["printCustomerPointsFiscal","Να γράφει πελάτη και πόντους στην απόδειξη ταμειακής"],["loyaltyOnly","μόνο με κάρτα loyalty"],["printCustomerPointsNonFiscal","Να γράφει πελάτη και πόντους στον μη φορολογικό εκτυπωτή"],["promoPointsFirst","πόντοι πρώτα από προσφορές φυλλαδίου"],["thermalInvoicePriceIncludesVat","τιμολόγιο σε θερμ. εκτυπωτή: η τιμή να είναι με ΦΠΑ"],["customerPricingPrintBarcode","Τιμολόγηση πελάτη: να γράφει και το barcode κάθε είδους"]
  ],
  email:[
    ["mailOnShiftStart","Έναρξη βάρδιας (PoS)"],["mailOnShiftClose","Κλείσιμο βάρδιας (PoS)"],["mailOnSaleListDelete","Διαγραφή της λίστας πώλησης (PoS)"],["closeMailIncludeCentralCash","Κλείσιμο βάρδιας: να γράφει το κεντρικό ταμείο «Κεφάλαιο» στο email (PoS)"],["attachSalesXlsAfterClose","Αποστολή πωλήσεων ως συνημμένο xls (μετά το κλείσιμο βάρδιας - PoS)"],["invoicePdfToCustomer","Έκδοση τιμολογίου σε πελάτη ως συνημμένο pdf (PoS / Backoffice)"]
  ],
  other:[["labelValueFromSticker","τιμή αξίας από ετικέτα"],["alwaysSellByWeight","Πώληση πάντα με βάρος"]],
  purchases:[
    ["emailHideTotal","Παραγγελίες (email): απόκρυψη Συνόλου"],["newOrderRowsAtEnd","Δημιουργία παραγγελίας: οι νέες εγγραφές στο τέλος"],["purchasePriceLatestSupplier","η τιμή αγοράς να είναι η πιο πρόσφατη, του προμηθευτή"],["excelHideWarehouseColumn","Παραγγελίες: απόκρυψη στήλης «Αποθήκη» (Excel)"],["updateWholesaleWhenRetailChanges","ενημέρωση και της τιμής χονδρικής πώλησης όταν αλλάζει η λιανική"],["excelHidePurchaseAndRetailColumns","Παραγγελίες: απόκρυψη στηλών «αγορά» και «λιανική» (Excel)"],["hideRestockWithoutOrder","Αγορές: απόκρυψη «Αναπλήρωση (άνευ παραγγελίας)»"],["showBarcodeFieldNewOrder","εμφάνιση πεδίου [με barcode] στην νέα παραγγελία"],["scannerAddsQuantityOne","καταχώρηση είδους σε παραγγελία: 1 τμχ με το barcode scanner"],["requireInvoiceNumberNewOrder","Νέα παραγγελία: υποχρεωτική καταχώρηση αριθμού τιμολογίου"]
  ]
};

const field=(label,key,type="text",props={})=>({label,key,type,...props});
const inputFields={
  business:[field("Επωνυμία","name"),field("Διακριτικός τίτλος","tradeTitle"),field("ΑΦΜ","taxId"),field("Αρ ΓΕΜΗ","gemi"),field("Δ.Ο.Υ.","taxOffice"),field("Επάγγελμα","profession"),field("Διεύθυνση","address"),field("Περιοχή / Πόλη","city"),field("ΤΚ","postalCode"),field("ΥΠ/ΜΑ","region"),field("Τηλ.","phone"),field("Κιν1","mobile1"),field("Κιν2","mobile2"),field("Μήνυμα τιμολογίου","invoiceMessage"),field("σλόγκαν","slogan"),field("Περιγραφή καταστήματος","storeDescription"),field("path λογότυπου","logoPath"),field("website","website"),field("κωδικός ERP","erpCode")],
  pos:[field("Μέγεθος γραμματοσειράς περιγραφής","descriptionFontSize","number"),field("Όριο συναλλαγής","transactionLimit","number"),field("PIN διαχειριστή","managerPin","password")],
  backoffice:[field("εκτύπωση μόνο των barcode με ψηφία","barcodePrintDigits","number")],
  shifts:[field("Ποσό έναρξης βάρδιας","startCashAmount","number"),field("Μέγιστο ποσό πλεονάσματος","surplusMaxAmount","number")],
  customers:[field("τζίρου του είδους για κάθε (€)","turnoverPerPoint","number"),field("Πρόθεμα κάρτας πελάτη","cardPrefix"),field("Πόντοι εξαργύρωσης","redeemPoints","number"),field("Ποσό εξαργύρωσης","redeemAmount","number")],
  email:[field("e-mail","businessEmail","email"),field("e-mail (cc)","ccEmails"),field("e-mail υπευθύνου","responsibleEmail","email"),field("Wolt e-Delivery email","woltDeliveryEmail","email")],
  other:[field("Τύπος ζυγού","scaleType"),field("COM Port","scaleComPort"),field("Data Bits","dataBits","number"),field("Stop Bits","stopBits","number"),field("Baud rate","baudRate","number"),field("Πρόθεμα βάρους","weightPrefix"),field("Πρόθεμα αξίας","valuePrefix"),field("Μήνυμα απόδειξης","receiptMessage"),field("Μέγεθος γραμμάτων","hotkeyFontSize","number"),field("Serial scanner port","serialScannerPort"),field("φάκελος αρχείου eShop","eShopFolder"),field("πρόθεμα product_url","productUrlPrefix"),field("Κωδικός τμήματος καρτών κινητής","mobileCardsDepartmentCode"),field("AADE username","aadeUsername")],
  purchases:[field("Πρόταση παραγγελίας (ημέρες από)","proposalDaysFrom","number"),field("έως και","proposalDaysTo","number"),field("Ημέρες (A) υπολογισμού μέσου όρου πωληθέντων","averageSalesDaysA","number"),field("Ημέρες (B) υπολογισμού μέσου όρου πωληθέντων","averageSalesDaysB","number")]
};

const safeSection=(settings,key)=>({...((settings||{})[key]||{})});
function Toggle({checked,onChange,label}){return <label className="mparam-check"><input type="checkbox" checked={Boolean(checked)} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>}
function Choice({value,onChange,options}){return <div className="mparam-choice">{options.map(([v,label])=><label key={v}><input type="radio" checked={value===v} onChange={()=>onChange(v)}/>{label}</label>)}</div>}
function Inputs({section,fields,onField}){return <div className="mparam-input-grid">{fields.map(f=><label key={f.key}><span>{f.label}</span><input type={f.type} value={section[f.key]??""} onChange={e=>onField(f.key,f.type==="number"?(e.target.value===""?"":Number(e.target.value)):e.target.value)}/></label>)}</div>}
function BooleanGrid({section,rows,onField}){return <div className="mparam-check-grid">{rows.map(([key,label])=><Toggle key={key} checked={section[key]} onChange={v=>onField(key,v)} label={label}/>)}</div>}
function IntegrationBadge({label,status}){return <span className={`mparam-integration ${status==="NOT_CONNECTED"?"off":"on"}`}>{label}: {status==="NOT_CONNECTED"?"Μη συνδεδεμένο":"Συνδεδεμένο"}</span>}

function BusinessSection({s,onField,integrations}){return <>
  <div className="mparam-section-title">Στοιχεία επιχείρησης</div>
  <div className="mparam-inline-status"><IntegrationBadge label="ΑΑΔΕ" status={integrations?.aade}/><Toggle checked={s.edpa} onChange={v=>onField("edpa",v)} label="ΕΔΡΑ"/><Toggle checked={s.distinctiveTitleEnabled} onChange={v=>onField("distinctiveTitleEnabled",v)} label="Διακριτικός τίτλος ενεργός"/></div>
  <Inputs section={s} fields={inputFields.business} onField={onField}/>
  <div className="mparam-radio-line"><b>ΦΠΑ:</b><Choice value={s.vatMode||"NORMAL"} onChange={v=>onField("vatMode",v)} options={[["NORMAL","Κανονικό"],["REDUCED","Μειωμένο"]]}/><Toggle checked={s.autoVatUpdate} onChange={v=>onField("autoVatUpdate",v)} label="αυτόματη ενημέρωση %ΦΠΑ τμημάτων"/></div>
</>}
function BanksSection({s,onField}){
  const accounts=Array.from({length:4},(_,i)=>s.bankAccounts?.[i]||{name:"",iban:""});
  const change=(i,key,value)=>{const next=accounts.map((r,idx)=>idx===i?{...r,[key]:value}:r);onField("bankAccounts",next)};
  return <><div className="mparam-section-title">Τραπεζικοί λογαριασμοί</div><div className="mparam-bank-grid">{accounts.map((row,i)=><React.Fragment key={i}><label><span>{i+1}. όνομα:</span><input value={row.name} onChange={e=>change(i,"name",e.target.value)}/></label><label><span>IBAN:</span><input value={row.iban} onChange={e=>change(i,"iban",e.target.value)}/></label></React.Fragment>)}</div></>
}
function EDeliverySection({s,onField,secrets,integrations}){return <>
  <div className="mparam-inline-status"><IntegrationBadge label="e‑Delivery" status={integrations?.edelivery}/></div>
  <div className="mparam-section-title">παράμετροι wolt</div>
  <div className="mparam-input-grid"><label><span>venue_id</span><input value={s.woltVenueId||""} onChange={e=>onField("woltVenueId",e.target.value)}/></label><label><span>username</span><input value={s.woltUsername||""} onChange={e=>onField("woltUsername",e.target.value)}/></label><label><span>base url</span><input value={s.woltBaseUrl||""} onChange={e=>onField("woltBaseUrl",e.target.value)}/></label><label><span>password</span><input type="password" value={s.woltPassword||""} placeholder={secrets?.woltPasswordConfigured?"•••••••• (ρυθμισμένο)":""} onChange={e=>onField("woltPassword",e.target.value)}/></label></div>
  <div className="mparam-section-title">παράμετροι efood</div>
  <div className="mparam-input-grid"><label><span>vendor_id</span><input value={s.efoodVendorId||""} onChange={e=>onField("efoodVendorId",e.target.value)}/></label><label><span>username</span><input value={s.efoodUsername||""} onChange={e=>onField("efoodUsername",e.target.value)}/></label><label><span>url</span><input value={s.efoodUrl||""} onChange={e=>onField("efoodUrl",e.target.value)}/></label><label><span>password</span><input type="password" value={s.efoodPassword||""} placeholder={secrets?.efoodPasswordConfigured?"•••••••• (ρυθμισμένο)":""} onChange={e=>onField("efoodPassword",e.target.value)}/></label></div>
  <Toggle checked={s.syncPriceWithBase} onChange={v=>onField("syncPriceWithBase",v)} label="αλλαγή τιμής, όταν αλλάζει η βασική τιμή"/>
</>}
function PosSection({s,onField,integrations}){return <><div className="mparam-section-title">Παράμετροι πωλήσεων (PoS)</div><div className="mparam-inline-status"><IntegrationBadge label="EFT/POS" status={integrations?.eftpos}/></div><BooleanGrid section={s} rows={boolLabels.pos} onField={onField}/><Inputs section={s} fields={inputFields.pos} onField={onField}/><div className="mparam-radio-stack"><label>στο τιμολόγιο να γράφει</label><Choice value={s.invoiceProductIdentification||"DESCRIPTION"} onChange={v=>onField("invoiceProductIdentification",v)} options={[["DESCRIPTION","μόνο περιγραφή"],["INTERNAL_CODE","εσωτ. κωδικό"],["BARCODE","barcode"]]}/><label>προεπιλογή EFT/POS</label><Choice value={s.fiscalEftposDefault||"NONE"} onChange={v=>onField("fiscalEftposDefault",v)} options={[["NO","ΟΧΙ"],["NONE","κανένα"],["YES","ΝΑΙ"]]}/></div></>}
function BackofficeSection({s,onField}){return <><div className="mparam-section-title">Παράμετροι συστήματος (Backoffice)</div><div className="mparam-radio-line"><b>βάρδιες σε εξέλιξη:</b><Choice value={s.activeShiftDisplay||"USERNAME"} onChange={v=>onField("activeShiftDisplay",v)} options={[["USERNAME","username"],["OPERATOR_NAME","όνομα χειριστή"]]}/></div><BooleanGrid section={s} rows={boolLabels.backoffice} onField={onField}/><Inputs section={s} fields={inputFields.backoffice} onField={onField}/><div className="mparam-radio-stack"><label>Μέση τιμή αγοράς να είναι:</label><Choice value={s.averagePurchaseSource||"INVOICES"} onChange={v=>onField("averagePurchaseSource",v)} options={[["INVOICES","από τιμολόγια αγορών"],["PRODUCT","από τα στοιχεία είδους"]]}/><label>Ετικέτα barcode:</label><Choice value={s.barcodeLabelPrice||"NORMAL"} onChange={v=>onField("barcodeLabelPrice",v)} options={[["NORMAL","Κανονική τιμή"],["LEAFLET","Τιμή φυλλαδίου"]]}/><label>κωδ. ετικέτας barcode:</label><Choice value={s.barcodeLabelCodeSource||"INTERNAL"} onChange={v=>onField("barcodeLabelCodeSource",v)} options={[["SUPPLIER","κωδ. προμηθευτή"],["INTERNAL","εσωτ. κωδικός"]]}/><label>προσφορές φυλλαδίου:</label><Choice value={s.leafletPricePolicy||"KEEP"} onChange={v=>onField("leafletPricePolicy",v)} options={[["KEEP","διατήρηση τιμής"],["UPDATE","ενημέρωση τιμής"]]}/></div></>}
function ShiftsSection({s,onField}){return <><div className="mparam-section-title">Άνοιγμα / κλείσιμο βάρδιας και παράδοση ταμείου</div><BooleanGrid section={s} rows={boolLabels.shifts} onField={onField}/><Inputs section={s} fields={inputFields.shifts} onField={onField}/></>}
function CustomersSection({s,onField}){return <><div className="mparam-section-title">Loyalty και κάρτα πελάτη</div><div className="mparam-radio-stack"><label>Κανόνας πόντων</label><Choice value={s.pointsMode||"TURNOVER"} onChange={v=>onField("pointsMode",v)} options={[["TURNOVER","υπολογισμός με τζίρο"],["QUANTITY","υπολογισμός με ποσότητα"]]}/></div><BooleanGrid section={s} rows={boolLabels.customers} onField={onField}/><Inputs section={s} fields={inputFields.customers} onField={onField}/></>}
function EmailSection({s,onField}){return <><div className="mparam-section-title">e-mail επιχείρησης</div><p className="mparam-help">Με την καταχώρηση του email, δίνεις τη συγκατάθεσή σου να επικοινωνούμε μαζί σου.</p><Inputs section={s} fields={inputFields.email} onField={onField}/><div className="mparam-section-title">Συμβάντα αυτόματης αποστολής e-mail</div><BooleanGrid section={s} rows={boolLabels.email} onField={onField}/></>}
function OtherSection({s,onField,secrets,integrations}){return <><div className="mparam-section-title">Ζυγιζόμενα & ηλεκτρονικός ζυγός</div><BooleanGrid section={s} rows={boolLabels.other} onField={onField}/><Inputs section={s} fields={inputFields.other} onField={onField}/><div className="mparam-radio-line"><b>Parity:</b><Choice value={s.parity||"NONE"} onChange={v=>onField("parity",v)} options={[["NONE","None"],["ODD","Odd"],["EVEN","Even"]]}/></div><div className="mparam-section-title">Παράμετροι ΑΑΔΕ (εύρεση στοιχείων συναλλασσόμενου από ΑΦΜ)</div><div className="mparam-inline-status"><IntegrationBadge label="ΑΑΔΕ" status={integrations?.aade}/></div><label className="mparam-secret"><span>AADE password</span><input type="password" value={s.aadePassword||""} placeholder={secrets?.aadePasswordConfigured?"•••••••• (ρυθμισμένο)":""} onChange={e=>onField("aadePassword",e.target.value)}/></label></>}
function PurchasesSection({s,onField}){return <><div className="mparam-section-title">Παραγγελίες & αγορές</div><BooleanGrid section={s} rows={boolLabels.purchases} onField={onField}/><Inputs section={s} fields={inputFields.purchases} onField={onField}/></>}

export default function ManagementParametersPanel({api,onClose}){
  const [active,setActive]=useState("business"),[settings,setSettings]=useState({}),[company,setCompany]=useState({}),[secrets,setSecrets]=useState({}),[integrations,setIntegrations]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=async()=>{setBusy(true);setError("");try{const data=await api("/api/management/parameters");setCompany(data.company||{});setSecrets(data.secrets||{});setIntegrations(data.integrations||{});const next={...(data.settings||{})};next.business={...safeSection(next,"business"),name:safeSection(next,"business").name??data.company?.name??"",taxId:safeSection(next,"business").taxId??data.company?.taxId??"",city:safeSection(next,"business").city??data.company?.city??"",phone:safeSection(next,"business").phone??data.company?.phone??""};next.email={...safeSection(next,"email"),businessEmail:safeSection(next,"email").businessEmail??data.company?.email??""};setSettings(next)}catch(e){setError(e.message)}finally{setBusy(false)}};
  useEffect(()=>{load()},[]);
  const section=useMemo(()=>safeSection(settings,active),[settings,active]);
  const onField=(key,value)=>setSettings(prev=>({...prev,[active]:{...safeSection(prev,active),[key]:value}}));
  const save=async()=>{setBusy(true);setError("");setMessage("");try{const payload={...section};const data=await api(`/api/management/parameters/${active}`,{method:"PATCH",body:JSON.stringify(payload)});setSecrets(data.secrets||secrets);if(active==="edelivery")setSettings(prev=>({...prev,edelivery:{...safeSection(prev,"edelivery"),woltPassword:"",efoodPassword:""}}));if(active==="other")setSettings(prev=>({...prev,other:{...safeSection(prev,"other"),aadePassword:""}}));setMessage("Οι παράμετροι αποθηκεύτηκαν.");await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
  const renderSection=()=>{
    const p={s:section,onField,secrets,integrations};
    if(active==="business")return <BusinessSection {...p}/>;
    if(active==="banks")return <BanksSection {...p}/>;
    if(active==="edelivery")return <EDeliverySection {...p}/>;
    if(active==="pos")return <PosSection {...p}/>;
    if(active==="backoffice")return <BackofficeSection {...p}/>;
    if(active==="shifts")return <ShiftsSection {...p}/>;
    if(active==="customers")return <CustomersSection {...p}/>;
    if(active==="email")return <EmailSection {...p}/>;
    if(active==="other")return <OtherSection {...p}/>;
    return <PurchasesSection {...p}/>;
  };
  return <div className="mparam-backdrop"><section className="mparam-shell">
    <header><strong><Settings2/> Παράμετροι</strong><button onClick={onClose}><X/></button></header>
    <nav className="mparam-tabs primary">{primaryTabs.map(([key,label,Icon])=><button key={key} className={active===key?"active":""} onClick={()=>{setActive(key);setMessage("")}}><Icon/>{label}</button>)}</nav>
    <nav className="mparam-tabs secondary">{secondaryTabs.map(([key,label,Icon])=><button key={key} className={active===key?"active":""} onClick={()=>{setActive(key);setMessage("")}}><Icon/>{label}</button>)}</nav>
    {error&&<div className="mparam-alert error">{error}</div>}{message&&<div className="mparam-alert success">{message}</div>}
    <main>{busy&&!Object.keys(settings).length?<div className="mparam-loading">Φόρτωση παραμέτρων…</div>:renderSection()}</main>
    <footer><button onClick={onClose}><X/>Κλείσιμο</button><span className="mparam-company">{company?.name||""}</span><button className="save" disabled={busy} onClick={save}><Check/>Καταχώρηση</button></footer>
  </section></div>;
}

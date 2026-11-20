export const companyPartyControlPrefix='/api/backoffice-staff/company/party-control';
const action=(key,label,module,requires=[],description='Βλέπει μόνο τα καταχωρισμένα στοιχεία της εταιρείας, χωρίς μεταβολές, αρχεία ή εξαγωγές.')=>({key,label,module,requires,description});
export const companyPartyControlActions=Object.freeze([
 action('supplier-control-report.read','Πλήρης κατάλογος και υπόλοιπα προμηθευτών','INVENTORY'),
 action('supplier-balances.read','Περιοδικά και τρέχοντα υπόλοιπα προμηθευτών','INVENTORY',['supplier-control-report.read']),
 action('supplier-card.read','Καρτέλα, διευθύνσεις και μονάδες προμηθευτή','INVENTORY',['supplier-control-report.read']),
 action('supplier-ledger.read','Αναλυτικές κινήσεις προμηθευτή','INVENTORY',['supplier-control-report.read']),
 action('supplier-sales.read','Πωλήσεις και αποδόσεις προϊόντων προμηθευτών','INVENTORY',['supplier-control-report.read']),
 action('supplier-catalog.read','Προϊόντα, απόθεμα και κόστος προμηθευτή','INVENTORY',['supplier-control-report.read']),
 action('customer-control-report.read','Κατάλογος πελατών, υπόλοιπα και επιστροφές','CORE'),
 action('customer-card.read','Στοιχεία και διευθύνσεις πελάτη','CORE',['customer-control-report.read']),
 action('customer-ledger.read','Αναλυτική οικονομική καρτέλα πελάτη','CORE',['customer-control-report.read']),
 action('customer-receipts.read','Εισπράξεις πελατών','CORE',['customer-control-report.read']),
 action('customer-loyalty.read','Πόντοι, πλήρης αριθμός κάρτας μέλους και QR πελάτη','CORE',['customer-card.read'],'Βλέπει πόντους και ολόκληρο τον αριθμό κάρτας μέλους/QR που χρησιμοποιείται για αναγνώριση πελάτη και εκπτώσεις με σάρωση. Δεν βλέπει κάρτα εργασίας ή κωδικούς εισόδου.'),
 action('customer-fiscal-status.read','Κατάσταση myDATA και παρόχου πελατών','CORE'),
 action('customer-work-card-status.read','Κατάσταση συνδεδεμένης κάρτας εργασίας πελάτη','CORE',['customer-card.read'],'Βλέπει ονόματα, κατάσταση και τέσσερα τελευταία ψηφία καρτών εργασίας στα καταστήματα της εταιρείας, χωρίς πλήρη κωδικό, σύνδεση ή αλλαγές.')
]);
const fixed={'/suppliers':'supplier-control-report.read','/supplier-balances':'supplier-balances.read','/supplier-sales':'supplier-sales.read','/customers':'customer-control-report.read','/customer-receipts':'customer-receipts.read','/customer-fiscal-status':'customer-fiscal-status.read'};
const dynamic={'suppliers/card':'supplier-card.read','suppliers/ledger':'supplier-ledger.read','suppliers/sales':'supplier-sales.read','suppliers/catalog':'supplier-catalog.read','customers/card':'customer-card.read','customers/ledger':'customer-ledger.read','customers/loyalty':'customer-loyalty.read','customers/work-card-status':'customer-work-card-status.read'};
export function companyPartyControlRequest(method,path){if(method!=='GET'||typeof path!=='string'||/[?#]/.test(path)||!path.startsWith(companyPartyControlPrefix+'/'))return null;const suffix=path.slice(companyPartyControlPrefix.length);if(fixed[suffix])return {capability:fixed[suffix]};const m=/^\/(suppliers|customers)\/([^/]+)\/(card|ledger|sales|catalog|loyalty|work-card-status)$/.exec(suffix);if(!m)return null;let partyId;try{partyId=decodeURIComponent(m[2])}catch{return null}if(!partyId||partyId.trim()!==partyId||partyId.length>160||['.','..'].includes(partyId)||/[\x00-\x1f\x7f/\\?#]/.test(partyId))return null;const capability=dynamic[m[1]+'/'+m[3]];return capability?{capability,partyId,partyType:m[1]==='suppliers'?'Supplier':'Customer'}:null}
const texts=keys=>Object.fromEntries(keys.split(' ').map(k=>[k,'text?'])),numbers=keys=>Object.fromEntries(keys.split(' ').map(k=>[k,'number']));
export const supplierCardFields={id:'text',name:'text',...texts('taxId email phone address city taxOffice legacyCode erpCode profession mobile fax sellerName accountingCode supplierCategory scope paymentPreference vatMode notes chargeAddress'),active:'boolean',myfEnabled:'boolean',createdAt:'date',updatedAt:'date'};
export const supplierControlFields={id:'text',name:'text',legacyCode:'text?',taxId:'text?',active:'boolean',...numbers('allPurchases payments adjustments currentYear previousYear balance')};
export const customerCardFields={id:'text',name:'text',...texts('taxId phone email legacyCode address city customerType notes discountAudience'),...numbers('discountPercent creditLimit balance'),active:'boolean',createdAt:'date',updatedAt:'date'};
export const customerControlFields={id:'text',name:'text',legacyCode:'text?',taxId:'text?',customerType:'text?',active:'boolean',balance:'number',visits:'integer',...numbers('currentYear previousYear returnsCurrentYear')};
export const partyAddressFields={id:'text',...texts('label city postalCode phone'),address:'text',isPrimary:'boolean',createdAt:'date',updatedAt:'date'};
export const supplierUnitFields={id:'text',name:'text',...texts('code email phone'),active:'boolean',createdAt:'date',updatedAt:'date'};
export const supplierBalanceFields={supplierId:'text',supplierName:'text',taxId:'text?',...numbers('invoiceGross creditGross payments adjustments periodNet balance')};
export const supplierSalesFields={supplierId:'text',supplierName:'text',transactions:'integer',items:'integer',...numbers('sales cost profit vatSales margin percentOfSales')};
export const supplierSalesItemFields={productId:'text',name:'text',sku:'text?',supplierCode:'text?',...numbers('quantity sales vatSales currentStock lastCost avgCost averageSale profitWithAverage profitWithLast margin')};
export const supplierCatalogFields={id:'text',name:'text',...texts('sku unit categoryName supplierCode linkSource'),...numbers('vatRate salePrice avgCost lastCost currentStock'),purchaseCount:'integer',active:'boolean',lastPurchaseAt:'date?',linkUpdatedAt:'date?'};
export const customerReceiptFields={id:'text',createdAt:'date',updatedAt:'date',amount:'number',...texts('note referenceType referenceId actorName storeId storeName taxId'),customerId:'text',customerName:'text'};
export const supplierLedgerFields={id:'text',at:'date',type:'text',ref:'text?',amount:'number',balance:'number'};
export const customerLedgerFields={id:'text',at:'date',type:'text',...numbers('amount debtDelta debit credit runningBalance'),...texts('reference storeName note originalSaleId saleSource transactionMode reversalKind paymentMethod items'),recordKind:'text'};
export const workCardLinkFields={credentialId:'text',displayName:'text',cardCodeLast4:'text?',active:'boolean',employeeActive:'boolean'};
export const workCardOptionFields={credentialId:'text',displayName:'text',cardCodeLast4:'text?',linkedToThisCustomer:'boolean',linkedToOtherCustomer:'boolean'};

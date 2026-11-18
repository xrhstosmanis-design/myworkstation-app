export const companyProductCenterPrefix='/api/backoffice-staff/company/product-center';
const action=(key,label,module='INVENTORY',requires=['product-center.read'],description='Βλέπει καταχωρισμένα στοιχεία και τιμές προϊόντος, χωρίς αλλαγές, εισαγωγή, εκτύπωση ή εντολές.')=>({key,label,module,requires,description});
export const companyProductCenterActions=Object.freeze([
 action('product-center.read','Κατάλογος ενεργών προϊόντων Owner','INVENTORY',[]),
 action('product-card.read','Καρτέλα προϊόντος, κόστος και στοιχεία καταστημάτων'),
 action('product-barcodes.read','Καταχωρισμένα barcode προϊόντος'),
 action('product-details.read','Αρχείο προμηθευτών, αγορών και στατιστικών προϊόντος'),
 action('product-set.read','Συστατικά SET προϊόντος',null,[],'Βλέπει ονόματα προϊόντων και καταχωρισμένα συστατικά SET, ποσότητες και τιμές. Δεν αλλάζει σύνθεση ή συνταγή.'),
 action('product-stock-package.read','Καταχωρισμένη συσκευασία προϊόντος ανά κατάστημα',null,[],'Βλέπει ονόματα προϊόντων/καταστημάτων και την υφιστάμενη συσκευασία. Μη διαθέσιμο όταν η πηγή δεν έχει εγκατασταθεί.'),
 action('product-delivery.read','Ρυθμίσεις και τιμές delivery προϊόντος'),
 action('product-price-history.read','Ιστορικό μεταβολών τιμής προϊόντος'),
 action('product-audience-discounts.read','Τρέχουσες εκπτώσεις κοινού και ιστορικό','INVENTORY',['stores.read']),
 action('price-catalog.read','Τιμοκατάλογος προϊόντων και υπολογισμοί κόστους','INVENTORY',[],'Βλέπει εταιρικές τιμές, προαιρετική τιμή πώλησης ιδιόκτητου καταστήματος και περιθώρια με εταιρικό κόστος. Ο κατάλογος ονομάτων καταστημάτων παραχωρείται ξεχωριστά.'),
 action('customer-wholesale-prices.read','Ειδικές τιμές πελατών και περιθώρια','INVENTORY',[],'Βλέπει ονόματα πελατών, ειδικές τιμές, κόστος και περιθώρια στον εταιρικό τιμοκατάλογο. Δεν απαιτεί το ανεξάρτητο B2B module.'),
 action('product-purchases.read','Παραγγελίες αγοράς προϊόντος ανά κατάστημα','INVENTORY',['product-center.read','stores.read'])
]);
const fixed={'/catalog':'product-center.read','/set-options':'product-set.read','/package-options':'product-stock-package.read','/audience-discounts':'product-audience-discounts.read','/price-catalog':'price-catalog.read','/customer-wholesale-prices':'customer-wholesale-prices.read'};
const suffixes={card:'product-card.read',barcodes:'product-barcodes.read',details:'product-details.read',set:'product-set.read','stock-package':'product-stock-package.read',delivery:'product-delivery.read','price-history':'product-price-history.read',purchases:'product-purchases.read'};
export function companyProductCenterRequest(method,path){if(method!=='GET'||typeof path!=='string'||/[?#]/.test(path)||!path.startsWith(companyProductCenterPrefix+'/'))return null;const suffix=path.slice(companyProductCenterPrefix.length);if(fixed[suffix])return{capability:fixed[suffix],options:suffix.endsWith('-options')};const m=/^\/products\/([^/]+)\/([^/]+)$/.exec(suffix);if(!m||!suffixes[m[2]])return null;let id;try{id=decodeURIComponent(m[1])}catch{return null}if(!id||id.length>200||id.trim()!==id||['.','..'].includes(id)||/[\x00-\x1f\x7f/\\?#]/.test(id))return null;return{capability:suffixes[m[2]],productId:id}}
const texts=keys=>Object.fromEntries(keys.split(' ').map(k=>[k,'text?'])),nums=keys=>Object.fromEntries(keys.split(' ').map(k=>[k,'number'])),flags=keys=>Object.fromEntries(keys.split(' ').map(k=>[k,'boolean']));
export const productCenterCatalogFields={id:'text',name:'text',sku:'text?',unit:'text',salePrice:'number',categoryName:'text?',active:'boolean'};
export const productCenterCardFields={id:'text',name:'text',...texts('sku description categoryName subcategoryName productCompanyName vatDepartmentName'),unit:'text',...nums('salePrice costPrice vatRate discountA discountB discountC'),staffPrice:'number?',deliveryPrice:'number?',minOrderQuantity:'number?',capacity:'number?',...flags('vatVerified trackStock active allowDiscount allowPosPriceChange freeSalePrice negativeStockWarning isSet isRecipe')};
export const productCenterStoreFields={storeId:'text',storeName:'text',salePrice:'number',active:'boolean',currentStock:'number',minStock:'number'};
export const productCenterBarcodeFields={id:'text',barcode:'text',unitMultiplier:'number',salePrice:'number?',name:'text?',updatedAt:'date'};
export const productCenterSupplierCodeFields={id:'text',supplierId:'text',supplierName:'text',supplierCode:'text?',updatedAt:'date',lastCost:'number',lastPurchaseAt:'date?'};
export const productCenterPurchaseFields={id:'text',documentNumber:'text?',documentDate:'date',supplierId:'text?',supplierName:'text?',...nums('quantity unitCost netAmount vatRate vatAmount grossAmount'),unit:'text',unitsPerPackage:'number?',createdAt:'date'};
export const productCenterStatisticFields={...nums('soldQuantity salesGross salesNet currentStock purchaseQuantity purchasesNet purchasesGross'),lastSaleAt:'date?',lastStocktakeAt:'date?',lastPriceChangeAt:'date?'};
export const productCenterSetFields={id:'text',relatedProductId:'text?',relatedName:'text?',relatedSku:'text?',unit:'text?',quantity:'number',salePrice:'number?',defaultSalePrice:'number?',updatedAt:'date',updatedByName:'text?',unavailable:'boolean'};
export const productCenterDeliveryFields={id:'text',name:'text',isModifier:'boolean',modifierGroup:'text?',isService:'boolean',eDeliveryEnabled:'boolean',efoodEnabled:'boolean',woltEnabled:'boolean',publishStock:'boolean',publishPrices:'boolean',efoodPrice:'number?',woltPrice:'number?'};
export const productCenterPriceHistoryFields={id:'text',oldPrice:'number?',newPrice:'number?',changeType:'text',createdAt:'date',storeName:'text?'};
export const productCenterOrderPurchaseFields={id:'text',orderId:'text',status:'text',invoiceNumber:'text?',createdAt:'date',invoicedAt:'date?',supplierName:'text',...nums('quantity unitCost initialUnitCost discount1 discount2 discount3 exciseTotal vatRate netAmount vatAmount grossAmount')};

export const productCenterPriceCatalogFields={id:'text',sku:'text?',name:'text',vatRate:'number',active:'boolean',categoryName:'text?',subcategoryName:'text?',salePrice:'number',lastCost:'number',lastPurchaseAt:'date?',lastSupplierName:'text?',barcode:'text',saleNet:'number',margin:'number',markup:'number'};
export const productCenterWholesaleFields={id:'text',customerId:'text',productId:'text',wholesalePrice:'number',active:'boolean',customerName:'text',sku:'text?',productName:'text',salePrice:'number',vatRate:'number',lastCost:'number',lastPurchaseAt:'date?',wholesaleNet:'number',retailNet:'number',customerMargin:'number',productMargin:'number'};

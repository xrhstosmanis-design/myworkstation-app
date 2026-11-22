export const companyWholesalePrefix='/api/backoffice-staff/company/wholesale-config';
const action=(key,label,requires=[],description='Βλέπει μόνο τα καταχωρισμένα εταιρικά στοιχεία χονδρικής, χωρίς αλλαγές, παραγγελίες ή ενεργοποίηση πρόσβασης.')=>({key,label,requires,description,module:'WHOLESALE_B2B'});
export const companyWholesaleActions=Object.freeze([
 action('wholesale-customers.read','Πελάτες χονδρικής και εμπορικοί όροι'),
 action('wholesale-price-lists.read','Τιμοκατάλογοι χονδρικής και κλίμακες τιμών'),
 action('wholesale-site.read','Δημόσια στοιχεία και κατάσταση ιστοτόπου χονδρικής'),
 action('wholesale-portal-accounts.read','Κατάλογος προσβάσεων πελατών χονδρικής',[],'Βλέπει ονόματα σύνδεσης πελατών, κατάστημα και κατάσταση πρόσβασης, χωρίς συνθηματικά, συνεδρίες ή αλλαγές.'),
 action('wholesale-publications.read','Κατάσταση δημοσίευσης προϊόντων χονδρικής',['wholesale-site.read','wholesale-store-options.read']),
 action('wholesale-sellers.read','Πωλητές χονδρικής και κατάσταση μέλους',[],'Βλέπει ονόματα, email, ρόλους και κατάσταση πωλητών της εταιρείας, χωρίς κωδικούς ή αλλαγές.'),
 action('wholesale-seller-assignments.read','Αναθέσεις πελατών σε πωλητές χονδρικής',['wholesale-sellers.read','wholesale-store-options.read']),
 action('wholesale-store-options.read','Επιλογή καταστήματος προβολών χονδρικής',[],'Βλέπει μόνο ονόματα ενεργών καταστημάτων για τις εταιρικές προβολές χονδρικής.')
]);
const fixed={'/customers':'wholesale-customers.read','/price-lists':'wholesale-price-lists.read','/site':'wholesale-site.read','/portal-accounts':'wholesale-portal-accounts.read','/publications':'wholesale-publications.read','/sellers':'wholesale-sellers.read','/stores':'wholesale-store-options.read'};
export function companyWholesaleRequest(method,path){if(method!=='GET'||typeof path!=='string'||/[?#]/.test(path)||!path.startsWith(companyWholesalePrefix+'/'))return null;const suffix=path.slice(companyWholesalePrefix.length);if(fixed[suffix])return{capability:fixed[suffix]};const m=/^\/(price-lists|sellers)\/([^/]+)\/(products|assignments)$/.exec(suffix);if(!m||m[1]==='price-lists'&&m[3]!=='products'||m[1]==='sellers'&&m[3]!=='assignments')return null;let id;try{id=decodeURIComponent(m[2])}catch{return null}if(!id||id.length>200||id.trim()!==id||['.','..'].includes(id)||/[\x00-\x1f\x7f/\\?#]/.test(id))return null;return{capability:m[1]==='price-lists'?'wholesale-price-lists.read':'wholesale-seller-assignments.read',id}}
export const wholesaleCustomerFields={id:'text',code:'text?',name:'text',taxId:'text?',creditLimit:'number',paymentTermsDays:'integer',active:'boolean',priceListId:'text?',priceListName:'text?',priceListActive:'boolean?'};
export const wholesalePriceListFields={id:'text',code:'text',name:'text',discountPercent:'number',active:'boolean'};
export const wholesaleTierFields={id:'text',productId:'text',sku:'text?',name:'text',minimumQuantity:'number',unitPrice:'number?',discountPercent:'number?',priceBasis:'text?',version:'integer',updatedAt:'date'};
export const wholesaleSiteFields={slug:'text',name:'text',enabled:'boolean'};
export const wholesaleAccountFields={id:'text',login:'text',customerId:'text',storeId:'text',active:'boolean',customerName:'text',storeName:'text'};
export const wholesalePublicationFields={id:'text',name:'text',sku:'text?',unit:'text?',published:'boolean'};
export const wholesaleSellerFields={id:'text',fullName:'text',email:'text',role:'text',memberActive:'boolean',membershipRevision:'integer'};
export const wholesaleAssignmentFields={id:'text',userId:'text',customerId:'text',storeId:'text',customerName:'text',storeName:'text',active:'boolean',revision:'integer',updatedAt:'date'};

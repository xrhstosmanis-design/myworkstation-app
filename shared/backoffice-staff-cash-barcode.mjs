export const cashBarcodeActions=Object.freeze([
 {key:'cash-daily-summary.read',label:'Ημερήσια σύνοψη και συμφωνία ταμείων',modules:['CASH_CONTROL'],requires:[],description:'Βλέπει τις κλειστές βάρδιες, ποσά, αποκλίσεις και ευρήματα της επιλεγμένης περιόδου στο κατάστημα. Η κάλυψη παραμένει προσωρινή.'},
 {key:'cash-session-investigation.read',label:'Παθητική διερεύνηση επιλεγμένης βάρδιας',modules:['CASH_CONTROL'],requires:['cash-daily-summary.read'],description:'Βλέπει την οικονομική διερεύνηση επιλεγμένης βάρδιας. Περιλαμβάνει καταγεγραμμένα στοιχεία παράδοσης και πρόσφατα συνημμένα συνομιλίας μόνο με ξεχωριστή προβολή τσατ. Δεν επιβεβαιώνει ευρήματα ούτε στέλνει εντολές.'},
 {key:'barcode-price-requests.read',label:'Αιτήματα αλλαγής τιμής barcode',modules:['STORE_MODE'],requires:[],description:'Βλέπει είδος, barcode, παλιά/ζητούμενη τιμή και όνομα αιτούντος, χωρίς έγκριση ή απόρριψη.'},
 {key:'barcode-sales.read',label:'Πωλήσεις ανά barcode',modules:['STORE_MODE'],requires:[],description:'Βλέπει ποσότητες και τζίρο ανά είδος/barcode στο επιλεγμένο κατάστημα και διάστημα.'}
]);
export const barcodeRequestFields={id:'text',productId:'text',productName:'text',barcode:'text',oldPrice:'number?',requestedPrice:'number',requestedByName:'text?',status:'text',createdAt:'date'};
export const barcodeProductFields={productId:'text',productName:'text',sku:'text?',quantity:'number',revenue:'number'};
export const cashDailySessionFields={id:'text',terminalPos:'text?',shiftLabel:'text?',openedAt:'date',closedAt:'date?',openedByName:'text?',closedByName:'text?',cashSales:'number',cardSales:'number',eftposTotal:'number',variance:'number?',effectiveVariance:'number',cardVariance:'number'};

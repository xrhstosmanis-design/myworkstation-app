export const businessDomains={
 TRANSFERS_TO_OWNER:'Μετρητά προς ιδιοκτήτη',TRANSFERS_FROM_OWNER:'Εισφορές ιδιοκτήτη στο ταμείο',TRANSFERS:'Μεταφορές μετρητών',
 PAYMENTS:'Πληρωμές και έξοδα',SUPPLIER_PAYMENTS:'Πληρωμές προμηθευτών',EXPENSES:'Λοιπά έξοδα',INVOICES:'Παραστατικά αγορών',SUPPLIERS:'Προμηθευτές καταστήματος',
 CASH_SHIFTS:'Βάρδιες ταμείων',STAFF:'Προσωπικό Workforce',POS_EVENTS:'Συμβάντα ενεργειών POS',BANK_MOVEMENTS:'Καταχωρημένες τραπεζικές κινήσεις'
};
export const businessMoneyDomains=['TRANSFERS_TO_OWNER','TRANSFERS_FROM_OWNER','TRANSFERS','PAYMENTS','SUPPLIER_PAYMENTS','EXPENSES','BANK_MOVEMENTS'];
export const currentBusinessDomains=['SUPPLIERS','STAFF'];
export const normalizeBusinessText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR').replace(/\s+/g,' ').trim();
export function assistantBusinessDomain(value){
 const [first,...lines]=String(value??'').split('\n');
 const current=classifyBusinessDomain(first);
 if(current)return current;
 const prefix='Προηγούμενο θέμα της ίδιας συνομιλίας: ';
 const topic=lines.find(l=>l.startsWith(prefix));
 return topic?classifyBusinessDomain(topic.slice(prefix.length)):null;
}
function classifyBusinessDomain(value){
 const q=normalizeBusinessText(value);
 if(/^(τι ειναι|τι σημαινει|πως |που )/.test(q))return null;
 if(/μεταφορ/.test(q)&&!/προιον|ειδων|τεμαχι|αποθηκ|στοκ/.test(q))return /ιδιοκτητ/.test(q)?/απο (?:τον )?ιδιοκτητ|εισφορ(?:ες|α)? (?:του )?ιδιοκτητ|ιδιοκτητ.*(?:προς|στο) ταμει/.test(q)?'TRANSFERS_FROM_OWNER':'TRANSFERS_TO_OWNER':'TRANSFERS';
 if(/καταθεσ|τραπεζικ.*κινησ|κιν[ηε]σ.*τραπεζ/.test(q))return 'BANK_MOVEMENTS';
 if(/τιμολογ|παραστατικ|αγορες/.test(q)&&!/πληρωμ|εξοφλ/.test(q))return 'INVOICES';
 if(/πληρωμ|εξοφλ/.test(q)&&!/μισθοδ|υπερωρ|προκαταβολ|ρεπο/.test(q))return /προμηθευτ|τιμολογ/.test(q)?'SUPPLIER_PAYMENTS':'PAYMENTS';
 if(/εξοδ|δαπαν/.test(q))return 'EXPENSES';
 if(/προμηθευτ/.test(q)&&!/τιμη|φθηνο|συγκρι|κοστο/.test(q))return 'SUPPLIERS';
 if(/προσωπικ|εργαζομεν|υπαλληλ/.test(q)&&!/ιδιοκαταναλ|καταναλ|πωλ|ταμει|προγραμμα|μισθοδ|βαρδι|πληρωμ|υπερωρ|ωρες/.test(q))return 'STAFF';
 if(/βαρδι/.test(q)&&!/προγραμμα|εργαζομεν|υπαλληλ|ελλειμ|διαφορ|κλεισιμ|ελεγχο/.test(q))return 'CASH_SHIFTS';
 if(/συμβαν|ενεργει.*pos|audit/.test(q))return 'POS_EVENTS';
 return null;
}

export const businessRecordLabel=v=>({TRANSFER_OUT:'Μετρητά προς ιδιοκτήτη',TRANSFER_AMOUNT:'Εισφορά στο ταμείο',SUPPLIER_PAYMENT:'Πληρωμή προμηθευτή',OTHER_EXPENSE:'Λοιπό έξοδο',CASH_DEPOSIT:'Κατάθεση μετρητών',POS_SETTLEMENT:'Εκκαθάριση POS',IRIS_SETTLEMENT:'Εκκαθάριση IRIS',BANK_TRANSFER:'Τραπεζική μεταφορά',CORPORATE_CARD:'Εταιρική κάρτα',INVOICE:'Τιμολόγιο',CREDIT_NOTE:'Πιστωτικό',SELF_CONSUMPTION:'Ιδιοκατανάλωση',PRODUCT_DESTRUCTION:'Καταστροφή προϊόντων',PRICE_CHANGE:'Αλλαγή τιμής',PERMANENT_PRICE_CHANGE:'Μόνιμη αλλαγή τιμής',POS_RETURN:'Επιστροφή',POS_RETURN_ITEMS:'Μερική επιστροφή',POS_SALE_COMPLETED:'Ολοκλήρωση πώλησης',CART_ITEM_ADD:'Προσθήκη είδους',CART_ITEM_REMOVE:'Αφαίρεση είδους'})[v]||'Καταχωρημένη εγγραφή';
export const businessStatusLabel=v=>({ACTIVE:'Ενεργός',INACTIVE:'Ανενεργός',OPEN:'Ανοικτή',CLOSED:'Κλειστή',DRAFT:'Πρόχειρο',APPROVED:'Εγκεκριμένο',NEW:'Νέο',INVOICED:'Τιμολογημένο',CANCELLED:'Ακυρωμένο',IN_REVIEW:'Προς έλεγχο',REGISTERED:'Καταχωρημένο',CONFIRMED:'Επιβεβαιωμένο',PENDING_PROOF:'Αναμονή αποδεικτικού',PENDING_REVIEW:'Προς έλεγχο',DISCREPANCY:'Απόκλιση'})[v]||(v?'Καταχωρημένη κατάσταση':'—');

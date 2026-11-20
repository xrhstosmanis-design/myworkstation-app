export const observerLogisticsPrefix='/api/backoffice-staff/company/operations-status';
export const observerLogisticsActions=Object.freeze([
 {key:'connector-store-options.read',label:'Επιλογές καταστημάτων Observer',module:'CONNECTOR_RBS',requires:[]},
 {key:'observer-status.read',label:'Κατάσταση και τεχνικές μετρήσεις Observer',module:'CONNECTOR_RBS',requires:['connector-store-options.read']},
 {key:'observer-events.read',label:'Τεχνικές παρατηρήσεις Observer',module:'CONNECTOR_RBS',requires:['connector-store-options.read']},
 {key:'logistics-readiness.read',label:'Κατάσταση σύνδεσης παρόχου και αναμονών',module:'INVENTORY',requires:[]},
 {key:'dispatch-notes.read',label:'Δελτία αποστολής και γραμμές',module:'INVENTORY',requires:['stores.read']},
 {key:'provider-outbox.read',label:'Καταχωρισμένη αναμονή παραστατικών παρόχου',module:'INVENTORY',requires:[]}
].map(action=>({...action,description:action.key==='dispatch-notes.read'?'Βλέπει παραλήπτες, ΑΦΜ, διευθύνσεις, καταστάσεις και γραμμές δελτίων αποστολής. Χωρίς αποθήκευση, οριστικοποίηση, ακύρωση ή αποστολή.':action.key==='provider-outbox.read'?'Βλέπει αναμονές παρόχου, επιχειρησιακό κλειδί αναφοράς δελτίου και σύντομο αποτύπωμα ελέγχου, χωρίς payload, διαπιστευτήρια ή αποστολή.':'Βλέπει μόνο καταχωρισμένα στοιχεία και τεχνική κατάσταση. Χωρίς σύνδεση συσκευών, διαπιστευτήρια, εντολές, αποστολή, επικύρωση ή αλλαγές.'})));
export function observerLogisticsRequest(method,path){
 if(method!=='GET'||typeof path!=='string'||!path.startsWith(observerLogisticsPrefix+'/'))return null;
 const suffix=path.slice(observerLogisticsPrefix.length),fixed={'/stores':'connector-store-options.read','/observer-status':'observer-status.read','/observer-events':'observer-events.read','/readiness':'logistics-readiness.read','/dispatch-notes':'dispatch-notes.read','/outbox':'provider-outbox.read'};
 if(fixed[suffix])return {capability:fixed[suffix],detailId:null};
 const match=/^\/dispatch-notes\/([A-Za-z0-9_-]{1,160})$/.exec(suffix);
 return match?{capability:'dispatch-notes.read',detailId:match[1]}:null;
}
export const observerDeviceFields={id:'text',storeId:'text',storeName:'text',deviceName:'text?',version:'text?',status:'text',lastSeenAt:'date?',observerMode:'text',eventCount:'integer',lastObservedAt:'date?',online:'boolean'};
export const observerEventFields={id:'text',source:'text?',direction:'text',payloadHashPrefix:'text?',byteLength:'integer?',messageType:'text?',success:'boolean',observedAt:'date?',createdAt:'date',deviceName:'text?',storeId:'text',storeName:'text'};
export const dispatchNoteFields={id:'text',documentNumber:'text',storeId:'text',storeName:'text',direction:'text',recipientName:'text',recipientTaxId:'text?',destinationAddress:'text',purpose:'text?',status:'text',fiscalStatus:'text',dispatchedAt:'date?',finalizedAt:'date?',cancelledAt:'date?',cancellationReason:'text?',createdAt:'date'};
export const dispatchListFields={...dispatchNoteFields,lineCount:'integer',totalQuantity:'number'};
export const dispatchLineFields={id:'text',productId:'text?',description:'text',quantity:'number',unit:'text',sku:'text?'};
export const providerOutboxFields={id:'text',action:'text',idempotencyKey:'text',status:'text',payloadHashPrefix:'text',attemptCount:'integer',sandboxReference:'text?',sandboxValidatedAt:'date?',createdAt:'date',documentNumber:'text?',recipientName:'text?',documentStatus:'text?'};

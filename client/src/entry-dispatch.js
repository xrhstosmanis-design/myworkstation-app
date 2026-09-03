const path=window.location.pathname.replace(/\/+$/,'');

if(path==='/screen-recorder'){
  import('./screen-recorder-entry.jsx');
}else if(path==='/platform-admin/invoice-learning-lab'){
  import('./invoice-learning-server-sync-bootstrap.js')
    .then(()=>import('./invoice-learning-lab-bootstrap.js'))
    .then(()=>import('./invoice-learning-azure-only-reader.js'))
    .then(()=>import('./invoice-learning-taxonomy-bootstrap.js'))
    .then(()=>import('./invoice-learning-pending-barcodes-bootstrap.js'))
    .then(()=>import('./invoice-learning-generate-barcode-extension.js'))
    .then(()=>import('./invoice-learning-product-form-selects-extension.js'))
    .then(()=>import('./invoice-learning-catalog-publication.js'))
    .catch(error=>{
      console.error('Invoice Learning Lab bootstrap failed.',error);
    });
}else{
  import('./entry.jsx');
}

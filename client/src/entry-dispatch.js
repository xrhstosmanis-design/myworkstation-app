const path=window.location.pathname.replace(/\/+$/,'');

if(path==='/platform-admin/invoice-learning-lab'){
  (async()=>{
    await import('./invoice-learning-server-sync-bootstrap.js');
    await import('./invoice-learning-lab-bootstrap.js');
    await import('./invoice-learning-taxonomy-bootstrap.js');
  })().catch(error=>{
    console.error('Invoice Learning Lab bootstrap failed.',error);
  });
}else{
  import('./entry.jsx');
}

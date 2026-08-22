const path=window.location.pathname.replace(/\/+$/,'');
if(path==='/platform-admin/invoice-learning-lab'){
  await import('./invoice-learning-server-sync-bootstrap.js');
  await import('./invoice-learning-lab-bootstrap.js');
}else{
  import('./entry.jsx');
}

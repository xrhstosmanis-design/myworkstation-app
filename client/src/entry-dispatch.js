const path=window.location.pathname.replace(/\/+$/,'');
if(path==='/platform-admin/invoice-learning-lab'){
  import('./invoice-learning-lab-bootstrap.js');
}else{
  import('./entry.jsx');
}

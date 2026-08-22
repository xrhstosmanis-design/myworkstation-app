if(window.location.pathname.replace(/\/+$/,'')==='/platform-admin'){
  const launch=async()=>{
    history.replaceState({},'', '/platform-admin/invoice-learning-lab');
    await import(`/src/invoice-learning-lab-bootstrap.js?run=${Date.now()}`);
  };
  const install=()=>{
    if(document.querySelector('[data-invoice-learning-lab-launch]'))return;
    const host=document.querySelector('.platform-title-actions')||document.body;
    const button=document.createElement('button');button.type='button';button.dataset.invoiceLearningLabLaunch='1';button.textContent='🧠 Invoice Learning Lab';button.style.cssText='padding:10px 14px;border:0;border-radius:9px;background:#7c3aed;color:#fff;font-weight:900;cursor:pointer;box-shadow:0 6px 18px #7c3aed33';button.onclick=launch;host.appendChild(button);
  };
  const timer=setInterval(install,500);install();setTimeout(()=>clearInterval(timer),30000);
  if(window.location.hash==='#invoice-learning-lab')setTimeout(launch,700);
}

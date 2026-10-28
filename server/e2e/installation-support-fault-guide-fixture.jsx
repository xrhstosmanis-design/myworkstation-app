import React from 'react';
import {createRoot} from 'react-dom/client';
import InstallationSupportProfile from '../../client/src/components/platform/InstallationSupportProfile.jsx';

// Synthetic data only. The popup remains real; only the modal print dialog is
// intercepted so CDP can independently render the same popup to PDF.
const originalOpen=window.open.bind(window);
window.open=(...args)=>{
  const popup=originalOpen(...args);
  if(popup) popup.print=()=>{window.__guidePrintInvoked=true};
  return popup;
};
createRoot(document.getElementById('root')).render(<>
  <p>PRIVATE-OTHER-STORE-SENTINEL</p>
  <InstallationSupportProfile company={{name:'Δοκιμαστική Εταιρεία'}} store={{name:'Δοκιμαστικό Κατάστημα',city:'Αθήνα',responsibleEmail:'synthetic@example.invalid',password:'SECRET-SENTINEL'}} onClose={()=>{}} />
</>);

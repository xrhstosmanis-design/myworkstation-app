import React from 'react';
import {createRoot} from 'react-dom/client';
import WholesaleApp from './components/wholesale/WholesaleApp.jsx';
import './components/wholesale/wholesale-app.css';
import './components/commerce/wholesale-b2b.css';
createRoot(document.getElementById('wholesale-root')).render(<WholesaleApp/>);

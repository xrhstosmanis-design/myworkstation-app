import React from 'react';
import {createRoot} from 'react-dom/client';
import B2BPortal from './components/b2b/B2BPortal.jsx';
import './components/b2b/b2b-portal.css';
const match=location.pathname.match(/^\/b2b\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
createRoot(document.getElementById('b2b-root')).render(match&&match[1].length>=3&&match[1].length<=63?<B2BPortal slug={match[1]}/>:<p>Άνοιξε τον σύνδεσμο χονδρικής της επιχείρησής σου.</p>);

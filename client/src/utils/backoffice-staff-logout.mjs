import {readBackofficeContext} from './backofficeSessionBoundary.mjs';

// Retire only this personal session. POS preferences/offline state and a
// different session accepted while logout was pending belong to their callers.
export async function logoutBackofficeStaff({storage,request,onLogout}){
  const initial=readBackofficeContext(storage).key;
  try{await request('/api/auth/logout',{method:'POST',body:'{}'})}catch{}
  if(readBackofficeContext(storage).key!==initial)return false;
  storage.removeItem('token');storage.removeItem('user');onLogout();
  return true;
}

import assert from 'node:assert/strict';
export function operatorSessionFixture(){
 const tokens=new Set();
 return {
  remember(path,response,payload){if(path.startsWith('/api/operators/login/')&&response.ok&&payload?.token)tokens.add(payload.token)},
  async logout(base){
   assert.ok(['localhost','127.0.0.1','::1'].includes(new URL(base).hostname),'Session fixture is isolated only');
   assert.equal(process.env.NODE_ENV,'test');
   for(const token of [...tokens].reverse()){
    const response=await fetch(base+'/api/operators/logout',{method:'POST',headers:{authorization:'Bearer '+token}}),payload=await response.json();
    assert.ok(response.status===200||(response.status===401&&['STORE_OPERATOR_SESSION_REVOKED','AUTH_TOKEN_EXPIRED','STORE_OPERATOR_ROLE_CHANGED','STORE_OPERATOR_SESSION_REQUIRED'].includes(payload.code)),JSON.stringify({status:response.status,payload}));
   }
   tokens.clear();
  }
 };
}

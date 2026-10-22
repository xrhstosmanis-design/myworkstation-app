import {aiOwnerWalletRepository} from '../services/ai-owner-wallet-runtime.js';
import {createWalletNotificationDispatcher} from '../services/ai-owner-wallet-notifications.js';
let timer,running=false;
export function startAiOwnerWalletNotices(){
  if(timer||process.env.AI_OWNER_WALLET_ENABLED!=='true'||process.env.AI_OWNER_WALLET_EMAIL_ENABLED!=='true')return;
  const drain=createWalletNotificationDispatcher({repository:aiOwnerWalletRepository});
  const tick=async()=>{if(running)return;running=true;try{await drain()}catch{console.warn('AI wallet notification queue needs review')}finally{running=false}};
  timer=setInterval(tick,60000);timer.unref?.();
}

import {auth} from '../middleware/auth.js';
import express from 'express';
import {nativeStores,nativePushStatus,registerNativePush,revokeNativePush} from '../native-chat-push.mjs';
const router=express.Router();
for(const path of ['/mobile/native-push','/stores/:storeId/native-push']){
 router.get(path,auth,async(req,res,next)=>{try{await nativeStores(req.user,req.params.storeId);res.set('Cache-Control','no-store');res.json(nativePushStatus());}catch(e){next(e)}});
 router.post(path,auth,async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await registerNativePush(req.user,req.body?.token,String(req.headers.authorization||'').replace(/^Bearer /,''),req.params.storeId,req.body?.notificationVersion,req.body?.platform));}catch(e){next(e)}});
 router.delete(path,auth,async(req,res,next)=>{try{await nativeStores(req.user,req.params.storeId);res.json(await revokeNativePush(req.user,req.body?.token));}catch(e){next(e)}});
}
export default router;

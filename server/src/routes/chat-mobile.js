import express from "express";
import {mobileChatStores,saveMobilePush} from "../chat-mobile.mjs";
import {storeChatPushPublicKey} from "../store-chat-push.js";
const router=express.Router();
router.get("/stores",async(req,res,next)=>{try{res.set("Cache-Control","no-store");res.json(await mobileChatStores(req.user))}catch(e){next(e)}});
router.get("/push-key",async(req,res,next)=>{try{await mobileChatStores(req.user);res.set("Cache-Control","no-store");res.json({publicKey:await storeChatPushPublicKey()})}catch(e){next(e)}});
router.post("/push-subscription",async(req,res,next)=>{try{res.json({ok:true,...await saveMobilePush(req.user,req.body?.subscription)})}catch(e){next(e)}});
export default router;
